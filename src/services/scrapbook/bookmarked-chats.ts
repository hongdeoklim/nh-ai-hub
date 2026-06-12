import type { SupabaseClient } from '@supabase/supabase-js'

export type BookmarkedChatRow = {
  id: string
  user_id: string
  prompt: string
  ai_response: string
  note: string
  created_at: string
}

export async function insertBookmarkedChat(
  client: SupabaseClient,
  args: {
    userId: string
    prompt: string
    aiResponse: string
    note?: string
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await client.from('bookmarked_chats').insert({
    user_id: args.userId,
    prompt: args.prompt,
    ai_response: args.aiResponse,
    note: args.note ?? '',
  })

  if (error) {
    console.error('[bookmarked_chats] insert 실패', error)
    return {
      ok: false,
      message:
        error.message ?? '스크랩 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    }
  }
  return { ok: true }
}

export async function fetchMyBookmarkedChats(
  client: SupabaseClient,
  userId: string,
): Promise<
  { ok: true; rows: BookmarkedChatRow[] } | { ok: false; message: string }
> {
  const { data, error } = await client
    .from('bookmarked_chats')
    .select('id, user_id, prompt, ai_response, note, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[bookmarked_chats] 조회 실패', error)
    return {
      ok: false,
      message:
        error.message ??
        '스크랩 목록을 불러오지 못했습니다. 스키마 마이그레이션 적용 여부를 확인해 주세요.',
    }
  }

  return { ok: true, rows: (data ?? []) as BookmarkedChatRow[] }
}
