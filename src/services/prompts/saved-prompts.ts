import type { SupabaseClient } from '@supabase/supabase-js'

import type { SavedPromptRow } from '../../types/prompts'

export async function fetchPublicPrompts(
  supabase: SupabaseClient,
): Promise<SavedPromptRow[]> {
  const { data, error } = await supabase
    .from('saved_prompts')
    .select('id, user_id, title, content, is_public, created_at')
    .eq('is_public', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[saved-prompts] 공개 프롬프트 조회 실패', error)
    return []
  }
  return (data ?? []) as SavedPromptRow[]
}

export async function fetchMyPrivatePrompts(
  supabase: SupabaseClient,
  userId: string,
): Promise<SavedPromptRow[]> {
  const { data, error } = await supabase
    .from('saved_prompts')
    .select('id, user_id, title, content, is_public, created_at')
    .eq('user_id', userId)
    .eq('is_public', false)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[saved-prompts] 내 프롬프트 조회 실패', error)
    return []
  }
  return (data ?? []) as SavedPromptRow[]
}

export async function createPrivatePrompt(
  supabase: SupabaseClient,
  params: { userId: string; title: string; content: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const title = params.title.trim()
  const content = params.content.trim()
  if (!title.length || !content.length) {
    return { ok: false, message: '제목과 내용을 입력해 주세요.' }
  }

  const { error } = await supabase.from('saved_prompts').insert({
    user_id: params.userId,
    title,
    content,
    is_public: false,
  })

  if (error) {
    console.error('[saved-prompts] 저장 실패', error)
    return { ok: false, message: error.message }
  }
  return { ok: true }
}

export async function deleteMyPrompt(
  supabase: SupabaseClient,
  promptId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.from('saved_prompts').delete().eq('id', promptId)

  if (error) {
    console.error('[saved-prompts] 삭제 실패', error)
    return { ok: false, message: error.message }
  }
  return { ok: true }
}
