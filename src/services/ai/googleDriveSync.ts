import { supabase } from '../../lib/supabase'
import {
  fetchGdriveFileText,
  fetchGdriveServiceList,
  type GdriveServiceFile,
} from '../drive/gdrive-service-client'

/** Google Drive API v3 files 엔드포인트 */
export const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files'

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document'
const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet'

const TEXT_EXTENSIONS = /\.(txt|md|markdown|json|csv|log|yaml|yml)$/i

export type DriveSyncProgress = {
  phase: 'listing' | 'downloading' | 'ingesting' | 'done' | 'error'
  message: string
  currentFile?: string
  processed?: number
  total?: number
}

export type DriveSyncResult = {
  ok: boolean
  folderId: string
  filesListed: number
  textCandidates: number
  filesIngested: number
  filesSkipped: number
  filesFailed: number
  errors: Array<{ fileName: string; message: string }>
}

export type RagIngestResponse = {
  ok?: boolean
  file_name?: string
  chunks_total?: number
  inserted?: number
  failed?: number
  errors?: Array<{ chunk_index: number; message: string }>
  error?: string
}

type DriveListFile = {
  id: string
  name: string
  mimeType?: string
}

export async function fetchCompanyRagLastUpdatedAt(): Promise<Date | null> {
  const { data, error } = await supabase
    .from('company_documents')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    console.warn('[DriveSync] last updated lookup failed:', error.message)
    return null
  }

  const raw = data?.[0]?.created_at
  if (typeof raw !== 'string' || !raw.length) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatKoreanDateTime(date: Date): string {
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export { formatKoreanDateTime as formatCompanyRagLastUpdatedLabel }

/**
 * Google Drive API + accessToken 으로 폴더 내 텍스트 파일을 rag-ingest 에 동기화.
 * (OAuth access token 이 있을 때 직접 호출용)
 */
export async function syncGoogleDriveFolder(
  folderId: string,
  accessToken: string,
): Promise<{ success: boolean; count: number }> {
  try {
    const parentEsc = folderId.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    const q =
      `'${parentEsc}' in parents and trashed=false and (` +
      "mimeType = 'text/plain' or " +
      "mimeType = 'text/markdown' or " +
      "mimeType = 'text/csv' or " +
      "mimeType = 'application/json' or " +
      "mimeType = 'text/x-markdown'" +
      ')'
    const driveUrl =
      `${DRIVE_FILES_API}?q=${encodeURIComponent(q)}` +
      '&fields=files(id,name,mimeType)' +
      '&supportsAllDrives=true&includeItemsFromAllDrives=true'

    const response = await fetch(driveUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      throw new Error('구글 드라이브 인증 정보가 유효하지 않습니다.')
    }

    const data = (await response.json()) as { files?: DriveListFile[] }
    const files = data.files ?? []

    let syncCount = 0

    for (const file of files) {
      const fileContentUrl =
        `${DRIVE_FILES_API}/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`
      const contentRes = await fetch(fileContentUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!contentRes.ok) continue

      const textData = await contentRes.text()
      if (!textData.trim()) continue

      const { error } = await supabase.functions.invoke('rag-ingest', {
        body: { fileName: file.name, text: textData },
      })

      if (!error) syncCount++
    }

    return { success: true, count: syncCount }
  } catch (error) {
    console.error('Drive Sync Error:', error)
    throw error
  }
}

function ragIngestUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '')
  if (!base) throw new Error('VITE_SUPABASE_URL 이 설정되지 않았습니다.')
  return `${base}/functions/v1/rag-ingest`
}

/** Drive 목록 API 쿼리 URL (문서·디버깅용) */
export function buildDriveListQueryUrl(folderId: string, pageSize = 100): string {
  const parentEsc = folderId.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const q = `'${parentEsc}' in parents and trashed=false`
  const fields = encodeURIComponent(
    'files(id,name,mimeType,size,webViewLink,webContentLink,modifiedTime)',
  )
  return `${DRIVE_FILES_API}?pageSize=${pageSize}&fields=${fields}&orderBy=folder,name_natural&q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true`
}

export function isTextSyncCandidate(file: GdriveServiceFile): boolean {
  if (file.mimeType === FOLDER_MIME) return false
  const name = file.name.toLowerCase()
  const mime = file.mimeType.toLowerCase()
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/x-json' ||
    mime === 'application/ld+json'
  ) {
    return true
  }
  if (mime === GOOGLE_DOC_MIME || mime === GOOGLE_SHEET_MIME) return true
  return TEXT_EXTENSIONS.test(name)
}

async function getSessionToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('로그인 세션이 없습니다.')
  }
  return session.access_token
}

/**
 * gdrive-service(list) → Drive API v3 와 동일한 폴더 파일 목록
 */
export async function listDriveFolderFiles(
  folderId?: string | null,
): Promise<
  | { ok: true; folderId: string; files: GdriveServiceFile[]; folders: Array<{ id: string; name: string }> }
  | { ok: false; message: string }
> {
  const listed = await fetchGdriveServiceList(folderId)
  if (!listed.ok) return listed
  return {
    ok: true,
    folderId: listed.data.folderId,
    files: listed.data.files,
    folders: listed.data.folders.map((f) => ({ id: f.id, name: f.name })),
  }
}

/** 하위 폴더까지 BFS 로 텍스트 후보 파일 수집 */
async function collectTextFilesRecursive(
  rootFolderId: string,
  onProgress?: (p: DriveSyncProgress) => void,
): Promise<GdriveServiceFile[]> {
  const queue: string[] = [rootFolderId]
  const seenFolders = new Set<string>()
  const collected: GdriveServiceFile[] = []

  while (queue.length > 0) {
    const folderId = queue.shift()!
    if (seenFolders.has(folderId)) continue
    seenFolders.add(folderId)

    onProgress?.({
      phase: 'listing',
      message: '구글 드라이브에서 연수 일정 및 사내 규정 문서 가져오는 중...',
      processed: seenFolders.size,
    })

    const listed = await listDriveFolderFiles(folderId)
    if (!listed.ok) {
      throw new Error(listed.message)
    }

    for (const file of listed.files) {
      if (isTextSyncCandidate(file)) {
        collected.push(file)
      }
    }
    for (const folder of listed.folders) {
      if (!seenFolders.has(folder.id)) {
        queue.push(folder.id)
      }
    }
  }

  return collected
}

/** Drive 파일 본문 다운로드 (Edge gdrive-service → Drive API alt=media / export) */
export async function downloadDriveFileText(
  fileId: string,
): Promise<{ ok: true; fileName: string; text: string } | { ok: false; message: string }> {
  const read = await fetchGdriveFileText(fileId)
  if (!read.ok) return read
  return {
    ok: true,
    fileName: read.data.fileName,
    text: read.data.text,
  }
}

/** rag-ingest Edge Function 으로 임베딩 학습 파이프라인 전달 */
export async function ingestDocumentToRag(params: {
  fileName: string
  text: string
}): Promise<
  { ok: true; data: RagIngestResponse } | { ok: false; message: string }
> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!anonKey) {
    return { ok: false, message: 'VITE_SUPABASE_ANON_KEY 가 없습니다.' }
  }

  const fileName = params.fileName.trim()
  const text = params.text.trim()
  if (!fileName) return { ok: false, message: 'fileName 이 필요합니다.' }
  if (!text) return { ok: false, message: 'text 가 비어 있습니다.' }

  try {
    const accessToken = await getSessionToken()
    const res = await fetch(ragIngestUrl(), {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'x-client-info': 'nh-ai-hub',
      },
      body: JSON.stringify({ fileName, text }),
    })

    const payload = (await res.json()) as RagIngestResponse
    if (!res.ok || payload.ok === false) {
      return {
        ok: false,
        message: payload.error ?? `rag-ingest 오류 (${res.status})`,
      }
    }

    return { ok: true, data: payload }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'rag-ingest 호출에 실패했습니다.',
    }
  }
}

/**
 * 사내 Google Drive 공유 폴더 → 텍스트 추출 → rag-ingest 임베딩 동기화
 */
export async function syncGoogleDriveFolderToRag(options?: {
  folderId?: string | null
  onProgress?: (progress: DriveSyncProgress) => void
}): Promise<DriveSyncResult> {
  const onProgress = options?.onProgress
  const errors: Array<{ fileName: string; message: string }> = []

  onProgress?.({
    phase: 'listing',
    message: '구글 드라이브에서 연수 일정 및 사내 규정 문서 가져오는 중...',
  })

  const rootListed = await listDriveFolderFiles(options?.folderId ?? null)
  if (!rootListed.ok) {
    return {
      ok: false,
      folderId: '',
      filesListed: 0,
      textCandidates: 0,
      filesIngested: 0,
      filesSkipped: 0,
      filesFailed: 1,
      errors: [{ fileName: '(목록)', message: rootListed.message }],
    }
  }

  let textFiles: GdriveServiceFile[] = []
  try {
    textFiles = await collectTextFilesRecursive(rootListed.folderId, onProgress)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      folderId: rootListed.folderId,
      filesListed: 0,
      textCandidates: 0,
      filesIngested: 0,
      filesSkipped: 0,
      filesFailed: 1,
      errors: [{ fileName: '(목록)', message }],
    }
  }

  const total = textFiles.length
  let filesIngested = 0
  let filesFailed = 0

  for (let i = 0; i < textFiles.length; i++) {
    const file = textFiles[i]!
    const label = file.name

    onProgress?.({
      phase: 'downloading',
      message: '구글 드라이브에서 연수 일정 및 사내 규정 문서 가져오는 중...',
      currentFile: label,
      processed: i + 1,
      total,
    })

    const downloaded = await downloadDriveFileText(file.id)
    if (!downloaded.ok) {
      filesFailed++
      errors.push({ fileName: label, message: downloaded.message })
      continue
    }

    onProgress?.({
      phase: 'ingesting',
      message: '구글 드라이브에서 연수 일정 및 사내 규정 문서 가져오는 중...',
      currentFile: label,
      processed: i + 1,
      total,
    })

    const ingested = await ingestDocumentToRag({
      fileName: downloaded.fileName,
      text: downloaded.text,
    })

    if (!ingested.ok) {
      filesFailed++
      errors.push({ fileName: label, message: ingested.message })
      continue
    }

    if ((ingested.data.inserted ?? 0) > 0) {
      filesIngested++
    } else {
      filesFailed++
      errors.push({
        fileName: label,
        message: '임베딩 청크가 저장되지 않았습니다.',
      })
    }
  }

  onProgress?.({
    phase: 'done',
    message: `동기화 완료 — ${filesIngested}건 학습, ${filesFailed}건 실패`,
    processed: total,
    total,
  })

  return {
    ok: filesIngested > 0 && filesFailed === 0 ? true : filesIngested > 0,
    folderId: rootListed.folderId,
    filesListed: total,
    textCandidates: total,
    filesIngested,
    filesSkipped: 0,
    filesFailed,
    errors,
  }
}
