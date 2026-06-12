import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  NotebookChunkCitation,
  NotebookSource,
  NotebookSourceKind,
} from '../../types/notebook'
import type { ChatCitationSource } from '../../types/chat-citations'
import { mergeCitationSources } from '../../utils/citationMarkers'
import { invokeAiChat } from './invoke-chat'

export type { NotebookChunkCitation } from '../../types/notebook'

export type NotebookRetrieveResult = {
  chunks: NotebookChunkCitation[]
  usedVectorSearch: boolean
  fallbackReason?: string
}

const NOTEBOOK_DOC_EXT =
  /\.(pdf|hwp|hwpx|docx?|pptx?|xlsx?|txt|md)$/i

const NOTEBOOK_UPLOAD_KINDS = new Set(['pdf', 'hwp', 'hwpx', 'other'])

function isNotebookFileName(name: string): boolean {
  return NOTEBOOK_DOC_EXT.test(name.trim())
}

function truncateSnippet(text: string, max = 200): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

function chunkCitationsToChatSources(
  chunks: NotebookChunkCitation[],
): ChatCitationSource[] {
  return chunks.map((c) => ({
    index: c.index,
    title: c.filename,
    snippet: c.pageNumber
      ? `p.${c.pageNumber} · ${truncateSnippet(c.matchedText, 140)}`
      : truncateSnippet(c.matchedText, 160),
    sourceType: 'document' as const,
    id: c.chunkId,
  }))
}

type DocumentChunkRow = {
  id: string
  document_id: string
  content: string
  page_number: number | null
  chunk_index?: number | null
  filename?: string | null
}

/** document_chunks + match_document_chunks RPC (마이그레이션 적용 시) */
async function tryVectorRetrieve(
  client: SupabaseClient,
  documentIds: string[],
  query: string,
  matchCount = 8,
): Promise<NotebookChunkCitation[] | null> {
  if (documentIds.length === 0) return []

  const { data: rpcData, error: rpcError } = await client.rpc(
    'match_document_chunks',
    {
      query_text: query,
      document_ids: documentIds,
      match_count: matchCount,
      similarity_threshold: 0.2,
    },
  )

  if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
    return (rpcData as DocumentChunkRow[]).map((row, i) => ({
      index: i + 1,
      chunkId: String(row.id),
      documentId: String(row.document_id),
      filename: String(row.filename ?? '문서'),
      pageNumber:
        typeof row.page_number === 'number' ? row.page_number : null,
      matchedText: truncateSnippet(String(row.content ?? '')),
    }))
  }

  if (rpcError && !/match_document_chunks|does not exist|42883/i.test(rpcError.message)) {
    console.warn('[notebookRag] match_document_chunks', rpcError.message)
  }

  const { data: rows, error: tableError } = await client
    .from('document_chunks')
    .select(
      'id, document_id, content, page_number, chunk_index, filename, source_kind',
    )
    .in('document_id', documentIds)
    .limit(matchCount * 3)

  if (tableError) {
    if (/document_chunks|does not exist|42P01/i.test(tableError.message)) {
      return null
    }
    console.warn('[notebookRag] document_chunks', tableError.message)
    return null
  }

  if (!rows?.length) return []

  const q = query.toLowerCase()
  const scored = (rows as DocumentChunkRow[])
    .map((row) => {
      const content = String(row.content ?? '')
      const lower = content.toLowerCase()
      const score = q
        .split(/\s+/)
        .filter(Boolean)
        .reduce((s, term) => (lower.includes(term) ? s + 1 : s), 0)
      const filename = row.filename?.trim() || '문서'
      return { row, score, filename }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, matchCount)

  return scored.map(({ row, filename }, i) => ({
    index: i + 1,
    chunkId: String(row.id),
    documentId: String(row.document_id),
    filename,
    pageNumber:
      typeof row.page_number === 'number' ? row.page_number : null,
    matchedText: truncateSnippet(String(row.content ?? '')),
  }))
}

function buildStubChunks(
  sources: NotebookSource[],
  query: string,
): NotebookChunkCitation[] {
  return sources.slice(0, 6).map((src, i) => ({
    index: i + 1,
    chunkId: `stub-${src.id}-${i}`,
    documentId: src.id,
    filename: src.fileName,
    pageNumber: i + 1,
    matchedText: truncateSnippet(
      `「${src.fileName}」에서 "${query.slice(0, 80)}"와 관련된 구간입니다. ` +
        'document_chunks 테이블이 연결되면 실제 본문 인용으로 대체됩니다.',
    ),
  }))
}

export async function listNotebookSources(
  client: SupabaseClient,
  userId?: string,
): Promise<
  { ok: true; sources: NotebookSource[] } | { ok: false; message: string }
> {
  const sources: NotebookSource[] = []

  const kb = await client
    .from('knowledge_base')
    .select('id, file_name, category, created_at')
    .order('created_at', { ascending: false })
    .limit(80)

  if (!kb.error && kb.data) {
    for (const row of kb.data) {
      const fileName = String(row.file_name ?? '').trim()
      if (!fileName || !isNotebookFileName(fileName)) continue
      sources.push({
        id: String(row.id),
        kind: 'knowledge_base',
        fileName,
        category: row.category ? String(row.category) : undefined,
        createdAt: String(row.created_at),
      })
    }
  }

  if (userId) {
    const up = await client
      .from('user_uploaded_documents')
      .select('id, original_name, kind, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(40)

    if (!up.error && up.data) {
      for (const row of up.data) {
        const fileName = String(row.original_name ?? '').trim()
        const kind = String(row.kind ?? 'other')
        if (
          !fileName ||
          (!isNotebookFileName(fileName) && !NOTEBOOK_UPLOAD_KINDS.has(kind))
        ) {
          continue
        }
        sources.push({
          id: String(row.id),
          kind: 'user_upload',
          fileName,
          createdAt: String(row.created_at),
        })
      }
    }
  }

  const seen = new Set<string>()
  const deduped = sources.filter((s) => {
    const key = `${s.kind}:${s.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { ok: true, sources: deduped }
}

export async function retrieveNotebookContext(
  client: SupabaseClient,
  sourceIds: string[],
  sources: NotebookSource[],
  query: string,
): Promise<NotebookRetrieveResult> {
  const selected = sources.filter((s) => sourceIds.includes(s.id))
  if (selected.length === 0) {
    return { chunks: [], usedVectorSearch: false, fallbackReason: 'no_sources' }
  }

  const vector = await tryVectorRetrieve(client, sourceIds, query)
  if (vector && vector.length > 0) {
    return {
      chunks: vector.map((c, i) => ({ ...c, index: i + 1 })),
      usedVectorSearch: true,
    }
  }

  return {
    chunks: buildStubChunks(selected, query),
    usedVectorSearch: false,
    fallbackReason: vector === null ? 'document_chunks_unavailable' : 'no_matches',
  }
}

export function formatNotebookContextForPrompt(
  chunks: NotebookChunkCitation[],
): string {
  if (chunks.length === 0) {
    return '(선택된 출처에서 검색된 본문이 없습니다. 일반 지식으로 답하되, 출처 번호는 붙이지 마세요.)'
  }

  return chunks
    .map(
      (c) =>
        `[${c.index}] 파일: ${c.filename}` +
        (c.pageNumber ? ` · p.${c.pageNumber}` : '') +
        `\n인용: ${c.matchedText}`,
    )
    .join('\n\n')
}

const NOTEBOOK_SYSTEM_PREFIX = `당신은 NotebookLM 스타일의 사내 문서 분석 어시스턴트입니다.
아래 "선택된 출처" 본문만을 우선 근거로 답변하세요.
본문에 인용할 때는 반드시 검색 결과 순서와 동일한 [1], [2], [3] … 번호를 문장 끝에 붙이세요.
출처에 없는 내용은 추측하지 말고 "선택된 문서에서 확인되지 않았습니다"라고 명시하세요.`

export type InvokeNotebookChatParams = {
  supabase: SupabaseClient
  prompt: string
  preferredAi: string
  tokenLimit: number
  currentTokenUsage: number
  sources: NotebookSource[]
  selectedSourceIds: string[]
  onTextDelta: (delta: string) => void
  onCitations?: (citations: NotebookChunkCitation[]) => void
  signal?: AbortSignal
}

export async function invokeNotebookChat(
  params: InvokeNotebookChatParams,
): Promise<
  | { ok: true; citations: NotebookChunkCitation[] }
  | { ok: false; message: string; httpStatus?: number }
> {
  const retrieve = await retrieveNotebookContext(
    params.supabase,
    params.selectedSourceIds,
    params.sources,
    params.prompt,
  )

  const contextBlock = formatNotebookContextForPrompt(retrieve.chunks)
  const sourceNames = params.sources
    .filter((s) => params.selectedSourceIds.includes(s.id))
    .map((s) => s.fileName)
    .join(', ')

  const enrichedPrompt = `${NOTEBOOK_SYSTEM_PREFIX}

## 선택된 출처 파일
${sourceNames || '(없음)'}

## 검색된 본문
${contextBlock}

## 사용자 질문
${params.prompt.trim()}`

  const chatCitations = chunkCitationsToChatSources(retrieve.chunks)
  params.onCitations?.(retrieve.chunks)

  let assistantText = ''

  const result = await invokeAiChat({
    supabase: params.supabase,
    messages: [{ role: 'user', content: enrichedPrompt }],
    activeModel: params.preferredAi,
    tokenLimit: params.tokenLimit,
    currentTokenUsage: params.currentTokenUsage,
    onTextDelta: (delta) => {
      assistantText += delta
      params.onTextDelta(delta)
    },
    onCitationSources: (incoming) => {
      const merged = mergeCitationSources(chatCitations, incoming)
      const notebookFromChat: NotebookChunkCitation[] = merged.map((c) => {
        const existing = retrieve.chunks.find((x) => x.index === c.index)
        if (existing) return existing
        return {
          index: c.index,
          chunkId: c.id ?? `chat-${c.index}`,
          documentId: '',
          filename: c.title,
          pageNumber: null,
          matchedText: c.snippet ?? c.title,
        }
      })
      params.onCitations?.(notebookFromChat)
    },
    signal: params.signal,
  })

  if (!result.ok) {
    return result
  }

  void assistantText
  return { ok: true, citations: retrieve.chunks }
}

export type MergeNotebookNotesParams = {
  supabase: SupabaseClient
  notes: Array<{ title: string; body: string }>
  preferredAi: string
  tokenLimit: number
  currentTokenUsage: number
  onTextDelta: (delta: string) => void
  signal?: AbortSignal
}

export async function mergeNotebookNotesReport(
  params: MergeNotebookNotesParams,
): Promise<{ ok: true } | { ok: false; message: string; httpStatus?: number }> {
  if (params.notes.length === 0) {
    return { ok: false, message: '통합할 노트가 없습니다.' }
  }

  const body = params.notes
    .map(
      (n, i) =>
        `### 노트 ${i + 1}: ${n.title}\n${n.body.trim()}`,
    )
    .join('\n\n---\n\n')

  const mergePrompt = `다음은 사용자가 노트북 워크스페이스에 고정한 메모들입니다.
하나의 보고서 형식(제목, 요약, 핵심 bullet, 결론)으로 통합 요약해 주세요.
중복은 제거하고, 사실 관계는 원문에 충실하게 유지하세요.

${body}`

  return invokeAiChat({
    supabase: params.supabase,
    messages: [{ role: 'user', content: mergePrompt }],
    activeModel: params.preferredAi,
    tokenLimit: params.tokenLimit,
    currentTokenUsage: params.currentTokenUsage,
    onTextDelta: params.onTextDelta,
    signal: params.signal,
  })
}

export function notebookCitationsToChatSources(
  citations: NotebookChunkCitation[],
): ChatCitationSource[] {
  return chunkCitationsToChatSources(citations)
}

export function sourceKindLabel(kind: NotebookSourceKind): string {
  return kind === 'knowledge_base' ? '자료실' : '내 업로드'
}
