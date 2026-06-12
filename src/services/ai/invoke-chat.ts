import type { SupabaseClient } from '@supabase/supabase-js'

import type { ChatExperimentalAttachment } from '../../types/chat'
import type { ComposerToolMode } from '../../types/composer-tools'
import type { ChatCitationSource } from '../../types/chat-citations'
import {
  splitMessagesForLegacyApi,
  type ChatApiHistoryMessage,
} from '../../lib/chat-history-for-api'
import {
  extractCitationsFromSearchSimilarCasesOutput,
  mergeCitationSources,
} from '../../utils/citationMarkers'
import {
  AI_CHAT_FUNCTION,
  fetchEdgeFunction,
  resolveAiTransport,
} from './api'
import { routeAiRequest } from './router'
import { streamDifyChat } from '../difyBridge.js'

export type AiToolTraceEntry = {
  at: string
  phase: 'call' | 'result' | 'meta' | 'done' | 'error'
  toolName?: string
  toolCallId?: string
  input?: unknown
  output?: unknown
  activeToolNames?: string[]
  model?: string
  message?: string
}

export type UniverOfficeActiveTab = 'sheets' | 'docs' | 'slides'

/** UniverWorkspace aiDataSignal 프로토콜 (백엔드 inject_univer_office_data 와 1:1) */
export type UniverAiDataSignal = {
  tick?: number | string
  text?: string
  range?: string
  value?: string | number | boolean | null
  sheetName?: string
  updates?: Array<{
    range?: string
    a1Notation?: string
    value?: string | number | boolean | null
    sheetName?: string
    sheet?: string
  }>
  cells?: Array<{
    range?: string
    a1Notation?: string
    value?: string | number | boolean | null
    sheetName?: string
    sheet?: string
  }>
  map?: Record<string, string | number | boolean | null>
}

export type UniverOfficeStreamPayload = {
  activeTab?: UniverOfficeActiveTab
  aiDataSignal: UniverAiDataSignal
}

/** Dashboard → /ai-office 라우터 state 전달용 */
export type UniverOfficeNavigationState = {
  activeTab?: UniverOfficeActiveTab
  aiDataSignal: UniverAiDataSignal
  fromThreadId?: string
}

function parseUniverOfficeActiveTab(
  value: unknown,
): UniverOfficeActiveTab | undefined {
  if (value === 'sheets' || value === 'docs' || value === 'slides') {
    return value
  }
  return undefined
}

export type InvokeAiChatFailure = {
  ok: false
  message: string
  httpStatus?: number
  /** fetch/reader 가 AbortSignal 로 중단된 경우 */
  aborted?: boolean
}

export type InvokeAiChatParams = {
  supabase: SupabaseClient
  /** Edge 요청 본문 `messages` — 멀티턴 대화 전체(현재 user 턴 포함) */
  messages: ChatApiHistoryMessage[]
  /** Edge 요청 본문 `activeModel` */
  activeModel: string
  /** @deprecated `messages` 사용. direct 모드 전용 단일 턴 */
  prompt?: string
  /** @deprecated `activeModel` 사용 */
  preferredAi?: string
  /** Edge JSON: 압축된 Vision 이미지 (순수 Base64) */
  imageBase64?: string
  mimeType?: string
  /** @deprecated 멀티파트 — `imageBase64` 권장 */
  imageFiles?: File[]
  /** Edge JSON 레거시: Data URL 첨부 */
  experimental_attachments?: ChatExperimentalAttachment[]
  /** 공유 채팅: 대화 참가 검증(Edge) */
  conversationId?: string
  /** 발신 사용자(JWT sub)와 동일해야 함 — Edge 에서 검증 */
  billingUserId?: string
  /** `routeAiRequest`(direct 모드) 에만 사용. Edge 는 DB에서 조회 */
  tokenLimit: number
  currentTokenUsage: number
  /** 텍스트 스트림 델타(누적 아님, 한 번에 받은 조각) */
  onTextDelta: (delta: string) => void
  /** AI 실험실 tool_debug NDJSON 이벤트 */
  onToolTrace?: (entry: AiToolTraceEntry) => void
  /** RAG search_similar_cases 등에서 수집된 출처 */
  onCitationSources?: (sources: ChatCitationSource[]) => void
  /** inject_univer_office_data NDJSON `{ type: "univer_office" }` 이벤트 */
  onUniverOffice?: (payload: UniverOfficeStreamPayload) => void
  /** 실제 호출에 사용된 모델 ID (Edge 응답 헤더) */
  onModelUsed?: (modelId: string) => void
  signal?: AbortSignal
  /** Canvas 모드 — Edge `ai-chat` 시스템 프롬프트 오버레이 */
  composerTool?: ComposerToolMode | null
  /** [인터넷 검색] 토글 — Edge 휴리스틱·강제 웹 검색 라우팅 */
  internetSearchEnabled?: boolean
  /** 관리자 AI 실험실 — Edge 가 관리자 세션에서만 시스템 프롬프트 오버레이를 적용합니다. */
  experimental_lab?: {
    system_prompt: string
    system_prompt_mode?: 'append' | 'replace'
    /** true 이면 NDJSON 스트림으로 tool 호출 trace 를 함께 수신 */
    tool_debug?: boolean
  }
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

async function invokeViaEdge(
  params: InvokeAiChatParams,
): Promise<{ ok: true } | InvokeAiChatFailure> {
  const {
    data: { session },
  } = await params.supabase.auth.getSession()
  if (!session) {
    return { ok: false, message: '로그인 세션이 없습니다. 다시 로그인해 주세요.' }
  }

  const hasBase64Image =
    typeof params.imageBase64 === 'string' && params.imageBase64.trim().length > 0
  const useMultipart =
    !hasBase64Image && !!(params.imageFiles && params.imageFiles.length > 0)

  const activeModel =
    params.activeModel?.trim() ||
    params.preferredAi?.trim() ||
    'gemini-2.5-flash'
  const apiMessages =
    params.messages?.length > 0
      ? params.messages
      : params.prompt?.trim()
        ? [{ role: 'user' as const, content: params.prompt.trim() }]
        : []

  if (apiMessages.length === 0) {
    return { ok: false, message: '전송할 메시지가 없습니다.' }
  }

  if (activeModel === 'dify-ax') {
    return new Promise((resolve) => {
      const lastUserContent =
        [...apiMessages].reverse().find((m) => m.role === 'user')?.content || ''
      streamDifyChat(
        {
          query: lastUserContent,
          user: params.billingUserId || session.user.id,
          conversationId: params.conversationId || '',
          supabaseToken: session.access_token,
        },
        {
          onMessage: (msg: string) => params.onTextDelta(msg),
          onError: (err: Error) => resolve({ ok: false, message: err.message }),
          onDone: () => resolve({ ok: true }),
          signal: params.signal,
        },
      ).catch((err: unknown) =>
        resolve({
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        }),
      )
    })
  }

  const { prompt: legacyPrompt, chatHistory: legacyChatHistory } =
    splitMessagesForLegacyApi(apiMessages)

  let res: Response
  try {
    if (useMultipart) {
      const fd = new FormData()
      fd.append('activeModel', activeModel)
      fd.append('preferredAi', activeModel)
      fd.append('messages', JSON.stringify(apiMessages))
      if (legacyPrompt.length > 0) {
        fd.append('prompt', legacyPrompt)
      }
      if (legacyChatHistory.length > 0) {
        fd.append('chat_history', JSON.stringify(legacyChatHistory))
      }
      if (params.internetSearchEnabled === true) {
        fd.append('internet_search_enabled', 'true')
      }
      for (const file of params.imageFiles ?? []) {
        fd.append('images', file, file.name)
      }
      res = await fetchEdgeFunction(AI_CHAT_FUNCTION, {
        method: 'POST',
        accessToken: session.access_token,
        body: fd,
        signal: params.signal,
      })
    } else {
      const body: Record<string, unknown> = {
        activeModel,
        preferredAi: activeModel,
        messages: apiMessages,
      }
      if (legacyPrompt.length > 0) {
        body.prompt = legacyPrompt
      }
      if (legacyChatHistory.length > 0) {
        body.chat_history = legacyChatHistory
      }
      if (hasBase64Image) {
        body.imageBase64 = params.imageBase64!.trim()
        body.mimeType =
          typeof params.mimeType === 'string' && params.mimeType.trim().length > 0
            ? params.mimeType.trim()
            : 'image/jpeg'
      }
      if (params.experimental_attachments?.length) {
        body.experimental_attachments = params.experimental_attachments
      }
      if (params.conversationId?.trim()) {
        body.conversationId = params.conversationId.trim()
      }
      if (params.billingUserId?.trim()) {
        body.billingUserId = params.billingUserId.trim()
      }
      if (params.composerTool === 'canvas') {
        body.composer_tool = 'canvas'
      }
      if (params.internetSearchEnabled === true) {
        body.internet_search_enabled = true
      }
      if (params.experimental_lab) {
        body.experimental_lab = {
          system_prompt: params.experimental_lab.system_prompt?.trim() ?? '',
          system_prompt_mode:
            params.experimental_lab.system_prompt_mode === 'replace'
              ? 'replace'
              : 'append',
          tool_debug: params.experimental_lab.tool_debug === true,
        }
      }
      res = await fetchEdgeFunction(AI_CHAT_FUNCTION, {
        method: 'POST',
        accessToken: session.access_token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: params.signal,
      })
    }
  } catch (error) {
    if (isAbortError(error, params.signal)) {
      return { ok: false, message: 'aborted', aborted: true }
    }
    const message =
      error instanceof Error
        ? error.message
        : 'Edge Function 호출에 실패했습니다.'
    return { ok: false, message }
  }

  if (!res.ok) {
    let msg = await res.text()
    try {
      const parsed = JSON.parse(msg) as { error?: string }
      if (parsed?.error) msg = parsed.error
    } catch {
      /* 원문 유지 */
    }
    return {
      ok: false,
      message: msg || `AI 게이트웨이 오류 (${res.status})`,
      httpStatus: res.status,
    }
  }

  const modelUsedHeader = res.headers.get('X-NH-AI-Model-Used')?.trim()
  if (modelUsedHeader) {
    params.onModelUsed?.(modelUsedHeader)
  }

  const contentType = res.headers.get('content-type') ?? ''
  const isNdjsonStream = contentType.includes('application/x-ndjson')

  if (isNdjsonStream) {
    const reader = res.body?.getReader()
    if (!reader) {
      return { ok: false, message: '응답 스트림을 열 수 없습니다.' }
    }
    const decoder = new TextDecoder()
    let buffer = ''
    let collectedCitations: ChatCitationSource[] = []
    while (true) {
      if (params.signal?.aborted) {
        await reader.cancel().catch(() => undefined)
        return { ok: false, message: 'aborted', aborted: true }
      }
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.length) continue
        try {
          const evt = JSON.parse(trimmed) as Record<string, unknown>
          if (evt.type === 'text' && typeof evt.delta === 'string') {
            params.onTextDelta(evt.delta)
          } else if (evt.type === 'citations' && Array.isArray(evt.sources)) {
            const incoming = evt.sources as ChatCitationSource[]
            collectedCitations = mergeCitationSources(collectedCitations, incoming)
            params.onCitationSources?.(collectedCitations)
          } else if (evt.type === 'tool') {
            params.onToolTrace?.({
              at: typeof evt.at === 'string' ? evt.at : new Date().toISOString(),
              phase: evt.phase === 'result' ? 'result' : 'call',
              toolName:
                typeof evt.toolName === 'string' ? evt.toolName : undefined,
              toolCallId:
                typeof evt.toolCallId === 'string'
                  ? evt.toolCallId
                  : undefined,
              input: evt.input,
              output: evt.output,
            })
            if (
              evt.phase === 'result' &&
              evt.toolName === 'search_similar_cases'
            ) {
              const extracted = extractCitationsFromSearchSimilarCasesOutput(
                evt.output,
              )
              if (extracted.length > 0) {
                collectedCitations = mergeCitationSources(
                  collectedCitations,
                  extracted,
                )
                params.onCitationSources?.(collectedCitations)
              }
            }
          } else if (evt.type === 'meta') {
            params.onToolTrace?.({
              at: new Date().toISOString(),
              phase: 'meta',
              activeToolNames: Array.isArray(evt.activeToolNames)
                ? (evt.activeToolNames as string[])
                : undefined,
              model: typeof evt.model === 'string' ? evt.model : undefined,
            })
          } else if (evt.type === 'done') {
            params.onToolTrace?.({
              at: new Date().toISOString(),
              phase: 'done',
              activeToolNames: Array.isArray(evt.activeToolNames)
                ? (evt.activeToolNames as string[])
                : undefined,
              model: typeof evt.model === 'string' ? evt.model : undefined,
            })
          } else if (evt.type === 'error') {
            params.onToolTrace?.({
              at: new Date().toISOString(),
              phase: 'error',
              message:
                typeof evt.message === 'string'
                  ? evt.message
                  : '스트림 오류',
            })
          } else if (evt.type === 'univer_office') {
            const aiDataSignal = evt.aiDataSignal
            if (aiDataSignal && typeof aiDataSignal === 'object') {
              params.onUniverOffice?.({
                activeTab: parseUniverOfficeActiveTab(evt.activeTab),
                aiDataSignal: aiDataSignal as UniverAiDataSignal,
              })
            }
          }
        } catch {
          /* NDJSON 파싱 실패 줄은 무시 */
        }
      }
    }
    if (collectedCitations.length > 0) {
      params.onCitationSources?.(collectedCitations)
    }
    return { ok: true }
  }

  const reader = res.body?.getReader()
  if (!reader) {
    return { ok: false, message: '응답 스트림을 열 수 없습니다.' }
  }

  const decoder = new TextDecoder()
  while (true) {
    if (params.signal?.aborted) {
      await reader.cancel().catch(() => undefined)
      return { ok: false, message: 'aborted', aborted: true }
    }
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    if (chunk.length > 0) {
      params.onTextDelta(chunk)
    }
  }

  return { ok: true }
}

/**
 * 브라우저에서 `routeAiRequest` 를 직접 실행합니다.
 * 프로바이더 API CORS 및 API 킅 번들 노출 위험이 있으므로 로컬 실험용으로만 사용하세요.
 */
async function invokeViaRouteAiRequest(
  params: InvokeAiChatParams,
): Promise<{ ok: true } | InvokeAiChatFailure> {
  if (params.experimental_lab) {
    return {
      ok: false,
      message:
        'experimental_lab 은 Supabase Edge(ai-chat) 모드에서만 동작합니다.',
    }
  }

  if (
    params.imageBase64?.trim() ||
    params.imageFiles?.length ||
    params.experimental_attachments?.length
  ) {
    return {
      ok: false,
      message:
        '이미지 첨부·Drive 저장은 Supabase Edge(ai-chat) 모드에서만 지원됩니다. `.env` 에서 VITE_AI_TRANSPORT=edge 이거나 해당 변수를 제거해 주세요.',
    }
  }

  const activeModel =
    params.activeModel?.trim() ||
    params.preferredAi?.trim() ||
    'gemini-2.5-flash'

  const routed = await routeAiRequest({
    prompt:
      params.prompt?.trim() ||
      [...params.messages].reverse().find((m) => m.role === 'user')?.content ||
      '',
    preferredAi: activeModel,
    tokenLimit: params.tokenLimit,
    currentTokenUsage: params.currentTokenUsage,
    abortSignal: params.signal,
  })

  if (!routed.ok) {
    return { ok: false, message: routed.message }
  }

  try {
    for await (const delta of routed.result.textStream) {
      params.onTextDelta(delta)
    }
  } catch (error) {
    if (isAbortError(error, params.signal)) {
      return { ok: false, message: 'aborted', aborted: true }
    }
    const message =
      error instanceof Error ? error.message : '스트림 처리 중 오류가 났습니다.'
    return { ok: false, message }
  }

  return { ok: true }
}

/**
 * 프로덕션 기본값: Supabase Edge Function `ai-chat` (서버에서 AI SDK 실행, CORS 회피).
 * `VITE_AI_TRANSPORT=direct` 이면 같은 저장소의 `routeAiRequest` 를 브라우저에서 직접 호출합니다.
 */
export async function invokeAiChat(
  params: InvokeAiChatParams,
): Promise<{ ok: true } | InvokeAiChatFailure> {
  if (resolveAiTransport() === 'direct') {
    return invokeViaRouteAiRequest(params)
  }
  return invokeViaEdge(params)
}
