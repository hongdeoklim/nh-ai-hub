import type { SupabaseClient } from '@supabase/supabase-js'

export type TokenAllocationRequestRow = {
  id: string
  user_id: string
  message: string
  status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  created_at: string
  reviewed_at: string | null
  users?: {
    email: string | null
    display_name: string | null
  } | null
}

export async function submitTokenAllocationRequest(
  supabase: SupabaseClient,
  params: { userId: string; message: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const msg = params.message.trim()
  if (msg.length < 1) {
    return { ok: false, message: '요청 내용을 입력해 주세요.' }
  }

  const { error } = await supabase.from('token_allocation_requests').insert({
    user_id: params.userId,
    message: msg,
    status: 'pending',
  })

  if (error) {
    console.error('[token_allocation_requests] insert 실패', error)
    return { ok: false, message: error.message ?? '요청 전송에 실패했습니다.' }
  }

  return { ok: true }
}

export async function fetchMyTokenAllocationRequests(
  supabase: SupabaseClient,
): Promise<{ ok: true; rows: TokenAllocationRequestRow[] } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .from('token_allocation_requests')
    .select('id,user_id,message,status,admin_notes,created_at,reviewed_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[token_allocation_requests] fetch 내 요청 실패', error)
    return { ok: false, message: error.message ?? '목록을 불러오지 못했습니다.' }
  }

  return { ok: true, rows: (data ?? []) as TokenAllocationRequestRow[] }
}

/** 관리자 RLS 전제 */
export async function fetchPendingTokenAllocationRequestsAdmin(
  supabase: SupabaseClient,
): Promise<{ ok: true; rows: TokenAllocationRequestRow[] } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .from('token_allocation_requests')
    .select(
      'id, user_id, message, status, admin_notes, created_at, reviewed_at, users ( email, display_name )',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[token_allocation_requests] admin 목록 실패', error)
    return { ok: false, message: error.message ?? '목록을 불러오지 못했습니다.' }
  }

  const rows = (data ?? []).map((row) => {
    const raw = row as TokenAllocationRequestRow & {
      users?: { email: string | null; display_name: string | null } | Array<{
        email: string | null
        display_name: string | null
      }> | null
    }
    const linked = raw.users
    const user =
      linked && Array.isArray(linked) ? (linked[0] ?? null) : (linked ?? null)
    return { ...raw, users: user }
  })

  return { ok: true, rows }
}

export async function updateTokenAllocationRequestAdmin(
  supabase: SupabaseClient,
  params: {
    id: string
    status: 'approved' | 'rejected'
    admin_notes?: string
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const patch: Record<string, unknown> = {
    status: params.status,
    reviewed_at: new Date().toISOString(),
  }
  const notes = params.admin_notes?.trim()
  if (notes !== undefined) {
    patch.admin_notes = notes.length > 0 ? notes : null
  }

  const { error } = await supabase
    .from('token_allocation_requests')
    .update(patch)
    .eq('id', params.id)

  if (error) {
    console.error('[token_allocation_requests] admin 업데이트 실패', error)
    return { ok: false, message: error.message ?? '저장에 실패했습니다.' }
  }

  return { ok: true }
}
