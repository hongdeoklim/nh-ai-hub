/**
 * Supabase 클라이언트(Vite) 환경 변수 읽기·검증
 * — 배포 전 `npm run deploy:check-env` 및 DEPLOY_GUIDE.md 참고
 */

const SUPABASE_PROJECT_URL_REGEX = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i

export class SupabaseEnvValidationError extends Error {
  readonly missing: string[]

  constructor(message: string, missing: string[] = []) {
    super(message)
    this.name = 'SupabaseEnvValidationError'
    this.missing = missing
  }
}

/** VITE_SUPABASE_* 값을 trim 하여 안전하게 읽습니다. */
export function readSupabaseEnv(): { url: string; anonKey: string } {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''
  return { url, anonKey }
}

/** Supabase 프로젝트 URL 형식(https://*.supabase.co) 여부 */
export function isValidSupabaseProjectUrl(url: string): boolean {
  if (!url) return false
  return SUPABASE_PROJECT_URL_REGEX.test(url.replace(/\/$/, ''))
}

function assertValidSupabaseUrl(url: string): void {
  if (isValidSupabaseProjectUrl(url)) return

  throw new SupabaseEnvValidationError(
    `[nh-ai-hub] VITE_SUPABASE_URL 형식이 올바르지 않습니다. ` +
      `https://<project-ref>.supabase.co 형태여야 합니다. 현재 값: "${url || '(비어 있음)'}"`,
    ['VITE_SUPABASE_URL'],
  )
}

/**
 * 필수 Supabase 환경 변수 검증.
 * 누락·공백·(PROD) 잘못된 URL 형식 시 SupabaseEnvValidationError 를 던집니다.
 */
export function validateSupabaseEnv(): { url: string; anonKey: string } {
  const { url, anonKey } = readSupabaseEnv()
  const missing: string[] = []
  if (!url) missing.push('VITE_SUPABASE_URL')
  if (!anonKey) missing.push('VITE_SUPABASE_ANON_KEY')

  if (missing.length > 0) {
    throw new SupabaseEnvValidationError(
      `[nh-ai-hub] Supabase 환경 변수가 누락되었거나 비어 있습니다: ${missing.join(', ')}. ` +
        'Vercel Dashboard → Settings → Environment Variables 에서 설정하거나 .env / .env.production 을 확인하세요.',
      missing,
    )
  }

  if (import.meta.env.PROD) {
    assertValidSupabaseUrl(url)
  } else if (!isValidSupabaseProjectUrl(url)) {
    console.warn(
      `[nh-ai-hub] VITE_SUPABASE_URL 형식이 supabase.co 프로젝트 URL과 다릅니다: ${url}`,
    )
  }

  return { url, anonKey }
}

/** 앱 시작 시 PROD 에서 호출 — 미설정 시 throw */
export function assertSupabaseEnvConfigured(): { url: string; anonKey: string } {
  return validateSupabaseEnv()
}
