/** 구글 드라이브·Docs·Sheets·Slides URL 에서 파일 ID 추출 */
export function extractGoogleDriveFileId(raw: string): string | null {
  const input = raw.trim()
  if (!input) return null

  try {
    const url = new URL(input)
    const host = url.hostname.replace(/^www\./, '')

    const fileInPath = url.pathname.match(/\/file\/d\/([^/]+)/)
    if (fileInPath?.[1]) return fileInPath[1]

    if (host.includes('drive.google.com')) {
      const id = url.searchParams.get('id')
      if (id?.length) return id
    }

    const docLike = url.pathname.match(
      /\/(?:document|spreadsheets|presentation)\/d\/([^/]+)/,
    )
    if (docLike?.[1]) return docLike[1]

    return null
  } catch {
    return null
  }
}
