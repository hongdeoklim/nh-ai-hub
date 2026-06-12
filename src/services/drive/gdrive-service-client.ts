import { supabase } from '../../lib/supabase'

export type GdriveServiceFile = {
  id: string
  name: string
  mimeType: string
  webViewLink?: string
  webContentLink?: string
  modifiedTime?: string
  size?: string
  downloadUrl?: string
}

export type GdriveServiceFolder = {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
}

export type GdriveListResponse = {
  ok: true
  folderId: string
  rootFolderId: string
  files: GdriveServiceFile[]
  folders: GdriveServiceFolder[]
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

function gdriveServiceUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '')
  if (!base) throw new Error('VITE_SUPABASE_URL 이 설정되지 않았습니다.')
  return `${base}/functions/v1/gdrive-service`
}

export async function fetchGdriveServiceList(
  folderId?: string | null,
): Promise<
  { ok: true; data: GdriveListResponse } | { ok: false; message: string }
> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!anonKey) {
    return { ok: false, message: 'VITE_SUPABASE_ANON_KEY 가 없습니다.' }
  }

  try {
    const accessToken = await getSessionToken()
    const res = await fetch(gdriveServiceUrl(), {
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
        action: 'list',
        folderId: folderId ?? null,
      }),
    })

    const payload = (await res.json()) as {
      ok?: boolean
      error?: string
      files?: GdriveServiceFile[]
      folders?: GdriveServiceFolder[]
      folderId?: string
      rootFolderId?: string
    }

    if (!res.ok) {
      return {
        ok: false,
        message: payload.error ?? `Drive 서비스 오류 (${res.status})`,
      }
    }

    if (!payload.ok || !Array.isArray(payload.files)) {
      return { ok: false, message: 'Drive 목록 응답 형식이 올바르지 않습니다.' }
    }

    return {
      ok: true,
      data: {
        ok: true,
        folderId: payload.folderId ?? '',
        rootFolderId: payload.rootFolderId ?? '',
        files: payload.files,
        folders: payload.folders ?? [],
      },
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Drive 목록을 불러오지 못했습니다.',
    }
  }
}

export type GdriveReadTextResponse = {
  ok: true
  fileId: string
  fileName: string
  text: string
}

export async function fetchGdriveFileText(
  fileId: string,
): Promise<
  { ok: true; data: GdriveReadTextResponse } | { ok: false; message: string }
> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!anonKey) {
    return { ok: false, message: 'VITE_SUPABASE_ANON_KEY 가 없습니다.' }
  }

  const id = fileId.trim()
  if (!id) {
    return { ok: false, message: 'fileId 가 필요합니다.' }
  }

  try {
    const accessToken = await getSessionToken()
    const res = await fetch(gdriveServiceUrl(), {
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
        action: 'readText',
        fileId: id,
      }),
    })

    const payload = (await res.json()) as {
      ok?: boolean
      error?: string
      fileId?: string
      fileName?: string
      text?: string
    }

    if (!res.ok) {
      return {
        ok: false,
        message: payload.error ?? `Drive 텍스트 읽기 오류 (${res.status})`,
      }
    }

    if (
      payload.ok !== true ||
      typeof payload.text !== 'string' ||
      typeof payload.fileName !== 'string'
    ) {
      return { ok: false, message: 'Drive 텍스트 응답 형식이 올바르지 않습니다.' }
    }

    return {
      ok: true,
      data: {
        ok: true,
        fileId: payload.fileId ?? id,
        fileName: payload.fileName,
        text: payload.text,
      },
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Drive 파일 본문을 읽지 못했습니다.',
    }
  }
}
