/**
 * 지식 허브(두뇌) 현황 API 클라이언트 — knowledge-hub-api 엣지 함수 호출
 */
import { supabase } from '../lib/supabase'

function knowledgeHubApiUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '')
  if (!base) throw new Error('VITE_SUPABASE_URL 이 설정되지 않았습니다.')
  return `${base}/functions/v1/knowledge-hub-api`
}

async function callHubApi<T>(body: Record<string, unknown>): Promise<T> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!anonKey) throw new Error('VITE_SUPABASE_ANON_KEY 가 없습니다.')

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('로그인 세션이 없습니다.')

  const res = await fetch(knowledgeHubApiUrl(), {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const payload = (await res.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  if (!res.ok) {
    throw new Error(String(payload.error ?? `지식 허브 API 오류 (${res.status})`))
  }
  return payload as T
}

export type KnowledgeHubStats = {
  kbDocuments: number
  companyChunks: number
  companyChunksNoEmbedding: number
  graphNodes: number
  graphNodesEmbedded: number
  graphNodesNoEmbedding: number
  /** 표준(Gemini@1536)이 아닌 레거시·미임베딩 노드 수 — 재임베딩 대상 */
  graphNodesLegacyEmbedding: number
  standardEmbeddingModel: string
  notebookChunks: number
  memoryRows: number
  queue: {
    pending: number
    processing: number
    done: number
    failed: number
  }
}

export async function fetchKnowledgeHubStats(): Promise<KnowledgeHubStats> {
  const payload = await callHubApi<{ ok: boolean; stats: KnowledgeHubStats }>({
    action: 'stats',
  })
  return payload.stats
}

export type IngestQueueRow = {
  id: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  retryCount: number
  errorMessage: string | null
  createdAt: string
  processedAt: string | null
  fileName: string
  category: string | null
}

export async function fetchIngestQueue(limit = 50): Promise<IngestQueueRow[]> {
  const payload = await callHubApi<{ ok: boolean; rows: IngestQueueRow[] }>({
    action: 'queue',
    limit,
  })
  return payload.rows
}

export type RetryResult = {
  resetCount: number
  worker: Record<string, unknown>
}

export async function retryFailedIngest(queueId?: string): Promise<RetryResult> {
  const payload = await callHubApi<{
    ok: boolean
    resetCount: number
    worker: Record<string, unknown>
  }>({ action: 'retry', ...(queueId ? { queueId } : {}) })
  return { resetCount: payload.resetCount, worker: payload.worker }
}

export type ReembedResult = {
  processed: number
  failed: number
  remaining: number
}

/** 레거시 노드를 표준 Gemini@1536 임베딩으로 배치 재임베딩 (호출당 limit건) */
export async function reembedLegacyNodes(limit = 20): Promise<ReembedResult> {
  const payload = await callHubApi<{
    ok: boolean
    processed: number
    failed: number
    remaining: number
  }>({ action: 'reembed_nodes', limit })
  return {
    processed: payload.processed,
    failed: payload.failed,
    remaining: payload.remaining,
  }
}

export type SearchTestMatch = {
  fileName: string
  chunkIndex: number
  similarity: number
  snippet: string
}

export async function runSearchTest(query: string): Promise<SearchTestMatch[]> {
  const payload = await callHubApi<{ ok: boolean; matches: SearchTestMatch[] }>({
    action: 'search_test',
    query,
  })
  return payload.matches
}
