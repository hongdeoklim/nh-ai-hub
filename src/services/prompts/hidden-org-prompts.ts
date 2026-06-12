import type { SupabaseClient } from '@supabase/supabase-js'

export async function fetchHiddenOrgPromptIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('user_hidden_org_prompts')
    .select('prompt_id')
    .eq('user_id', userId)

  if (error) {
    console.error('[hidden-org-prompts] 숨김 목록 조회 실패', error)
    return new Set()
  }
  return new Set((data ?? []).map((row) => (row as { prompt_id: string }).prompt_id))
}

export async function hideOrgPromptForUser(
  supabase: SupabaseClient,
  userId: string,
  promptId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const id = promptId.trim()
  if (!id.length) {
    return { ok: false, message: '잘못된 프롬프트입니다.' }
  }

  const { error } = await supabase.from('user_hidden_org_prompts').upsert(
    { user_id: userId, prompt_id: id },
    { onConflict: 'user_id,prompt_id' },
  )

  if (error) {
    console.error('[hidden-org-prompts] 숨김 저장 실패', error)
    return { ok: false, message: error.message }
  }
  return { ok: true }
}
