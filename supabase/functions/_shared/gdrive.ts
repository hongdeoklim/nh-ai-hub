/**
 * Google Drive 업로드 유틸리티 (Supabase Edge / Deno)
 * OAuth 2.0 Refresh Token으로 Access Token을 받아 Drive API v3 REST를 호출합니다.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files"
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files"

export type ChatImageForDrive = {
  bytes: Uint8Array
  mimeType: string
  originalName: string
}

type CachedToken = {
  token: string
  expSec: number
}

let cachedToken: CachedToken | null = null

/** 사용자별 리프레시 토큰 → 액세스 토큰 캐시 */
const userRefreshCache = new Map<string, CachedToken>()

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)?.trim()
  return v && v.length > 0 ? v : undefined
}

/** Secret/CLI 복붙 시 따옴표·Drive URL 을 순수 폴더 ID 로 정규화 */
export function normalizeDriveFolderId(
  raw: string | undefined | null,
): string | undefined {
  if (!raw) return undefined
  let value = raw.trim()
  if (!value.length) return undefined

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim()
  }

  const folderInPath = value.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (folderInPath?.[1]) return folderInPath[1]

  const idParam = value.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (idParam?.[1]) return idParam[1]

  return value
}

export function readDriveRootFolderId(): string | undefined {
  return normalizeDriveFolderId(readEnv("GDRIVE_ROOT_FOLDER_ID"))
}

function escapeDriveQueryLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

function sanitizeFolderSegment(segment: string): string {
  const t = segment.trim()
  if (!t.length) return "unknown-user"
  return t.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200)
}

function sanitizeFileName(name: string): string {
  const base = name.trim().replace(/^.*[/\\]/, "")
  const cleaned = base.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 180)
  return cleaned.length > 0 ? cleaned : "image"
}

/** 한국 표준시 기준 YYYY-MM-DD */
function formatDateFolderKst(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const y = parts.find((p) => p.type === "year")?.value ?? "1970"
  const m = parts.find((p) => p.type === "month")?.value ?? "01"
  const d = parts.find((p) => p.type === "day")?.value ?? "01"
  return `${y}-${m}-${d}`
}

/** 한국 표준시 기준 HHMMSS */
function formatTimeFilePrefixKst(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date())
  const h = parts.find((p) => p.type === "hour")?.value ?? "00"
  const m = parts.find((p) => p.type === "minute")?.value ?? "00"
  const s = parts.find((p) => p.type === "second")?.value ?? "00"
  return `${h}${m}${s}`
}

/**
 * `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET`, `GDRIVE_REFRESH_TOKEN` 으로
 * Google OAuth 토큰 엔드포인트에서 Access Token을 발급합니다.
 * 유효 시간 내에는 메모리 캐시를 재사용합니다.
 */
export async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.expSec > now + 120) {
    return cachedToken.token
  }

  const clientId =
    readEnv("GOOGLE_OAUTH_CLIENT_ID") ?? readEnv("GDRIVE_CLIENT_ID")
  const clientSecret =
    readEnv("GOOGLE_OAUTH_CLIENT_SECRET") ?? readEnv("GDRIVE_CLIENT_SECRET")
  const refreshToken =
    readEnv("GOOGLE_OAUTH_REFRESH_TOKEN") ?? readEnv("GDRIVE_REFRESH_TOKEN")

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google OAuth 클라이언트 ID/시크릿 및 리프레시 토큰(GDRIVE_* 또는 GOOGLE_OAUTH_*)이 필요합니다.",
    )
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Google OAuth 토큰 요청 실패 (${res.status}): ${errText}`)
  }

  const data = (await res.json()) as {
    access_token: string
    expires_in?: number
  }

  if (!data.access_token) {
    throw new Error("Google OAuth 응답에 access_token 이 없습니다.")
  }

  cachedToken = {
    token: data.access_token,
    expSec: now + (data.expires_in ?? 3600),
  }
  return cachedToken.token
}

/**
 * 사용자가 연동한 Google 계정의 리프레시 토큰으로 액세스 토큰 발급.
 * 클라이언트 ID/시크릿은 테넌트 공통(GOOGLE_OAUTH_* 또는 GDRIVE_*).
 */
export async function getAccessTokenFromRefreshToken(
  refreshToken: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const cacheKey = `${refreshToken.length}:${refreshToken.slice(0, 24)}`
  const hit = userRefreshCache.get(cacheKey)
  if (hit && hit.expSec > now + 120) {
    return hit.token
  }

  const clientId =
    readEnv("GOOGLE_OAUTH_CLIENT_ID") ?? readEnv("GDRIVE_CLIENT_ID")
  const clientSecret =
    readEnv("GOOGLE_OAUTH_CLIENT_SECRET") ?? readEnv("GDRIVE_CLIENT_SECRET")

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET (또는 GDRIVE_*) 가 필요합니다.",
    )
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Google OAuth 토큰 요청 실패 (${res.status}): ${errText}`)
  }

  const data = (await res.json()) as {
    access_token: string
    expires_in?: number
  }

  if (!data.access_token) {
    throw new Error("Google OAuth 응답에 access_token 이 없습니다.")
  }

  userRefreshCache.set(cacheKey, {
    token: data.access_token,
    expSec: now + (data.expires_in ?? 3600),
  })
  return data.access_token
}

async function findFolderId(
  parentId: string,
  folderName: string,
  accessToken: string,
): Promise<string | null> {
  const safeName = escapeDriveQueryLiteral(folderName)
  const q =
    `'${parentId}' in parents and name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  const url =
    `${DRIVE_FILES_API}?q=${
      encodeURIComponent(q)
    }&fields=files(id,name)&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Drive 폴더 검색 실패 (${res.status}): ${t}`)
  }
  const json = (await res.json()) as { files?: { id: string }[] }
  const id = json.files?.[0]?.id
  return id ?? null
}

async function createFolder(
  parentId: string,
  folderName: string,
  accessToken: string,
): Promise<string> {
  const res = await fetch(
    `${DRIVE_FILES_API}?supportsAllDrives=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    },
  )
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Drive 폴더 생성 실패 (${res.status}): ${t}`)
  }
  const json = (await res.json()) as { id: string }
  if (!json.id) throw new Error("Drive 폴더 생성 응답에 id 가 없습니다.")
  return json.id
}

/** 부모 아래 동일 이름 폴더가 있으면 id 반환, 없으면 생성 후 id 반환 */
async function ensureChildFolder(
  parentId: string,
  folderName: string,
  accessToken: string,
): Promise<string> {
  const existing = await findFolderId(parentId, folderName, accessToken)
  if (existing) return existing
  return await createFolder(parentId, folderName, accessToken)
}

async function uploadFileMultipart(
  parentId: string,
  fileName: string,
  mimeType: string,
  bytes: Uint8Array,
  accessToken: string,
): Promise<string> {
  const boundary = "nh_ai_hub_" + crypto.randomUUID().replace(/-/g, "")
  const meta = JSON.stringify({
    name: fileName,
    parents: [parentId],
  })

  const blob = new Blob(
    [
      `--${boundary}\r\n`,
      `Content-Type: application/json; charset=UTF-8\r\n\r\n`,
      meta,
      `\r\n--${boundary}\r\n`,
      `Content-Type: ${mimeType}\r\n\r\n`,
      bytes,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` },
  )

  const url =
    `${DRIVE_UPLOAD_API}?uploadType=multipart&supportsAllDrives=true`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: blob,
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Drive 파일 업로드 실패 (${res.status}): ${t}`)
  }
  const json = (await res.json()) as { id: string }
  if (!json.id) throw new Error("Drive 업로드 응답에 id 가 없습니다.")
  return json.id
}

/**
 * 루트 폴더 → 사용자 이메일 폴더 → YYYY-MM-DD 폴더 아래에
 * `HHMMSS_원본파일명` 규칙으로 저장합니다.
 */
export async function uploadChatImagesToDrive(params: {
  userEmail: string
  images: ChatImageForDrive[]
}): Promise<{ fileIds: string[] }> {
  const rootId = readDriveRootFolderId()
  if (!rootId) {
    throw new Error(
      "GDRIVE_ROOT_FOLDER_ID 가 설정되지 않았습니다. Drive 공유 폴더 ID를 secrets 에 등록하세요.",
    )
  }

  if (params.images.length === 0) return { fileIds: [] }

  const token = await getAccessToken()
  const safeEmail = sanitizeFolderSegment(params.userEmail)

  const emailFolderId = await ensureChildFolder(rootId, safeEmail, token)
  const dateFolderName = formatDateFolderKst()
  const dateFolderId = await ensureChildFolder(
    emailFolderId,
    dateFolderName,
    token,
  )

  const timePrefix = formatTimeFilePrefixKst()
  const fileIds: string[] = []

  for (let i = 0; i < params.images.length; i++) {
    const img = params.images[i]
    const safeOriginal = sanitizeFileName(img.originalName)
    const fileName = params.images.length > 1
      ? `${timePrefix}_${i + 1}_${safeOriginal}`
      : `${timePrefix}_${safeOriginal}`

    const id = await uploadFileMultipart(
      dateFolderId,
      fileName,
      img.mimeType,
      img.bytes,
      token,
    )
    fileIds.push(id)
    console.log(`[gdrive] 업로드 완료: ${fileName} (${id})`)
  }

  return { fileIds }
}

/**
 * 사용자 개인 Drive(`drive.file` 등)에 업로드.
 * `내 드라이브` 아래 `NH_AI_Inside_Hub` / 날짜 폴더 구조를 사용합니다.
 */
export async function uploadChatImagesToDriveUser(params: {
  refreshToken: string
  userEmail: string
  images: ChatImageForDrive[]
}): Promise<{ fileIds: string[] }> {
  if (params.images.length === 0) return { fileIds: [] }

  const token = await getAccessTokenFromRefreshToken(params.refreshToken)
  const safeEmail = sanitizeFolderSegment(params.userEmail)

  const rootAlias = "root"
  const hubFolderId = await ensureChildFolder(
    rootAlias,
    "NH_AI_Inside_Hub",
    token,
  )
  const emailFolderId = await ensureChildFolder(
    hubFolderId,
    safeEmail,
    token,
  )

  const dateFolderName = formatDateFolderKst()
  const dateFolderId = await ensureChildFolder(
    emailFolderId,
    dateFolderName,
    token,
  )

  const timePrefix = formatTimeFilePrefixKst()
  const fileIds: string[] = []

  for (let i = 0; i < params.images.length; i++) {
    const img = params.images[i]
    const safeOriginal = sanitizeFileName(img.originalName)
    const fileName = params.images.length > 1
      ? `${timePrefix}_${i + 1}_${safeOriginal}`
      : `${timePrefix}_${safeOriginal}`

    const id = await uploadFileMultipart(
      dateFolderId,
      fileName,
      img.mimeType,
      img.bytes,
      token,
    )
    fileIds.push(id)
    console.log(`[gdrive:user] 업로드 완료: ${fileName} (${id})`)
  }

  return { fileIds }
}
