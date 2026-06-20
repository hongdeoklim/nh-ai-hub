import type { CoreMessage } from 'ai'

/** AI PM이 기획안 생성 준비 완료 시 마지막 줄에 출력 (UI에서 숨김) */
export const PLANNER_READY_MARKER = '[PLANNER_READY]'

const LEGACY_READY_PATTERNS = [
  /기획안을?\s*생성할\s*준비가\s*되었/,
  /기획안\s*생성\s*버튼.*눌러/,
  /🚀\s*기획안\s*생성.*눌러/,
]

export function messageContentToString(content: CoreMessage['content']): string {
  if (typeof content === 'string') return content
  return ''
}

export function stripPlannerReadyMarker(text: string): string {
  return text
    .replace(new RegExp(`\\s*${PLANNER_READY_MARKER}\\s*`, 'g'), '')
    .trimEnd()
}

export function assistantMessageHasReadySignal(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed) return false
  if (trimmed.includes(PLANNER_READY_MARKER)) return true
  return LEGACY_READY_PATTERNS.some((pattern) => pattern.test(trimmed))
}

/** 마지막 메시지가 PM의 「생성 준비 완료」 응답일 때만 true */
export function isPlannerReadyToGenerate(messages: CoreMessage[]): boolean {
  if (messages.length === 0) return false
  const last = messages[messages.length - 1]
  if (last.role !== 'assistant') return false
  return assistantMessageHasReadySignal(messageContentToString(last.content))
}
