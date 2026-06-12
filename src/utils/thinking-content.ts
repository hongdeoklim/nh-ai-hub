const THINKING_OPEN = '<thinking>'
const THINKING_CLOSE = '</thinking>'

export type ParsedThinkingContent = {
  thinking: string
  answer: string
  /** 스트리밍 중 `<thinking>` 은 열렸으나 `</thinking>` 은 아직 없음 */
  thinkingOpen: boolean
  hasThinking: boolean
}

export function parseThinkingContent(raw: string): ParsedThinkingContent {
  const openIdx = raw.indexOf(THINKING_OPEN)
  if (openIdx === -1) {
    return {
      thinking: '',
      answer: raw,
      thinkingOpen: false,
      hasThinking: false,
    }
  }

  const afterOpen = openIdx + THINKING_OPEN.length
  const closeIdx = raw.indexOf(THINKING_CLOSE, afterOpen)

  if (closeIdx === -1) {
    return {
      thinking: raw.slice(afterOpen).trimStart(),
      answer: raw.slice(0, openIdx).trim(),
      thinkingOpen: true,
      hasThinking: true,
    }
  }

  const thinking = raw.slice(afterOpen, closeIdx).trim()
  const answer = (
    raw.slice(0, openIdx) + raw.slice(closeIdx + THINKING_CLOSE.length)
  ).trim()

  return {
    thinking,
    answer,
    thinkingOpen: false,
    hasThinking: thinking.length > 0,
  }
}

export function splitThinkingStream(raw: string): {
  thinkingContent: string
  content: string
} {
  const parsed = parseThinkingContent(raw)
  return {
    thinkingContent: parsed.thinking,
    content: parsed.answer,
  }
}
