import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser'

import { supabase } from './supabase'
import { readSupabaseEnv } from '../utils/supabaseClient'

/**
 * 패스키(지문/FaceID/Windows Hello) 로그인 클라이언트.
 * webauthn 엣지함수와 4단계(등록 begin/finish, 인증 begin/finish)를 주고받는다.
 */

const { url, anonKey } = readSupabaseEnv()
const FN_URL = `${url}/functions/v1/webauthn`

export function isPasskeySupported(): boolean {
  return browserSupportsWebAuthn()
}

async function callFn(action: string, payload: Record<string, unknown>, accessToken?: string) {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `요청 실패 (${res.status})`)
  return data
}

/** 로그인된 상태에서 이 기기에 패스키를 등록한다. */
export async function registerPasskey(deviceLabel?: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('로그인 후 등록할 수 있습니다.')

  const begin = await callFn('register-begin', {}, token)
  const attResp = await startRegistration({ optionsJSON: begin.options })
  await callFn(
    'register-finish',
    { challengeId: begin.challengeId, response: attResp, device_label: deviceLabel },
    token,
  )
}

/** 패스키로 로그인하고 Supabase 세션을 설정한다. */
export async function loginWithPasskey(): Promise<void> {
  const begin = await callFn('auth-begin', {})
  const authResp = await startAuthentication({ optionsJSON: begin.options })
  const finish = await callFn('auth-finish', {
    challengeId: begin.challengeId,
    response: authResp,
  })
  if (!finish.access_token || !finish.refresh_token) {
    throw new Error('세션 발급에 실패했습니다.')
  }
  const { error } = await supabase.auth.setSession({
    access_token: finish.access_token,
    refresh_token: finish.refresh_token,
  })
  if (error) throw error
}

export type PasskeyRow = {
  id: string
  device_label: string | null
  created_at: string
  last_used_at: string | null
}

export async function listMyPasskeys(): Promise<PasskeyRow[]> {
  const { data, error } = await supabase
    .from('user_passkeys')
    .select('id, device_label, created_at, last_used_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PasskeyRow[]
}

export async function deletePasskey(id: string): Promise<void> {
  const { error } = await supabase.from('user_passkeys').delete().eq('id', id)
  if (error) throw error
}
