import type { ChatBubble } from '../components/chat/ChatArea'

const ROLE_SORT_ORDER: Record<ChatBubble['role'], number> = {
  user: 0,
  assistant: 1,
}

/** 대화 표시·저장 순서 — 동일 시각이면 user → assistant, 그다음 삽입 순서 */
export function sortChatBubblesChronologically(
  messages: ChatBubble[],
): ChatBubble[] {
  return [...messages]
    .map((message, index) => ({ message, index }))
    .sort((a, b) => {
      const ta = Date.parse(resolveChatMessageIsoTime(a.message))
      const tb = Date.parse(resolveChatMessageIsoTime(b.message))
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) {
        return ta - tb
      }
      const ra = ROLE_SORT_ORDER[a.message.role] ?? 9
      const rb = ROLE_SORT_ORDER[b.message.role] ?? 9
      if (ra !== rb) return ra - rb
      return a.index - b.index
    })
    .map(({ message }) => message)
}

/** UI 표시용 time(예: "오후 01:54")이 아닌 DB timestamptz용 ISO 문자열 */
export function resolveChatMessageIsoTime(
  message: Pick<ChatBubble, 'id' | 'time' | 'createdAt'>,
): string {
  if (message.createdAt) {
    const createdAtMs = Date.parse(message.createdAt)
    if (Number.isFinite(createdAtMs)) {
      return new Date(createdAtMs).toISOString()
    }
  }

  const displayTime = message.time?.trim()
  if (displayTime) {
    const displayMs = Date.parse(displayTime)
    if (Number.isFinite(displayMs)) {
      return new Date(displayMs).toISOString()
    }
  }

  const idMatch = /^(\w+)-(\d{13,})$/.exec(message.id)
  if (idMatch) {
    const idMs = Number(idMatch[2])
    if (Number.isFinite(idMs)) {
      return new Date(idMs).toISOString()
    }
  }

  return new Date().toISOString()
}
