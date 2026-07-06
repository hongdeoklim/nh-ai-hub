import type { ModelMessage } from 'ai'

/** AI PM이 기획안 생성 준비 완료 시 마지막 줄에 출력 (UI에서 숨김) */
export const PLANNER_READY_MARKER = '[PLANNER_READY]'

const LEGACY_READY_PATTERNS = [
  /기획안을?\s*생성할\s*준비가\s*되었/,
  /기획안\s*생성\s*버튼.*눌러/,
  /🚀\s*기획안\s*생성.*눌러/,
  /기획안\s*생성.*눌러/,
  /버튼을?\s*눌러.*기획/,
  /PRD.*기능\s*명세/,
  /이제\s*.*기획안\s*생성/,
]

export function messageContentToString(content: ModelMessage['content']): string {
  if (typeof content === 'string') return content
  return ''
}

export function stripPlannerReadyMarker(text: string): string {
  return text
    .replace(new RegExp(`\\s*${PLANNER_READY_MARKER}\\s*`, 'g'), '')
    .trimEnd()
}

export function assistantMessageHasReadySignal(content: string): boolean {
  const trimmed = stripPlannerReadyMarker(content).trim()
  const raw = content.trim()
  if (!raw) return false
  if (raw.includes(PLANNER_READY_MARKER)) return true
  return LEGACY_READY_PATTERNS.some((pattern) => pattern.test(trimmed) || pattern.test(raw))
}

/** PM이 대화 중 한 번이라도 「생성 준비 완료」를 알렸는지 (후속 사용자 질문 후에도 유지) */
export function hasPlannerReadySignal(messages: ModelMessage[]): boolean {
  return messages.some(
    (m) =>
      m.role === 'assistant' &&
      assistantMessageHasReadySignal(messageContentToString(m.content)),
  )
}

/** 최소 1회 사용자·PM 교환 후 생성 버튼 활성화 (추가 질문·수정 대화 중에도 유지) */
export function canGeneratePlannerPlan(messages: ModelMessage[]): boolean {
  if (messages.length === 0) return false
  const userMessages = messages.filter((m) => m.role === 'user')
  const assistantMessages = messages.filter((m) => m.role === 'assistant')

  if (userMessages.length >= 1 && assistantMessages.length >= 1) return true

  const firstUserText = messageContentToString(userMessages[0]?.content).trim()
  return firstUserText.length >= 80
}

export function messagesForPlannerGeneration(messages: ModelMessage[]): ModelMessage[] {
  return messages
    .filter(
      (message): message is Extract<ModelMessage, { role: 'user' | 'assistant' | 'system' }> =>
        message.role === 'user' || message.role === 'assistant' || message.role === 'system',
    )
    .map((message) => ({
      role: message.role,
      content: messageContentToString(message.content).trim(),
    }))
    .filter((message) => message.content.length > 0)
}

/** @deprecated 이름 호환 — PM 준비 신호 여부. 버튼 활성화는 canGeneratePlannerPlan 사용 */
export function isPlannerReadyToGenerate(messages: ModelMessage[]): boolean {
  return hasPlannerReadySignal(messages)
}
