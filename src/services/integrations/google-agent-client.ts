import { supabase } from '../../lib/supabase'

export type GoogleAgentAction = 'manage_calendar' | 'update_spreadsheet'

export async function invokeGoogleAgentClient(
  action: GoogleAgentAction,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('google-agent', {
    body: { action, payload },
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'google-agent 응답 형식 오류' }
  }

  return data as Record<string, unknown>
}
