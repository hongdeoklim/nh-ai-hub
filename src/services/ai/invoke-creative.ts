import type { SupabaseClient } from '@supabase/supabase-js'

import type { ComposerToolMode } from '../../types/composer-tools'
import { fetchEdgeFunction } from './api'

export const CREATIVE_GENERATE_FUNCTION = 'creative-generate'

export type InvokeCreativeParams = {
  supabase: SupabaseClient
  tool: Exclude<ComposerToolMode, 'canvas'>
  prompt: string
  preferredAi: string
  signal?: AbortSignal
}

export type InvokeCreativeResult =
  | {
      ok: true
      markdown: string
      provider?: string
      model?: string
    }
  | { ok: false; message: string; httpStatus?: number; aborted?: boolean }

export async function invokeCreativeGenerate(
  params: InvokeCreativeParams,
): Promise<InvokeCreativeResult> {
  const {
    data: { session },
  } = await params.supabase.auth.getSession()
  if (!session) {
    return { ok: false, message: '로그인 세션이 없습니다.' }
  }

  const prompt = params.prompt.trim()
  if (!prompt.length) {
    return { ok: false, message: '프롬프트를 입력해 주세요.' }
  }

  let res: Response
  try {
    res = await fetchEdgeFunction(CREATIVE_GENERATE_FUNCTION, {
      method: 'POST',
      accessToken: session.access_token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: params.tool,
        prompt,
        preferredAi: params.preferredAi,
      }),
      signal: params.signal,
    })
  } catch (e) {
    if (
      params.signal?.aborted ||
      (e instanceof DOMException && e.name === 'AbortError') ||
      (e instanceof Error && e.name === 'AbortError')
    ) {
      return { ok: false, message: 'aborted', aborted: true }
    }
    return {
      ok: false,
      message: e instanceof Error ? e.message : '미디어 생성 요청에 실패했습니다.',
    }
  }

  let body: {
    ok?: boolean
    error?: string
    markdown?: string
    provider?: string
    model?: string
  } = {}
  try {
    body = (await res.json()) as typeof body
  } catch {
    return { ok: false, message: `미디어 생성 오류 (${res.status})`, httpStatus: res.status }
  }

  if (!res.ok || !body.ok) {
    return {
      ok: false,
      message: body.error ?? `미디어 생성 오류 (${res.status})`,
      httpStatus: res.status,
    }
  }

  return {
    ok: true,
    markdown: body.markdown ?? '',
    provider: body.provider,
    model: body.model,
  }
}
