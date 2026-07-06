/** difyBridge.js 타입 선언 — 런타임 구현은 같은 이름의 .js 파일 */

export type DifyStreamParams = {
  query: string
  user: string
  conversationId?: string
  userContext?: Record<string, unknown>
  supabaseToken?: string
}

export type DifyStreamCallbacks = {
  onMessage?: (chunk: string) => void
  onError?: (error: Error) => void
  /** message_end 이벤트의 metadata 가 전달될 수 있음 */
  onDone?: (metadata?: unknown) => void
  signal?: AbortSignal
}

export function streamDifyChat(
  params: DifyStreamParams,
  callbacks: DifyStreamCallbacks,
): Promise<void>
