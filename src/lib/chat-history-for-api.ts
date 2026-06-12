import type { ChatBubble } from '../components/chat/ChatArea'

export type ChatApiHistoryMessage = {
  role: 'user' | 'assistant'
  content: string
}

const DEFAULT_MAX_TURNS = 24
const DEFAULT_MAX_CHARS = 24_000

function isEligibleHistoryBubble(message: ChatBubble): boolean {
  if (message.id.startsWith('welcome-assistant')) return false
  if (message.streaming) return false
  return message.content.trim().length > 0
}

/**
 * Edge ai-chat 에 전달할 멀티턴 대화 기록(현재 사용자 턴 제외).
 * @deprecated `buildMessagesForApi` 로 전체 messages 배열을 보내세요.
 */
export function buildChatHistoryForApi(
  messages: ChatBubble[],
  options?: {
    maxTurns?: number
    maxChars?: number
    /** true 이면 마지막 user 버블을 제외 (재생성·이미 UI에 반영된 현재 턴) */
    excludeLastUser?: boolean
  },
): ChatApiHistoryMessage[] {
  const maxTurns = options?.maxTurns ?? DEFAULT_MAX_TURNS
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS

  let eligible = messages.filter(isEligibleHistoryBubble)

  if (options?.excludeLastUser) {
    for (let i = eligible.length - 1; i >= 0; i -= 1) {
      if (eligible[i]?.role === 'user') {
        eligible = eligible.slice(0, i)
        break
      }
    }
  }

  let result: ChatApiHistoryMessage[] = eligible.slice(-maxTurns).map((m) => ({
    role: m.role,
    content: m.content.trim(),
  }))

  let charCount = result.reduce((sum, row) => sum + row.content.length, 0)
  while (result.length > 0 && charCount > maxChars) {
    const removed = result.shift()
    if (!removed) break
    charCount -= removed.content.length
  }

  return result
}

/**
 * Edge ai-chat 요청 본문 `{ activeModel, messages }` 용 전체 대화 배열.
 * `currentUserContent` 가 있으면 마지막 user 메시지로 덮어씁니다(표시용 content 대신 API용 텍스트).
 */
export function buildMessagesForApi(
  messages: ChatBubble[],
  currentUserContent?: string,
  options?: {
    maxTurns?: number
    maxChars?: number
    excludeLastUser?: boolean
  },
): ChatApiHistoryMessage[] {
  const history = buildChatHistoryForApi(messages, options)
  const latestUser = currentUserContent?.trim() ?? ''
  if (!latestUser.length) return history
  return [...history, { role: 'user', content: latestUser }]
}

/** Edge 레거시 `{ prompt, chat_history }` 분리 및 prompt 단독 폴백용 */
export function splitMessagesForLegacyApi(
  messages: ChatApiHistoryMessage[],
): { prompt: string; chatHistory: ChatApiHistoryMessage[] } {
  let lastUserIndex = -1
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const row = messages[i]
    if (row?.role === 'user' && row.content.trim().length > 0) {
      lastUserIndex = i
      break
    }
  }
  if (lastUserIndex < 0) {
    return { prompt: '', chatHistory: messages }
  }
  return {
    prompt: messages[lastUserIndex]!.content,
    chatHistory: messages.slice(0, lastUserIndex),
  }
}
