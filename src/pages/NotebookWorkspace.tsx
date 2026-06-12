import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useAuth } from '../components/auth/useAuth'
import { NotebookChatPanel } from '../components/notebook/NotebookChatPanel'
import { NotebookRightPanel } from '../components/notebook/NotebookRightPanel'
import { NotebookSourcesPanel } from '../components/notebook/NotebookSourcesPanel'
import { supabase } from '../lib/supabase'
import {
  fetchDocumentSummaryForChat,
  fetchNotebookGraphData,
} from '../services/notebook/notebookGraph'
import { invokeProcessDocument } from '../services/notebook/processDocumentClient'
import {
  invokeNotebookChat,
  listNotebookSources,
  mergeNotebookNotesReport,
} from '../services/ai/notebookRag'
import { uploadUserDocument } from '../services/integrations/workspace-tools'
import type { NotebookGraphData } from '../types/notebook-graph'
import type {
  NotebookChatMessage,
  NotebookPinnedNote,
  NotebookSource,
} from '../types/notebook'

function newId(): string {
  return crypto.randomUUID()
}

function firstLineTitle(text: string, fallback = 'AI 답변 메모'): string {
  const line = text.trim().split('\n')[0]?.trim() ?? ''
  if (!line) return fallback
  return line.length > 48 ? `${line.slice(0, 48)}…` : line
}

const EMPTY_GRAPH: NotebookGraphData = { nodes: [], links: [] }

export function NotebookWorkspace() {
  const { profile } = useAuth()
  const abortRef = useRef<AbortController | null>(null)

  const [sources, setSources] = useState<NotebookSource[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(true)
  const [sourcesError, setSourcesError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [processingDocId, setProcessingDocId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [messages, setMessages] = useState<NotebookChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const [notes, setNotes] = useState<NotebookPinnedNote[]>([])
  const [merging, setMerging] = useState(false)
  const [mergePreview, setMergePreview] = useState<string | null>(null)

  const [graphData, setGraphData] = useState<NotebookGraphData>(EMPTY_GRAPH)
  const [graphLoading, setGraphLoading] = useState(false)

  const preferredAi = useMemo(() => {
    const p = profile?.preferred_ai?.trim()
    return p && p.length > 0 ? p : 'gemini'
  }, [profile?.preferred_ai])

  const tokenLimit = profile?.token_limit ?? 0
  const currentTokenUsage = profile?.current_token_usage ?? 0

  const loadSources = useCallback(async () => {
    setSourcesLoading(true)
    setSourcesError(null)
    const res = await listNotebookSources(supabase, profile?.id)
    if (!res.ok) {
      setSourcesError(res.message)
      setSources([])
    } else {
      setSources(res.sources)
    }
    setSourcesLoading(false)
  }, [profile?.id])

  const loadGraph = useCallback(async () => {
    if (selectedIds.size === 0) {
      setGraphData(EMPTY_GRAPH)
      return
    }
    setGraphLoading(true)
    try {
      const data = await fetchNotebookGraphData(
        supabase,
        sources,
        [...selectedIds],
      )
      setGraphData(data)
    } catch {
      setGraphData(EMPTY_GRAPH)
    } finally {
      setGraphLoading(false)
    }
  }, [sources, selectedIds])

  useEffect(() => {
    queueMicrotask(() => void loadSources())
  }, [loadSources])

  useEffect(() => {
    if (sources.length === 0 || selectedIds.size > 0) return
    setSelectedIds(new Set(sources.slice(0, Math.min(3, sources.length)).map((s) => s.id)))
  }, [sources, selectedIds.size])

  useEffect(() => {
    queueMicrotask(() => void loadGraph())
  }, [loadGraph])

  const toggleSource = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAllSources = useCallback(() => {
    setSelectedIds(new Set(sources.map((s) => s.id)))
  }, [sources])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true)
      setSourcesError(null)
      try {
        const uploaded = await uploadUserDocument(file, 'notebook workspace')
        setProcessingDocId(uploaded.document.id)
        const proc = await invokeProcessDocument(uploaded.document.id, 'user_upload')
        if (!proc.ok) {
          console.warn('[notebook] process-document', proc.message)
        }
        await loadSources()
        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.add(uploaded.document.id)
          return next
        })
      } catch (e) {
        setSourcesError(
          e instanceof Error ? e.message : '문서 업로드에 실패했습니다.',
        )
      } finally {
        setUploading(false)
        setProcessingDocId(null)
      }
    },
    [loadSources],
  )

  const injectContextToDraft = useCallback((block: string) => {
    setDraft((prev) => {
      const trimmed = prev.trim()
      if (!trimmed) return block
      if (trimmed.includes(block.slice(0, 40))) return prev
      return `${trimmed}\n\n${block}`
    })
  }, [])

  const handleDocumentSelect = useCallback(
    async (documentId: string, label: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.add(documentId)
        return next
      })
      const src = sources.find((s) => s.id === documentId)
      const summary = await fetchDocumentSummaryForChat(
        supabase,
        documentId,
        src?.fileName ?? label,
      )
      injectContextToDraft(summary)
    },
    [sources, injectContextToDraft],
  )

  const handleEntitySelect = useCallback(
    (entityLabel: string, entityType?: string) => {
      const block = `【핵심 개체: ${entityLabel}${entityType ? ` (${entityType})` : ''}】\n이 키워드와 연결된 문서 출처를 기준으로 답변해 주세요.`
      injectContextToDraft(block)
    },
    [injectContextToDraft],
  )

  const handleSubmit = useCallback(async () => {
    const prompt = draft.trim()
    if (!prompt || streaming || selectedIds.size === 0) return

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const userMsg: NotebookChatMessage = {
      id: newId(),
      role: 'user',
      content: prompt,
      createdAt: new Date().toISOString(),
    }
    const assistantId = newId()
    setMessages((prev) => [
      ...prev,
      userMsg,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
      },
    ])
    setDraft('')
    setStreaming(true)
    setChatError(null)

    let assistantText = ''
    let citations = undefined as NotebookChatMessage['citations']

    const result = await invokeNotebookChat({
      supabase,
      prompt,
      preferredAi,
      tokenLimit,
      currentTokenUsage,
      sources,
      selectedSourceIds: [...selectedIds],
      signal: ac.signal,
      onTextDelta: (delta) => {
        assistantText += delta
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: assistantText } : m,
          ),
        )
      },
      onCitations: (c) => {
        citations = c
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, citations: c } : m,
          ),
        )
      },
    })

    setStreaming(false)
    if (!result.ok) {
      if (ac.signal.aborted) return
      setChatError(result.message)
      setMessages((prev) => prev.filter((m) => m.id !== assistantId))
      return
    }

    if (citations?.length) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, citations: result.citations } : m,
        ),
      )
    }

    void loadGraph()
  }, [
    draft,
    streaming,
    selectedIds,
    preferredAi,
    tokenLimit,
    currentTokenUsage,
    sources,
    loadGraph,
  ])

  const handlePinMessage = useCallback((message: NotebookChatMessage) => {
    const body = message.content.trim()
    if (!body) return
    const note: NotebookPinnedNote = {
      id: newId(),
      title: firstLineTitle(body),
      body,
      sourceMessageId: message.id,
      citations: message.citations,
      pinnedAt: new Date().toISOString(),
    }
    setNotes((prev) => [note, ...prev])
  }, [])

  const handleRemoveNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const handleMergeReport = useCallback(async () => {
    if (notes.length === 0 || merging) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setMerging(true)
    setMergePreview('')
    let text = ''

    const result = await mergeNotebookNotesReport({
      supabase,
      notes: notes.map((n) => ({ title: n.title, body: n.body })),
      preferredAi,
      tokenLimit,
      currentTokenUsage,
      signal: ac.signal,
      onTextDelta: (delta) => {
        text += delta
        setMergePreview(text)
      },
    })

    setMerging(false)
    if (!result.ok && !ac.signal.aborted) {
      window.alert(result.message)
    }
  }, [
    notes,
    merging,
    preferredAi,
    tokenLimit,
    currentTokenUsage,
  ])

  return (
    <div className="notebook-workspace flex min-h-0 flex-1 flex-col bg-[#EBE9E4] dark:bg-stone-950">
      <header className="shrink-0 border-b border-stone-200/90 bg-[#FAF9F6] px-4 py-3 dark:border-stone-800 dark:bg-stone-900 md:px-6">
        <h1 className="text-lg font-bold text-stone-900 dark:text-stone-50">
          📓 노트북 워크스페이스
        </h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          출처 문서를 선택하고, 인용·지식 지도로 연결된 답변을 받으세요.
        </p>
        {processingDocId ? (
          <p className="mt-1 text-xs text-orange-800 dark:text-orange-200">
            문서 파싱·관계 추출 중…
          </p>
        ) : null}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-4">
        <div className="min-h-[14rem] lg:col-span-1">
          <NotebookSourcesPanel
            sources={sources}
            selectedIds={selectedIds}
            loading={sourcesLoading}
            error={sourcesError}
            uploading={uploading}
            onToggle={toggleSource}
            onSelectAll={selectAllSources}
            onClearSelection={clearSelection}
            onUpload={(file) => void handleUpload(file)}
            onRefresh={() => void loadSources()}
          />
        </div>

        <div className="flex min-h-[20rem] min-h-0 flex-col lg:col-span-2">
          <NotebookChatPanel
            messages={messages}
            draft={draft}
            streaming={streaming}
            selectedCount={selectedIds.size}
            error={chatError}
            onDraftChange={setDraft}
            onSubmit={() => void handleSubmit()}
            onPinMessage={handlePinMessage}
          />
        </div>

        <div className="flex min-h-[14rem] min-h-0 flex-col lg:col-span-1">
          <NotebookRightPanel
            graphData={graphData}
            graphLoading={graphLoading}
            notes={notes}
            merging={merging}
            mergePreview={mergePreview}
            onRemoveNote={handleRemoveNote}
            onMergeReport={() => void handleMergeReport()}
            onDocumentSelect={(id, label) => void handleDocumentSelect(id, label)}
            onEntitySelect={handleEntitySelect}
          />
        </div>
      </div>
    </div>
  )
}
