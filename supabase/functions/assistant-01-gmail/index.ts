import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.107.0'
import { handleCorsPreflight, jsonResponse } from '../_shared/cors.ts'
import { getGoogleAccessTokenForUser } from '../_shared/google-user-access-token.ts'

serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase environment variables missing')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header (JWT or Service Key required)')

    const token = authHeader.replace('Bearer ', '').trim()
    let user_id = ''
    let body: { user_id?: string; max_results?: number } = {}

    try {
      body = await req.json()
    } catch {
      // ignore
    }

    if (token === supabaseServiceKey) {
      // Called via pg_cron or server-side orchestrator
      user_id = body.user_id
    } else {
      // Called via Frontend with user JWT
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (authError || !user) throw new Error('Unauthorized: Invalid JWT')
      user_id = user.id
    }

    if (!user_id) throw new Error('user_id is required')

    // Assistant Specific Logic
    const accessToken = await getGoogleAccessTokenForUser(user_id)
    if (!accessToken) throw new Error('Google OAuth 연동이 필요합니다.')

    const maxResults = Math.min(10, Math.max(1, Number(body.max_results ?? 5)))
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=UNREAD&maxResults=${maxResults}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!res.ok) throw new Error('Gmail API 호출 실패')
    const data = await res.json() as { messages?: Array<{ id: string; threadId?: string }> }

    const messages = await Promise.all((data.messages ?? []).map(async (message) => {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!detailRes.ok) return null
      const detail = await detailRes.json() as {
        id?: string
        threadId?: string
        snippet?: string
        payload?: { headers?: Array<{ name?: string; value?: string }> }
      }
      const headers = detail.payload?.headers ?? []
      const header = (name: string) =>
        headers.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
      return {
        id: detail.id ?? message.id,
        threadId: detail.threadId ?? message.threadId ?? null,
        from: header('From'),
        subject: header('Subject') || '(제목 없음)',
        date: header('Date'),
        snippet: detail.snippet ?? '',
      }
    }))

    const items = messages.filter((item): item is NonNullable<typeof item> => Boolean(item))

    const count = items.length
    const resultText = count > 0
      ? [`안 읽은 메일 ${count}건입니다.`, ...items.map((item, index) => `${index + 1}. ${item.subject} — ${item.from || '발신자 미상'}`)].join('\n')
      : '새로운 메일이 없습니다.'

    // Log to DB
    const { error: logError } = await supabase
      .from('ai_assistant_logs')
      .insert({
        user_id: user_id,
        assistant_name: '01_gmail_assistant',
        task_description: '안 읽은 메일 제목 및 발신자 요약',
        result_text: resultText
      })

    if (logError) throw logError

    return jsonResponse({ success: true, message: resultText, count, items })
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : String(error) }, 200)
  }
})
