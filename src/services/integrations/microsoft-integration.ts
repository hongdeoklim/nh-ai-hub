import { supabase } from '../../lib/supabase'

const fnUrl = (name: string) => {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  if (!base) throw new Error('VITE_SUPABASE_URL 이 필요합니다.')
  return `${base}/functions/v1/${name}`
}

export type MicrosoftIntegrationStatus = {
  connected: boolean
  email: string | null
}

export async function fetchMicrosoftIntegrationStatus(): Promise<MicrosoftIntegrationStatus> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('로그인이 필요합니다.')

  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!anon) throw new Error('VITE_SUPABASE_ANON_KEY 가 필요합니다.')

  const res = await fetch(fnUrl('integration-microsoft-status'), {
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

  const j = (await res.json()) as {
    connected?: boolean
    email?: string | null
  }
  return {
    connected: Boolean(j.connected),
    email: j.email ?? null,
  }
}

export async function startMicrosoftIntegrationOAuth(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('로그인이 필요합니다.')

  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!anon) throw new Error('VITE_SUPABASE_ANON_KEY 가 필요합니다.')

  const res = await fetch(fnUrl('integration-microsoft-start'), {
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
    throw new Error(msg || `OAuth 시작 실패 (${res.status})`)
  }

  const j = (await res.json()) as { authUrl?: string; url?: string }
  const redirectUrl = j.authUrl ?? j.url
  if (!redirectUrl) throw new Error('OAuth URL 을 받지 못했습니다.')
  window.location.assign(redirectUrl)
}

export async function disconnectMicrosoftIntegration(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('로그인이 필요합니다.')

  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!anon) throw new Error('VITE_SUPABASE_ANON_KEY 가 필요합니다.')

  const res = await fetch(fnUrl('integration-microsoft-disconnect'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: anon,
    },
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `연동 해제 실패 (${res.status})`)
  }
}
