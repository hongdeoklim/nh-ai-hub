import type { SupabaseClient } from '@supabase/supabase-js'

import {
  DEEP_RESEARCH_FUNCTION,
  fetchEdgeFunction,
} from './api'

export type DeepResearchResult =
  | { ok: true; content: string; modelsUsed: string[] }
  | { ok: false; message: string; httpStatus?: number; aborted?: boolean }

export async function invokeDeepResearch(params: {
  supabase: SupabaseClient
  prompt: string
  signal?: AbortSignal
}): Promise<DeepResearchResult> {
  const {
    data: { session },
  } = await params.supabase.auth.getSession()
  if (!session) {
    return { ok: false, message: '로그인 세션이 없습니다. 다시 로그인해 주세요.' }
  }

  let res: Response
  try {
    res = await fetchEdgeFunction(DEEP_RESEARCH_FUNCTION, {
      method: 'POST',
      accessToken: session.access_token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: params.prompt }),
      signal: params.signal,
    })
  } catch (error) {
    if (
      params.signal?.aborted ||
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      return { ok: false, message: 'aborted', aborted: true }
    }
    const message =
      error instanceof Error
        ? error.message
        : 'Edge Function 호출에 실패했습니다.'
    return { ok: false, message }
  }

  let body: {
    ok?: boolean
    content?: string
    modelsUsed?: string[]
    error?: string
  } = {}

  try {
    body = (await res.json()) as typeof body
  } catch {
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        message: text || `심층 연구 오류 (${res.status})`,
        httpStatus: res.status,
      }
    }
    return { ok: false, message: 'deep-research 응답 형식 오류', httpStatus: res.status }
  }

  if (!res.ok) {
    const message =
      typeof body.error === 'string' && body.error.length > 0
        ? body.error
        : `심층 연구 오류 (${res.status})`
    return { ok: false, message, httpStatus: res.status }
  }

  if (body.ok === true && typeof body.content === 'string') {
    return {
      ok: true,
      content: body.content,
      modelsUsed: Array.isArray(body.modelsUsed)
        ? body.modelsUsed.map(String)
        : [],
    }
  }

  const message =
    typeof body.error === 'string' && body.error.length > 0
      ? body.error
      : '심층 연구 요청에 실패했습니다.'

  return { ok: false, message, httpStatus: res.status }
}
