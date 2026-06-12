import { supabase } from '../../lib/supabase'

export async function invokeGoogleWorkspaceApi<T = unknown>(
  action: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('google-workspace-api', {
    body: { action, payload: payload ?? {} },
  })
  if (error) throw new Error(error.message)
  return data as T
}

export async function invokeMicrosoftGraphApi<T = unknown>(
  action: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('microsoft-graph-api', {
    body: { action, payload: payload ?? {} },
  })
  if (error) throw new Error(error.message)
  return data as T
}

export type UploadedDocRow = {
  id: string
  kind: string
  original_name: string
  storage_object_path: string
  created_at: string
}

export async function uploadUserDocument(
  file: File,
  note?: string,
): Promise<{ ok: true; document: UploadedDocRow }> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('로그인이 필요합니다.')

  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  if (!base) throw new Error('VITE_SUPABASE_URL 필요')
  const url = `${base}/functions/v1/user-document-upload`
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!anon) throw new Error('VITE_SUPABASE_ANON_KEY 필요')

  const fd = new FormData()
  fd.set('file', file)
  if (note?.trim()) fd.set('note', note.trim())

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: anon,
    },
    body: fd,
  })

  const j = (await res.json()) as { ok?: boolean; document?: UploadedDocRow; error?: string }
  if (!res.ok || !j.ok || !j.document) {
    throw new Error(j.error ?? `업로드 실패 (${res.status})`)
  }
  return { ok: true, document: j.document }
}
