import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import {
  isValidSupabaseProjectUrl,
  readSupabaseEnv,
} from '../utils/supabaseClient'

export type SupabaseEnvStatus = {
  configured: boolean
  missing: string[]
  message: string | null
}

function buildSupabaseEnvStatus(): SupabaseEnvStatus {
  const { url, anonKey } = readSupabaseEnv()
  const missing: string[] = []
  if (!url) missing.push('VITE_SUPABASE_URL')
  if (!anonKey) missing.push('VITE_SUPABASE_ANON_KEY')

  if (missing.length > 0) {
    const message =
      `[nh-ai-hub] Supabase 환경 변수가 누락되었습니다: ${missing.join(', ')}. ` +
      '로그인·채팅 기능이 동작하지 않을 수 있습니다. .env 또는 호스팅 환경 변수를 확인하세요. ' +
      '프로덕션 배포는 DEPLOY_GUIDE.md 및 Vercel Environment Variables 를 참고하세요.'
    if (import.meta.env.PROD) {
      console.error(message)
    } else {
      console.warn(message)
    }
    return { configured: false, missing, message }
  }

  if (import.meta.env.PROD && !isValidSupabaseProjectUrl(url)) {
    const formatMsg =
      `[nh-ai-hub] VITE_SUPABASE_URL 형식이 올바르지 않습니다. ` +
      `https://<project-ref>.supabase.co 형태여야 합니다. 현재 값: "${url}"`
    console.error(formatMsg)
    return {
      configured: false,
      missing: ['VITE_SUPABASE_URL (잘못된 형식)'],
      message: formatMsg,
    }
  }

  return { configured: true, missing: [], message: null }
}

/** 브라우저 런타임 Supabase 설정 상태 (UI/디버그용) */
export const supabaseEnvStatus: SupabaseEnvStatus = buildSupabaseEnvStatus()

export const isSupabaseConfigured = supabaseEnvStatus.configured

const { url, anonKey } = readSupabaseEnv()

/**
 * 환경 변수 누락 시에도 앱 전체가 throw 로 죽지 않도록 placeholder 로 초기화합니다.
 * 실제 API 호출은 실패하지만 React 트리는 마운트됩니다 (DEV 전용 관대 모드).
 * PROD 에서는 main.tsx 가 assertSupabaseEnvConfigured() 로 시작 전에 차단합니다.
 */
export const supabase: SupabaseClient = createClient(
  url || 'https://invalid.supabase.co',
  anonKey || 'missing-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
