/** 어시스턴트 응답에서 Canvas용 HTML 코드 펜스 추출 */
export function extractHtmlArtifactBlock(content: string): {
  title: string
  html: string
} | null {
  const fence = /```html\s*([\s\S]*?)```/i.exec(content)
  if (fence?.[1]?.trim()) {
    const html = fence[1].trim()
    const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html)
    return {
      title: titleMatch?.[1]?.trim() || 'Canvas 미리보기',
      html,
    }
  }

  const anyFence = /```\s*([\s\S]*?)```/.exec(content)
  if (anyFence?.[1]?.trim() && /<html[\s>]/i.test(anyFence[1])) {
    const html = anyFence[1].trim()
    return { title: 'Canvas 미리보기', html }
  }

  return null
}
