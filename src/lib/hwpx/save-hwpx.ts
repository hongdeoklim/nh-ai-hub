import { markdownToHwpx, type MarkdownToHwpxOptions } from './markdown-to-hwpx'

/** 파일 이름에 쓸 수 없는 문자 제거 + 길이 제한 */
export function safeHwpxFilename(name: string): string {
  const base = String(name || '문서')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${base || '문서'}.hwpx`
}

/** 오늘 날짜 YYYY-MM-DD (로컬) */
export function todayLabel(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * 마크다운을 한글 문서(.hwpx)로 만들어 내려받는다 (브라우저 전용).
 * UI 에서는 `await import('../lib/hwpx/save-hwpx')` 로 필요할 때만 불러온다(jszip·파서 분리).
 */
export async function saveMarkdownAsHwpx(
  markdown: string,
  options: MarkdownToHwpxOptions & { filename?: string } = {},
): Promise<void> {
  const bytes = await markdownToHwpx(markdown, {
    subtitle: `NH-AX-HUB · ${todayLabel()}`,
    ...options,
  })
  const blob = new Blob([bytes as BlobPart], { type: 'application/hwp+zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeHwpxFilename(options.filename || options.title || '문서')
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
