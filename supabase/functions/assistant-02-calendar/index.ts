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
    let body: { user_id?: string; max_results?: number; time_min?: string; time_max?: string } = {}

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

    const timeMin = body.time_min?.trim() || new Date().toISOString()
    const timeMax = body.time_max?.trim()
    if (!Number.isFinite(Date.parse(timeMin)) || (timeMax && !Number.isFinite(Date.parse(timeMax)))) {
      throw new Error('일정 조회 시간 형식이 올바르지 않습니다.')
    }
    const maxResults = Math.min(10, Math.max(1, Number(body.max_results ?? 3)))
    const params = new URLSearchParams({
      timeMin,
      maxResults: String(maxResults),
      singleEvents: 'true',
      orderBy: 'startTime',
    })
    if (timeMax) params.set('timeMax', timeMax)
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!res.ok) throw new Error('Calendar API 호출 실패')
    const data = await res.json() as {
      items?: Array<{
        id?: string
        summary?: string
        start?: { dateTime?: string; date?: string }
        end?: { dateTime?: string; date?: string }
        htmlLink?: string
      }>
    }

    const items = (data.items ?? []).map((item) => ({
      id: item.id ?? null,
      summary: item.summary?.trim() || '(제목 없음)',
      start: item.start?.dateTime ?? item.start?.date ?? null,
      end: item.end?.dateTime ?? item.end?.date ?? null,
      url: item.htmlLink ?? null,
    }))
    const count = items.length
    const resultText = count > 0
      ? [`다가오는 일정 ${count}건입니다.`, ...items.map((item, index) => `${index + 1}. ${item.summary} — ${item.start ?? '시간 미정'}`)].join('\n')
      : '다가오는 일정이 없습니다.'

    // Log to DB
    const { error: logError } = await supabase
      .from('ai_assistant_logs')
      .insert({
        user_id: user_id,
        assistant_name: '02_calendar_assistant',
        task_description: '다가오는 일정 확인 및 브리핑',
        result_text: resultText
      })

    if (logError) throw logError

    return jsonResponse({ success: true, message: resultText, count, items, range: { timeMin, timeMax: timeMax ?? null } })
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : String(error) }, 200)
  }
})
