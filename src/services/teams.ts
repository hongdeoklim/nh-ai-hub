import type { SupabaseClient } from '@supabase/supabase-js'

export type TeamRow = {
  id: string
  name: string
  created_by: string
  created_at: string
}

export type TeamMemberDirectoryRow = {
  user_id: string
  email: string
  role: string
  joined_at: string
}

export type TeamConversationRow = {
  id: string
  team_id: string
  title: string
  created_by: string
  created_at: string
  updated_at: string
}

export type ChatMessageRow = {
  id: string
  conversation_id: string
  role: string
  content: string
  author_user_id: string | null
  author_label: string | null
  created_at: string
}

export async function fetchMyTeams(
  supabase: SupabaseClient,
): Promise<{ ok: true; rows: TeamRow[] } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .from('teams')
    .select('id,name,created_by,created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[teams] 목록 조회 실패', error)
    return {
      ok: false,
      message: error.message ?? '팀 목록을 불러오지 못했습니다.',
    }
  }

  return { ok: true, rows: (data ?? []) as TeamRow[] }
}

async function authUid(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function createTeam(
  supabase: SupabaseClient,
  name: string,
): Promise<{ ok: true; teamId: string } | { ok: false; message: string }> {
  const trimmed = name.trim()
  const uid = await authUid(supabase)
  if (!uid) return { ok: false, message: '로그인이 필요합니다.' }
  if (trimmed.length < 1) return { ok: false, message: '팀 이름을 입력해 주세요.' }

  const { data: team, error } = await supabase
    .from('teams')
    .insert({ name: trimmed, created_by: uid })
    .select('id')
    .single()

  if (error || !team?.id) {
    console.error('[teams] 생성 실패', error)
    return {
      ok: false,
      message: error?.message ?? '팀 생성에 실패했습니다.',
    }
  }

  const teamId = team.id as string

  const { error: om } = await supabase.from('team_members').insert({
    team_id: teamId,
    user_id: uid,
    role: 'owner',
  })

  if (om) {
    console.error('[teams] 오너 멤버십 추가 실패', om)
    return {
      ok: false,
      message:
        om.message ??
        '팀은 만들어졌으나 소유자 등록에 실패했습니다. 관리자에게 문의하세요.',
    }
  }

  return { ok: true, teamId }
}

export async function fetchTeamDirectory(
  supabase: SupabaseClient,
  teamId: string,
): Promise<
  { ok: true; rows: TeamMemberDirectoryRow[] } | { ok: false; message: string }
> {
  const { data, error } = await supabase.rpc('team_members_with_email', {
    p_team_id: teamId,
  })

  if (error) {
    console.error('[teams] 디렉터리 RPC 실패', error)
    return { ok: false, message: error.message ?? '멤버 목록을 불러오지 못했습니다.' }
  }

  return {
    ok: true,
    rows: (data ?? []) as TeamMemberDirectoryRow[],
  }
}

export async function inviteTeamMemberByEmail(
  supabase: SupabaseClient,
  teamId: string,
  email: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = email.trim().toLowerCase()
  if (trimmed.length < 3) return { ok: false, message: '이메일을 확인해 주세요.' }

  const { error } = await supabase.rpc('add_team_member_by_email', {
    p_team_id: teamId,
    p_email: trimmed,
  })

  if (error) {
    const code = error.message ?? ''
    if (code.includes('user_not_found'))
      return {
        ok: false,
        message: '해당 이메일로 가입된 사용자를 찾을 수 없습니다.',
      }
    if (code.includes('not_owner'))
      return { ok: false, message: '팀 오너만 멤버를 추가할 수 있습니다.' }
    return { ok: false, message: error.message ?? '초대에 실패했습니다.' }
  }

  return { ok: true }
}

export async function fetchTeamConversations(
  supabase: SupabaseClient,
  teamId: string,
): Promise<
  { ok: true; rows: TeamConversationRow[] } | { ok: false; message: string }
> {
  const { data, error } = await supabase
    .from('team_conversations')
    .select('id,team_id,title,created_by,created_at,updated_at')
    .eq('team_id', teamId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[teams] 대화 목록 실패', error)
    return { ok: false, message: error.message ?? '대화 목록을 불러오지 못했습니다.' }
  }

  return { ok: true, rows: (data ?? []) as TeamConversationRow[] }
}

export async function createSharedConversation(
  supabase: SupabaseClient,
  params: {
    teamId: string
    title: string
    participantUserIds: string[]
  },
): Promise<
  { ok: true; conversationId: string } | { ok: false; message: string }
> {
  const uid = await authUid(supabase)
  if (!uid) return { ok: false, message: '로그인이 필요합니다.' }

  const title = params.title.trim() || '공유 채팅'
  const participants = [...new Set(params.participantUserIds)]
  if (!participants.includes(uid)) participants.push(uid)

  const { data: conv, error: ce } = await supabase
    .from('team_conversations')
    .insert({
      team_id: params.teamId,
      title,
      created_by: uid,
    })
    .select('id')
    .single()

  if (ce || !conv?.id) {
    console.error('[teams] 대화 생성 실패', ce)
    return { ok: false, message: ce?.message ?? '대화를 만들지 못했습니다.' }
  }

  const conversationId = conv.id as string

  const rows = participants.map((userId) => ({
    conversation_id: conversationId,
    user_id: userId,
  }))

  const { error: pe } = await supabase.from('conversation_participants').insert(rows)

  if (pe) {
    console.error('[teams] 참가자 추가 실패', pe)
    return {
      ok: false,
      message: pe.message ?? '참가자를 등록하지 못했습니다.',
    }
  }

  return { ok: true, conversationId }
}

export async function fetchChatMessages(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<{ ok: true; rows: ChatMessageRow[] } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select(
      'id,conversation_id,role,content,author_user_id,author_label,created_at',
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[teams] 메시지 로드 실패', error)
    return { ok: false, message: error.message ?? '메시지를 불러오지 못했습니다.' }
  }

  return { ok: true, rows: (data ?? []) as ChatMessageRow[] }
}

export type NewChatMessageInput = Pick<
  ChatMessageRow,
  'conversation_id' | 'role' | 'content' | 'author_user_id' | 'author_label'
>

export async function insertChatMessage(
  supabase: SupabaseClient,
  row: NewChatMessageInput,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: row.conversation_id,
      role: row.role,
      content: row.content,
      author_user_id: row.author_user_id,
      author_label: row.author_label,
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    console.error('[teams] 메시지 저장 실패', error)
    return { ok: false, message: error?.message ?? '메시지를 저장하지 못했습니다.' }
  }

  return { ok: true, id: data.id as string }
}

export async function bumpConversationUpdatedAt(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<void> {
  await supabase
    .from('team_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)
}
