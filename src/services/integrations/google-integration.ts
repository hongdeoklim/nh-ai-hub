import { supabase } from '../../lib/supabase'

const fnUrl = (name: string) => {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  if (!base) throw new Error('VITE_SUPABASE_URL 이 필요합니다.')
  return `${base}/functions/v1/${name}`
}

export type GoogleIntegrationStatus = {
  connected: boolean
  email: string | null
}

export async function fetchGoogleIntegrationStatus(): Promise<GoogleIntegrationStatus> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('로그인이 필요합니다.')

  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!anon) throw new Error('VITE_SUPABASE_ANON_KEY 가 필요합니다.')

  const res = await fetch(fnUrl('integration-google-status'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: anon,
    },
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `상태 조회 실패 (${res.status})`)
  }

  return (await res.json()) as GoogleIntegrationStatus
}

export async function startGoogleIntegrationOAuth(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('로그인이 필요합니다.')

  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!anon) throw new Error('VITE_SUPABASE_ANON_KEY 가 필요합니다.')

  const res = await fetch(fnUrl('integration-google-start'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: anon,
    },
  })

  if (!res.ok) {
    let msg = await res.text()
    try {
      const j = JSON.parse(msg) as { error?: string }
      if (j?.error) msg = j.error
    } catch {
      /* keep */
    }
    throw new Error(msg || `연동 시작 실패 (${res.status})`)
  }

  const data = (await res.json()) as { authUrl?: string }
  if (!data.authUrl) throw new Error('authUrl 응답이 없습니다.')

  window.location.href = data.authUrl
}

export async function disconnectGoogleIntegration(): Promise<void> {
  const { error } = await supabase.functions.invoke(
    'integration-google-disconnect',
    { method: 'POST' },
  )
  if (error) throw new Error(error.message)
}
