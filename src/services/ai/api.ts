import { readSupabaseEnv } from '../../utils/supabaseClient'

const LOCAL_SUPABASE_HOST_PATTERN =
  /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?/i

export type AiTransportMode = 'edge' | 'direct'

export type EdgeFunctionFetchInit = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>
  /** Supabase Auth access_token (JWT). Edge Function 사용자 검증용 */
  accessToken: string
}

/**
 * VITE_SUPABASE_URL 기반 프로젝트 루트 URL (끝 슬래시 제거).
 * 프로덕션에서 localhost/127.0.0.1 이 설정되어 있으면 즉시 오류를 던집니다.
 */
export function getSupabaseProjectUrl(): string {
  const { url } = readSupabaseEnv()
  const trimmed = url.trim().replace(/\/$/, '')

  if (!trimmed) {
    throw new Error(
      'VITE_SUPABASE_URL 이 비어 있습니다. Supabase 클라우드 프로젝트 URL을 .env 에 설정하세요.',
    )
  }

  if (
    import.meta.env.PROD &&
    LOCAL_SUPABASE_HOST_PATTERN.test(trimmed)
  ) {
    throw new Error(
      `프로덕션 빌드에 로컬 Supabase URL(${trimmed})이 설정되어 있습니다. ` +
        'VITE_SUPABASE_URL 을 https://<project-ref>.supabase.co 형태의 클라우드 주소로 변경하세요.',
    )
  }

  if (
    import.meta.env.DEV &&
    LOCAL_SUPABASE_HOST_PATTERN.test(trimmed)
  ) {
    console.warn(
      `[ai/api] VITE_SUPABASE_URL 이 로컬(${trimmed})입니다. ` +
        '클라우드 Edge Function 을 쓰려면 .env 의 URL 을 배포된 Supabase 프로젝트로 바꾸세요.',
    )
  }

  return trimmed
}

/**
 * Supabase Edge Function 절대 URL.
 * 예: https://xxxx.supabase.co/functions/v1/ai-chat
 */
export function getEdgeFunctionUrl(functionName: string): string {
  const base = getSupabaseProjectUrl()
  const slug = functionName.replace(/^\//, '')
  return `${base}/functions/v1/${slug}`
}

/** Edge Function 호출에 필요한 Supabase 표준 헤더 */
export function buildEdgeFunctionHeaders(
  accessToken: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!anonKey) {
    throw new Error(
      'VITE_SUPABASE_ANON_KEY 가 없습니다. Supabase anon key 를 .env 에 설정하세요.',
    )
  }

  return {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    'x-client-info': 'nh-ai-hub',
    ...extra,
  }
}

/**
 * AI 호출 경로.
 * - 기본: edge (Supabase Edge Function 경유 — Gemini 등 프로바이더 직접 호출 금지)
 * - direct: 로컬 개발 실험용만 (브라우저 CORS·키 노출 위험)
 * 프로덕션에서는 항상 edge 로 고정합니다.
 */
export function resolveAiTransport(): AiTransportMode {
  const raw = import.meta.env.VITE_AI_TRANSPORT?.trim().toLowerCase()
  if (import.meta.env.PROD) {
    return 'edge'
  }
  return raw === 'direct' ? 'direct' : 'edge'
}

function formatFetchNetworkError(url: string, error: unknown): string {
  const base =
    error instanceof Error ? error.message : '네트워크 오류가 발생했습니다.'
  if (/failed to fetch|networkerror|load failed|cors/i.test(base)) {
    return (
      `Edge Function 에 연결하지 못했습니다 (${base}). ` +
      `요청 URL: ${url}. ` +
      'VITE_SUPABASE_URL 이 클라우드 프로젝트 주소인지, ai-chat 함수가 배포되어 있는지, ' +
      'config.toml 에 verify_jwt=false 가 적용되어 OPTIONS 프리플라이트가 통과하는지 확인하세요. ' +
      '로그인 세션이 유효한지도 확인하세요. ' +
      '브라우저에서 generativelanguage.googleapis.com 을 직접 호출하지 않습니다 — 반드시 Edge Function 을 경유합니다.'
    )
  }
  return base
}

/**
 * Supabase Edge Function fetch 래퍼 (CORS·네트워크 오류 메시지 보강).
 * Authorization: 사용자 JWT, apikey: anon key (Supabase 표준).
 */
export async function fetchEdgeFunction(
  functionName: string,
  init: EdgeFunctionFetchInit,
): Promise<Response> {
  const url = getEdgeFunctionUrl(functionName)
  const { accessToken, headers: extraHeaders, ...rest } = init

  try {
    return await fetch(url, {
      ...rest,
      mode: 'cors',
      credentials: 'omit',
      headers: buildEdgeFunctionHeaders(accessToken, extraHeaders),
    })
  } catch (error) {
    throw new Error(formatFetchNetworkError(url, error))
  }
}

export const AI_CHAT_FUNCTION = 'ai-chat'
export const DEEP_RESEARCH_FUNCTION = 'deep-research'
