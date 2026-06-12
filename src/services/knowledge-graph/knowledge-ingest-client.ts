/**
 * NH-AX-HUB — 지식 그래프 인입 클라이언트
 *
 * knowledge-ingest Edge Function 을 호출하여 마크다운 텍스트를
 * pgvector nh_knowledge_nodes 원장에 자동 적재합니다.
 *
 * 이 모듈은 다음 두 가지 경로에서 사용됩니다:
 *  1. ReferenceRoom 파일 업로드 완료 후 → ingestKnowledgeFile()
 *  2. Google Drive 파일 AI 검토 요청 시 → ingestDriveFile()
 */

import { supabase } from '../../lib/supabase'
import { invokeProcessDocument } from '../notebook/processDocumentClient'

/** knowledge-ingest 함수 URL */
function knowledgeIngestUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '')
  if (!base) throw new Error('VITE_SUPABASE_URL 이 설정되지 않았습니다.')
  return `${base}/functions/v1/knowledge-ingest`
}

/** ingest-worker 함수 URL */
function ingestWorkerUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '')
  if (!base) throw new Error('VITE_SUPABASE_URL 이 설정되지 않았습니다.')
  return `${base}/functions/v1/ingest-worker`
}

export type IngestWorkerResult =
  | { ok: true; processed: number; succeeded: number; failed: number }
  | { ok: false; message: string }

/**
 * ingest-worker 엣지 함수를 호출해 nh_ingest_queue의 pending 항목을 처리합니다.
 * 파일 업로드 완료 직후 또는 수동 동기화 시 호출합니다.
 */
export async function invokeIngestWorker(
  limit = 10,
): Promise<IngestWorkerResult> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!anonKey) return { ok: false, message: 'VITE_SUPABASE_ANON_KEY 가 없습니다.' }

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return { ok: false, message: '로그인 세션이 없습니다.' }

    const res = await fetch(ingestWorkerUrl(), {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ limit }),
    })
    const payload = await res.json().catch(() => ({})) as Record<string, unknown>
    if (!res.ok) {
      return { ok: false, message: String(payload.error ?? `HTTP ${res.status}`) }
    }
    return {
      ok: true,
      processed: Number(payload.processed ?? 0),
      succeeded: Number(payload.succeeded ?? 0),
      failed: Number(payload.failed ?? 0),
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'ingest-worker 호출 실패' }
  }
}

async function getSessionToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('로그인 세션이 없습니다.')

  // 만약 토큰이 만료되었거나 만료 임계점(300초) 이내라면 선제적 리프레시를 단행합니다.
  const expiresAt = session.expires_at ?? 0
  const now = Math.floor(Date.now() / 1000)
  if (expiresAt - now < 300) {
    console.log('[KnowledgeIngest] Access token expired or expiring soon (within 5 minutes), triggering refreshSession...')
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError || !refreshData.session) {
      throw new Error('로그인 세션이 만료되었으며, 토큰 갱신에 실패했습니다.')
    }
    return refreshData.session.access_token
  }

  return session.access_token
}

export type IngestType = 'INSERT' | 'UPDATE'

export type KnowledgeIngestParams = {
  type: IngestType
  title: string
  content: string
  sourceUrl?: string
  sourceDriveId?: string
  sourceFileName?: string
  visibility?: 'public' | 'department' | 'private'
  department?: string
  metadata?: Record<string, unknown>
}

export type KnowledgeIngestResult =
  | { ok: true; chunksCreated: number; chunksEmbedded: number }
  | { ok: false; message: string }

/**
 * knowledge-ingest Edge Function 을 호출합니다.
 * 텍스트 청킹 → 임베딩 → nh_knowledge_nodes INSERT 까지 서버 측에서 처리됩니다.
 */
export async function ingestKnowledgeText(
  params: KnowledgeIngestParams,
  isRetry = false,
): Promise<KnowledgeIngestResult> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!anonKey) return { ok: false, message: 'VITE_SUPABASE_ANON_KEY 가 없습니다.' }

  if (!params.content || params.content.trim().length < 20) {
    return { ok: false, message: '인입할 텍스트가 너무 짧습니다 (최소 20자 이상).' }
  }

  try {
    let accessToken = await getSessionToken()
    let res = await fetch(knowledgeIngestUrl(), {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'x-client-info': 'nh-ai-hub',
      },
      body: JSON.stringify({
        type: params.type,
        title: params.title,
        content: params.content,
        source_url: params.sourceUrl ?? null,
        source_drive_id: params.sourceDriveId ?? null,
        source_file_name: params.sourceFileName ?? null,
        visibility: params.visibility ?? 'public',
        department: params.department ?? null,
        metadata: params.metadata ?? {},
      }),
    })

    let payload = (await res.json()) as {
      ok?: boolean
      error?: string
      chunks_created?: number
      chunks_embedded?: number
    }

    // 401 Unauthorized 또는 세션 만료 에러 감지 시 강제 재시도 기동
    const isSessionExpired = 
      res.status === 401 || 
      (typeof payload.error === 'string' && payload.error.includes('세션'))

    if (isSessionExpired && !isRetry) {
      console.warn('[KnowledgeIngest] Unauthorized or invalid session. Attempting to force refresh and retry...')
      try {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
        if (!refreshError && refreshData?.session?.access_token) {
          accessToken = refreshData.session.access_token
          console.log('[KnowledgeIngest] Token refresh succeeded. Retrying knowledge-ingest request...')
          
          res = await fetch(knowledgeIngestUrl(), {
            method: 'POST',
            mode: 'cors',
            credentials: 'omit',
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'x-client-info': 'nh-ai-hub',
            },
            body: JSON.stringify({
              type: params.type,
              title: params.title,
              content: params.content,
              source_url: params.sourceUrl ?? null,
              source_drive_id: params.sourceDriveId ?? null,
              source_file_name: params.sourceFileName ?? null,
              visibility: params.visibility ?? 'public',
              department: params.department ?? null,
              metadata: params.metadata ?? {},
            }),
          })
          payload = (await res.json()) as {
            ok?: boolean
            error?: string
            chunks_created?: number
            chunks_embedded?: number
          }
        } else {
          console.error('[KnowledgeIngest] Force token refresh failed during retry:', refreshError)
        }
      } catch (refreshEx) {
        console.error('[KnowledgeIngest] Force token refresh exception during retry:', refreshEx)
      }
    }

    if (!res.ok) {
      return { ok: false, message: payload.error ?? `인입 서비스 오류 (${res.status})` }
    }

    return {
      ok: true,
      chunksCreated: payload.chunks_created ?? 0,
      chunksEmbedded: payload.chunks_embedded ?? 0,
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : '지식 그래프 인입에 실패했습니다.',
    }
  }
}

/**
 * 텍스트 파일(.txt, .md)을 읽어 지식 그래프에 인입합니다.
 * PDF 등 바이너리 파일은 백그라운드에서 process-document 에지 펑션을 트리거하여 인입합니다.
 */
export async function ingestKnowledgeFile(
  file: File,
  meta: {
    userId: string
    fileUrl: string
    department?: string
    category?: string
    documentId?: string
  },
): Promise<KnowledgeIngestResult | null> {
  const supportedTypes = ['text/plain', 'text/markdown', 'text/x-markdown']
  const isText =
    supportedTypes.includes(file.type) ||
    file.name.endsWith('.md') ||
    file.name.endsWith('.txt')

  if (!isText) {
    if (!meta.documentId) {
      console.warn('[ingestKnowledgeFile] 바이너리 파일 RAG 연동을 위한 documentId가 전달되지 않았습니다.')
      return { ok: false, message: '바이너리 파일 RAG 처리를 위한 문서 ID가 누락되었습니다.' }
    }
    
    // 백그라운드 비동기 RAG 파이프라인 트리거
    console.log(`[ingestKnowledgeFile] 바이너리 파일 감지: ${file.name}. RAG 파이프라인 트리거 중... (ID: ${meta.documentId})`)
    
    // 비동기로 호출하고 결과 맵핑 (UI 블로킹 방지를 위해 백그라운드 구동)
    void invokeProcessDocument(meta.documentId, 'knowledge_base')
      .then((res: any) => {
        if (res.ok) {
          console.log(`[ingestKnowledgeFile] RAG 자동 파이프라인 완료: 청크 ${res.chunks}개 생성됨.`)
        } else {
          console.error(`[ingestKnowledgeFile] RAG 자동 파이프라인 오류:`, res.message)
        }
      })
      .catch((e: any) => {
        console.error(`[ingestKnowledgeFile] RAG 자동 파이프라인 실패:`, e)
      })

    // 클라이언트에는 즉시 트리거 성공 응답 반환
    return { ok: true, chunksCreated: 1, chunksEmbedded: 1 }
  }

  let content: string
  try {
    content = await file.text()
  } catch {
    return { ok: false, message: '파일 텍스트 읽기에 실패했습니다.' }
  }

  return ingestKnowledgeText({
    type: 'INSERT',
    title: file.name.replace(/\.[^.]+$/, ''),
    content,
    sourceUrl: meta.fileUrl,
    sourceFileName: file.name,
    visibility: 'public',
    department: meta.department,
    metadata: { category: meta.category, uploader_id: meta.userId },
  })
}

/**
 * Google Drive 파일 텍스트를 지식 그래프에 인입합니다.
 * drive-service readText 액션으로 텍스트를 가져온 뒤 인입합니다.
 */
export async function ingestDriveFile(params: {
  driveFileId: string
  fileName: string
  content: string
  department?: string
}): Promise<KnowledgeIngestResult> {
  return ingestKnowledgeText({
    type: 'UPDATE',
    title: params.fileName,
    content: params.content,
    sourceDriveId: params.driveFileId,
    sourceFileName: params.fileName,
    visibility: 'public',
    department: params.department,
    metadata: { source: 'google_drive' },
  })
}
