import type { SupabaseClient } from '@supabase/supabase-js'

export async function fetchUserAiProfileMarkdown(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_ai_profile_context')
    .select('context_markdown')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) return null
  const text = String((data as { context_markdown?: string }).context_markdown ?? '')
  return text
}

export async function upsertUserAiProfileMarkdown(
  supabase: SupabaseClient,
  userId: string,
  markdown: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = markdown.trimEnd()
  const now = new Date().toISOString()

  const { error } = await supabase.from('user_ai_profile_context').upsert(
    {
      user_id: userId,
      context_markdown: trimmed,
      updated_at: now,
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    console.error('[user-ai-profile-context] upsert 실패', error)
    return { ok: false, message: error.message ?? '저장에 실패했습니다.' }
  }

  return { ok: true }
}
