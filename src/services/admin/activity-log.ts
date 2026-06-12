import { supabase } from '../../lib/supabase'

export type AdminActivityAction =
  | 'user_add'
  | 'user_edit'
  | 'user_delete'
  | 'admin_prompt_create'
  | 'admin_prompt_edit'
  | 'admin_prompt_delete'
  | 'token_grant'
  | 'team_create'
  | 'team_member_add'
  | 'team_member_remove'
  | 'team_edit'
  | 'team_delete'
  | 'ai_model_create'
  | 'ai_model_update'
  | 'ai_model_activate'
  | 'ai_model_deactivate'

export async function logAdminActivity(
  actionType: AdminActivityAction,
  description: string,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc('log_admin_activity', {
    p_action_type: actionType,
    p_description: description,
  })

  if (error) {
    console.error('[activity-log]', error)
    return { ok: false, message: error.message }
  }

  return { ok: true, id: String(data) }
}
