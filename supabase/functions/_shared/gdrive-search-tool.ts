/**
 * NH AI Hub — Google Drive 문서 검색 MCP 도구
 *
 * Drive API v3 를 사용하여 공유 드라이브 또는 개인 드라이브의 문서를 검색하고
 * 파일 내용을 읽어 AI에게 제공합니다.
 *
 * 지원 형식: Google Docs (.gdoc), Google Sheets (.gsheet), 일반 텍스트, PDF
 *
 * 필요 환경 변수:
 *   - GDRIVE_CLIENT_ID / GOOGLE_OAUTH_CLIENT_ID
 *   - GDRIVE_CLIENT_SECRET / GOOGLE_OAUTH_CLIENT_SECRET
 *   - GDRIVE_REFRESH_TOKEN / GOOGLE_OAUTH_REFRESH_TOKEN
 */

import { getAccessToken, getAccessTokenFromRefreshToken } from "./gdrive.ts"

const DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files"
const EXPORT_MIME_PLAIN = "text/plain"
const MAX_FILE_CONTENT_CHARS = 8000   // AI 컨텍스트 보호 한도
const MAX_SEARCH_RESULTS = 10

export type DriveFileItem = {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  webViewLink?: string
  snippet?: string   // Drive 검색 스니펫 (있는 경우)
}

export type DriveSearchResult = {
  ok: boolean
  query?: string
  files?: DriveFileItem[]
  fileCount?: number
  message?: string
  error?: string
}

export type DriveReadResult = {
  ok: boolean
  fileId?: string
  fileName?: string
  mimeType?: string
  content?: string        // 본문 텍스트 (최대 MAX_FILE_CONTENT_CHARS)
  truncated?: boolean
  webViewLink?: string
  message?: string
  error?: string
}

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

function isGoogleDriveConfigured(): boolean {
  const clientId = readEnv("GOOGLE_OAUTH_CLIENT_ID") ?? readEnv("GDRIVE_CLIENT_ID")
  const secret = readEnv("GOOGLE_OAUTH_CLIENT_SECRET") ?? readEnv("GDRIVE_CLIENT_SECRET")
  const refresh = readEnv("GOOGLE_OAUTH_REFRESH_TOKEN") ?? readEnv("GDRIVE_REFRESH_TOKEN")
  return Boolean(clientId && secret && refresh)
}

export { isGoogleDriveConfigured }

async function resolveAccessToken(userRefreshToken?: string): Promise<string> {
  if (userRefreshToken) {
    return await getAccessTokenFromRefreshToken(userRefreshToken)
  }
  return await getAccessToken()
}

/** 구글 MIME 타입을 익스포트 가능 여부로 분류 */
function isExportable(mimeType: string): boolean {
  return (
    mimeType.startsWith("application/vnd.google-apps.") &&
    mimeType !== "application/vnd.google-apps.folder" &&
    mimeType !== "application/vnd.google-apps.shortcut"
  )
}

/** Google Docs/Sheets 등 → plain text 익스포트 */
async function exportFileAsText(
  fileId: string,
  accessToken: string,
): Promise<string | null> {
  const url =
    `${DRIVE_FILES_API}/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(EXPORT_MIME_PLAIN)}&supportsAllDrives=true`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const text = await res.text()
  return text.trim()
}

/** 일반 텍스트 파일 다운로드 */
async function downloadFileAsText(
  fileId: string,
  accessToken: string,
): Promise<string | null> {
  const url =
    `${DRIVE_FILES_API}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const text = await res.text()
  return text.trim()
}

/**
 * Google Drive 파일 전문 텍스트 조회
 * (Docs/Sheets → export, 텍스트 파일 → download)
 */
export async function readGoogleDriveFile(input: {
  fileId: string
  userRefreshToken?: string
}): Promise<DriveReadResult> {
  if (!isGoogleDriveConfigured()) {
    return {
      ok: false,
      error: "Google Drive 연동 환경 변수가 설정되지 않았습니다. (GDRIVE_* 또는 GOOGLE_OAUTH_*)",
    }
  }

  let accessToken: string
  try {
    accessToken = await resolveAccessToken(input.userRefreshToken)
  } catch (e) {
    return {
      ok: false,
      error: `OAuth 토큰 발급 실패: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  // 파일 메타데이터 조회
  const metaUrl =
    `${DRIVE_FILES_API}/${encodeURIComponent(input.fileId)}?fields=id,name,mimeType,webViewLink&supportsAllDrives=true`
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!metaRes.ok) {
    const body = await metaRes.text().catch(() => "")
    return {
      ok: false,
      fileId: input.fileId,
      error: `파일 메타데이터 조회 실패 (${metaRes.status}): ${body}`,
    }
  }

  const meta = (await metaRes.json()) as {
    id: string
    name: string
    mimeType: string
    webViewLink?: string
  }

  let rawText: string | null = null

  if (isExportable(meta.mimeType)) {
    rawText = await exportFileAsText(meta.id, accessToken)
  } else if (
    meta.mimeType.startsWith("text/") ||
    meta.mimeType === "application/json" ||
    meta.mimeType === "application/xml"
  ) {
    rawText = await downloadFileAsText(meta.id, accessToken)
  }

  if (rawText === null) {
    return {
      ok: false,
      fileId: meta.id,
      fileName: meta.name,
      mimeType: meta.mimeType,
      webViewLink: meta.webViewLink,
      error:
        "이 파일 형식은 텍스트 추출을 지원하지 않습니다. (PDF·이미지·바이너리 제외)",
    }
  }

  const truncated = rawText.length > MAX_FILE_CONTENT_CHARS
  const content = truncated ? rawText.slice(0, MAX_FILE_CONTENT_CHARS) + "\n…(내용 일부 생략)" : rawText

  return {
    ok: true,
    fileId: meta.id,
    fileName: meta.name,
    mimeType: meta.mimeType,
    content,
    truncated,
    webViewLink: meta.webViewLink,
    message:
      `'${meta.name}' 파일 내용 ${content.length.toLocaleString()}자 로드 완료. 내용을 근거로 답변하세요.`,
  }
}

/**
 * Google Drive 키워드 검색
 * Drive API fullText 검색 + 제목 검색을 병행합니다.
 */
export async function searchGoogleDrive(input: {
  query: string
  max_results?: number
  userRefreshToken?: string
}): Promise<DriveSearchResult> {
  if (!isGoogleDriveConfigured()) {
    return {
      ok: false,
      error: "Google Drive 연동 환경 변수가 설정되지 않았습니다. (GDRIVE_* 또는 GOOGLE_OAUTH_*)",
    }
  }

  const q = input.query.trim()
  if (!q) return { ok: false, error: "검색어가 비어 있습니다." }

  let accessToken: string
  try {
    accessToken = await resolveAccessToken(input.userRefreshToken)
  } catch (e) {
    return {
      ok: false,
      error: `OAuth 토큰 발급 실패: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  const maxResults = Math.min(
    Math.max(1, input.max_results ?? 8),
    MAX_SEARCH_RESULTS,
  )

  // Drive API fullText + title 검색
  const safeQ = q.replace(/'/g, "\\'")
  const driveQuery =
    `(fullText contains '${safeQ}' or name contains '${safeQ}') and trashed = false`

  const url =
    `${DRIVE_FILES_API}?q=${encodeURIComponent(driveQuery)}` +
    `&pageSize=${maxResults}` +
    `&fields=files(id,name,mimeType,modifiedTime,webViewLink)` +
    `&supportsAllDrives=true&includeItemsFromAllDrives=true` +
    `&orderBy=modifiedTime desc`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    return {
      ok: false,
      query: q,
      error: `Drive 검색 실패 (${res.status}): ${body}`,
    }
  }

  const json = (await res.json()) as {
    files?: {
      id: string
      name: string
      mimeType: string
      modifiedTime?: string
      webViewLink?: string
    }[]
  }

  const files: DriveFileItem[] = (json.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    modifiedTime: f.modifiedTime,
    webViewLink: f.webViewLink,
  }))

  if (files.length === 0) {
    return {
      ok: true,
      query: q,
      files: [],
      fileCount: 0,
      message: "검색 결과가 없습니다. 다른 키워드로 시도해 보세요.",
    }
  }

  return {
    ok: true,
    query: q,
    files,
    fileCount: files.length,
    message:
      `Google Drive 에서 '${q}' 검색 결과 ${files.length}건. 파일 전문이 필요하면 read_google_drive_file 도구로 내용을 조회하세요.`,
  }
}
