import type { SupabaseClient } from '@supabase/supabase-js'
import { ingestKnowledgeFile, invokeIngestWorker } from '../knowledge-graph/knowledge-ingest-client'

export type KnowledgeBaseRow = {
  id: string
  uploader_id: string
  file_name: string
  file_url: string
  category: string
  target_department: string
  folder_path?: string | null
  created_at: string
  deleted_at?: string | null
}

const KNOWLEDGE_BUCKET = 'knowledge-documents'

// 정상 자료 조회 (deleted_at IS NULL)
export async function fetchKnowledgeBase(
  client: SupabaseClient,
): Promise<
  { ok: true; rows: KnowledgeBaseRow[] } | { ok: false; message: string }
> {
  const { data, error } = await client
    .from('knowledge_base')
    .select(
      'id, uploader_id, file_name, file_url, category, target_department, created_at, deleted_at',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[knowledge_base] 조회 실패', error)
    return {
      ok: false,
      message:
        error.message ??
        '자료 목록을 불러오지 못했습니다.',
    }
  }

  return { ok: true, rows: (data ?? []) as KnowledgeBaseRow[] }
}

// 휴지통 자료 조회 (deleted_at IS NOT NULL)
export async function fetchTrashedKnowledgeBase(
  client: SupabaseClient,
): Promise<
  { ok: true; rows: KnowledgeBaseRow[] } | { ok: false; message: string }
> {
  const { data, error } = await client
    .from('knowledge_base')
    .select(
      'id, uploader_id, file_name, file_url, category, target_department, created_at, deleted_at',
    )
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })

  if (error) {
    console.error('[knowledge_base] 휴지통 조회 실패', error)
    return {
      ok: false,
      message: error.message ?? '휴지통 목록을 불러오지 못했습니다.',
    }
  }

  return { ok: true, rows: (data ?? []) as KnowledgeBaseRow[] }
}

// 휴지통으로 이동 (Soft Delete)
export async function softDeleteKnowledgeBaseDocument(
  client: SupabaseClient,
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await client
    .from('knowledge_base')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    return { ok: false, message: error.message }
  }
  return { ok: true }
}

// 휴지통에서 복원 (Restore)
export async function restoreKnowledgeBaseDocument(
  client: SupabaseClient,
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await client
    .from('knowledge_base')
    .update({ deleted_at: null })
    .eq('id', id)

  if (error) {
    return { ok: false, message: error.message }
  }
  return { ok: true }
}

// 영구 삭제 (Storage 실제 파일 및 DB 레코드 제거)
export async function permanentlyDeleteKnowledgeBaseDocument(
  client: SupabaseClient,
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  // 1. 메타데이터 먼저 확보하여 스토리지 경로 알아내기
  const { data: hit, error: fetchErr } = await client
    .from('knowledge_base')
    .select('file_url')
    .eq('id', id)
    .maybeSingle()

  if (fetchErr || !hit) {
    return { ok: false, message: fetchErr?.message ?? '파일 정보를 찾을 수 없습니다.' }
  }

  // 2. 스토리지 파일 제거
  // kb-storage:knowledge-documents/uploader_id/random_filename.bin 형식 파싱
  const url = hit.file_url ?? ''
  if (url.includes(KNOWLEDGE_BUCKET)) {
    const rawPath = url.split(KNOWLEDGE_BUCKET + '/')[1]
    if (rawPath) {
      const decodedPath = decodeURIComponent(rawPath.split('?')[0])
      await client.storage.from(KNOWLEDGE_BUCKET).remove([decodedPath])
    }
  }

  // 3. DB 레코드 삭제
  const { error: deleteErr } = await client
    .from('knowledge_base')
    .delete()
    .eq('id', id)

  if (deleteErr) {
    return { ok: false, message: deleteErr.message }
  }

  return { ok: true }
}

// 업로드 로직 (deleted_at 기본 null 로 주입)
export async function uploadKnowledgeBaseDocument(
  client: SupabaseClient,
  params: {
    file: File
    userId: string
    targetDepartment: string
    category?: string
  },
): Promise<
  { ok: true; row: KnowledgeBaseRow } | { ok: false; message: string }
> {
  const category = (params.category ?? '미분류').trim() || '미분류'
  const safeName = params.file.name.trim() || 'document.bin'

  const {
    data: { session },
  } = await client.auth.getSession()
  if (!session) return { ok: false, message: '로그인이 필요합니다.' }

  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!base || !anon) return { ok: false, message: '서버 설정 오류' }
  const url = `${base}/functions/v1/knowledge-document-upload`

  const fd = new FormData()
  fd.set('file', params.file)
  fd.set('category', category)
  fd.set('targetDepartment', params.targetDepartment)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: anon,
    },
    body: fd,
  })

  const j = await res.json()
  if (!res.ok || !j.ok || !j.document) {
    return { ok: false, message: j.error ?? '업로드에 실패했습니다.' }
  }

  const data = j.document as KnowledgeBaseRow
  const fileUrl = data.file_url

  // 기존 파이프라인 (텍스트 파일은 직접 ingest, PDF 등은 process-document 경유)

  ingestKnowledgeFile(params.file, {
    userId: params.userId,
    fileUrl,
    department: params.targetDepartment,
    category,
    documentId: data.id,
  }).catch((e) => {
    console.error('[knowledge-ingest] 자동 인입 실패:', e)
  })

  // 백그라운드 워커: DB 트리거로 큐에 들어간 항목을 즉시 처리 (fire-and-forget)
  // process-document가 실패하더라도 워커가 메타데이터 기반 노드를 보장함
  invokeIngestWorker(1).catch((e) => {
    console.warn('[ingest-worker] 백그라운드 적재 트리거 실패:', e)
  })

  return { ok: true, row: data as KnowledgeBaseRow }
}
