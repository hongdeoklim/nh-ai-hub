import { supabase } from '../../lib/supabase'

export type PushTarget =
  | { target_type: 'all' }
  | { target_type: 'department'; target_value: string }
  | { target_type: 'user'; target_value: string }

export type SendPushResult = {
  ok: boolean
  configured?: boolean
  recipients?: number
  success?: number
  inapp?: number
  error?: string
}

export async function sendPush(input: {
  title: string
  body: string
  url?: string
  target: PushTarget
}): Promise<SendPushResult> {
  const { data: session } = await supabase.auth.getSession()
  if (!session.session) return { ok: false, error: '로그인이 필요합니다.' }
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  if (!base) return { ok: false, error: 'Supabase URL이 설정되지 않았습니다.' }

  const res = await fetch(`${base}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      url: input.url,
      ...input.target,
    }),
  })
  const payload = (await res.json().catch(() => ({}))) as SendPushResult
  if (!res.ok && payload.error === undefined) {
    return { ok: false, error: `요청 실패 (${res.status})` }
  }
  return payload
}
