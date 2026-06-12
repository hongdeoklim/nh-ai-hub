import type { SupabaseClient } from '@supabase/supabase-js'

import { AI_CHAT_FUNCTION, fetchEdgeFunction } from './api'

export type MediaActionType = 'image' | 'video'

export type InvokeMediaRouterParams = {
  supabase: SupabaseClient
  activeModel: string
  actionType: MediaActionType
  prompt: string
  /** Supabase ai_models.api_id — 미디어 전용 엔진 */
  mediaModelId?: string
  signal?: AbortSignal
}

export type InvokeMediaRouterResult =
  | {
      ok: true
      markdown: string
      mediaUrl?: string
      provider?: string
      model?: string
      routedVia?: string
    }
  | { ok: false; message: string; httpStatus?: number; aborted?: boolean }

function buildImageMarkdown(prompt: string, mediaUrl: string): string {
  const alt = prompt.slice(0, 80).replace(/[\[\]]/g, '') || '생성 이미지'
  return `![${alt}](${mediaUrl})`
}

export async function invokeMediaRouter(
  params: InvokeMediaRouterParams,
): Promise<InvokeMediaRouterResult> {
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

  const mediaModelId = params.mediaModelId?.trim() ?? ''

  let res: Response
  try {
    res = await fetchEdgeFunction(AI_CHAT_FUNCTION, {
      method: 'POST',
      accessToken: session.access_token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeModel: params.activeModel.trim() || 'gemini-2.5-flash',
        actionType: params.actionType,
        prompt,
        ...(mediaModelId.length > 0 ? { model_id: mediaModelId } : {}),
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

  if (params.actionType === 'image') {
    let body: {
      success?: boolean
      error?: string
      mediaUrl?: string
    } = {}
    try {
      body = (await res.json()) as typeof body
    } catch {
      return {
        ok: false,
        message: `미디어 라우터 오류 (${res.status})`,
        httpStatus: res.status,
      }
    }

    if (!res.ok || body.success !== true || !body.mediaUrl) {
      return {
        ok: false,
        message: body.error ?? `미디어 라우터 오류 (${res.status})`,
        httpStatus: res.status,
      }
    }

    const mediaUrl = body.mediaUrl
    return {
      ok: true,
      mediaUrl,
      markdown: buildImageMarkdown(prompt, mediaUrl),
    }
  }

  let body: {
    ok?: boolean
    error?: string
    markdown?: string
    provider?: string
    model?: string
    routedVia?: string
  } = {}
  try {
    body = (await res.json()) as typeof body
  } catch {
    return {
      ok: false,
      message: `미디어 라우터 오류 (${res.status})`,
      httpStatus: res.status,
    }
  }

  if (!res.ok || !body.ok) {
    return {
      ok: false,
      message: body.error ?? `미디어 라우터 오류 (${res.status})`,
      httpStatus: res.status,
    }
  }

  return {
    ok: true,
    markdown: body.markdown ?? '',
    provider: body.provider,
    model: body.model,
    routedVia: body.routedVia,
  }
}
