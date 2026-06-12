/**
 * AI가 한 줄에 **굵게**·`* 목록`을 섞어 출력할 때 GFM 파서가 읽도록 전처리합니다.
 */
export function normalizeAiMarkdown(raw: string): string {
  if (!raw.trim()) return raw

  let text = raw.replace(/\r\n/g, '\n')

  text = text.replace(/\*\*(\d+\.\s*[^*]+)\*\*/g, '\n\n**$1**')

  text = text.replace(/([^\n*])\s+\*\s+(?=[^\s*])/g, '$1\n* ')

  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trimStart()
}

export function stripMarkdownForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\|\s*[-:| ]+\s*\|$/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
