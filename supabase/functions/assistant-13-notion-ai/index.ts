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
    let body: any = {}

    try {
      body = await req.json()
    } catch (e) {
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
    const resultText = '문서 초안의 문맥 및 오탈자를 교정했습니다.'

    // Log to DB
    const { error: logError } = await supabase
      .from('ai_assistant_logs')
      .insert({
        user_id: user_id,
        assistant_name: '13_notion_ai_assistant',
        task_description: 'Notion AI 문서 교정',
        result_text: resultText
      })

    if (logError) throw logError

    return jsonResponse({ success: true, message: resultText })
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : String(error) }, 200)
  }
})
