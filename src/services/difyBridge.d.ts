/** difyBridge.js 타입 선언 — 런타임 구현은 같은 이름의 .js 파일 */

export type DifyStreamParams = {
  query: string
  user: string
  /** NH-AX-HUB 대화 ID — 같은 대화의 Dify conversation_id 를 이어 쓰는 키 */
  conversationId?: string
  userContext?: Record<string, unknown>
  /** dify-chat-proxy 인증용 Supabase 사용자 JWT (필수 — 프록시 경유 전용) */
  supabaseToken: string
}

/** 실패 시 전달되는 오류. 프록시·Dify 가 HTTP 상태를 주면 status 에 담긴다 (402 토큰 한도 등). */
export type DifyStreamError = Error & { status?: number }

/** onDone · onError · onAbort 중 정확히 하나만 한 번 호출된다 */
export type DifyStreamCallbacks = {
  onMessage?: (chunk: string) => void
  onError?: (error: DifyStreamError) => void
  /** message_end 이벤트의 metadata (retriever_resources·usage 등) */
  onDone?: (metadata?: unknown) => void
  /** 사용자가 AbortSignal 로 중단했을 때 */
  onAbort?: () => void
  signal?: AbortSignal
}

export function streamDifyChat(
  params: DifyStreamParams,
  callbacks: DifyStreamCallbacks,
): Promise<void>
