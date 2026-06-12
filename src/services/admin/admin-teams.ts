import { useCallback, useEffect, useState } from 'react'

import { supabase } from '../../lib/supabase'

export type AdminTeamRow = {
  id: string
  name: string
  created_by: string
  created_at: string
  member_count: number
  creator_display_name: string | null
  creator_email: string
}

export type AdminTeamMemberRow = {
  user_id: string
  email: string
  display_name: string | null
  department: string | null
  role: string
  joined_at: string
}

type CreatorJoin = {
  display_name: string | null
  email: string
}

type TeamListRow = {
  id: string
  name: string
  created_by: string
  created_at: string
  creator: CreatorJoin | CreatorJoin[] | null
  team_members: { count: number }[] | null
}

function pickCreator(
  creator: CreatorJoin | CreatorJoin[] | null,
): CreatorJoin | null {
  if (!creator) return null
  return Array.isArray(creator) ? (creator[0] ?? null) : creator
}

function mapTeamRow(row: TeamListRow): AdminTeamRow {
  const creator = pickCreator(row.creator)
  const count = row.team_members?.[0]?.count ?? 0
  return {
    id: row.id,
    name: row.name,
    created_by: row.created_by,
    created_at: row.created_at,
    member_count: count,
    creator_display_name: creator?.display_name ?? null,
    creator_email: creator?.email ?? '',
  }
}

export function creatorLabel(row: Pick<
  AdminTeamRow,
  'creator_display_name' | 'creator_email'
>): string {
  const name = row.creator_display_name?.trim()
  if (name && name.length > 0) return name
  return row.creator_email || '—'
}

export async function fetchAdminTeams(): Promise<
  { ok: true; rows: AdminTeamRow[] } | { ok: false; message: string }
> {
  const { data, error } = await supabase
    .from('teams')
    .select(
      `
      id,
      name,
      created_by,
      created_at,
      creator:users!teams_created_by_fkey(display_name, email),
      team_members(count)
    `,
    )
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[admin-teams] 목록 조회 실패', error)
    return { ok: false, message: error.message }
  }

  return {
    ok: true,
    rows: ((data ?? []) as TeamListRow[]).map(mapTeamRow),
  }
}

export async function createAdminTeam(
  name: string,
): Promise<{ ok: true; teamId: string } | { ok: false; message: string }> {
  const trimmed = name.trim()
  if (!trimmed.length) {
    return { ok: false, message: '팀 이름을 입력해 주세요.' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: '로그인이 필요합니다.' }

  const { data, error } = await supabase
    .from('teams')
    .insert({ name: trimmed, created_by: user.id })
    .select('id')
    .single()

  if (error || !data?.id) {
    return { ok: false, message: error?.message ?? '팀 생성 실패' }
  }

  return { ok: true, teamId: data.id as string }
}

export async function fetchAdminTeamMembers(
  teamId: string,
): Promise<
  { ok: true; rows: AdminTeamMemberRow[] } | { ok: false; message: string }
> {
  const { data, error } = await supabase.rpc('admin_team_members_directory', {
    p_team_id: teamId,
  })

  if (error) {
    console.error('[admin-teams] 멤버 조회 실패', error)
    return { ok: false, message: error.message }
  }

  return { ok: true, rows: (data ?? []) as AdminTeamMemberRow[] }
}

export async function addAdminTeamMember(
  teamId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.from('team_members').insert({
    team_id: teamId,
    user_id: userId,
    role: 'member',
  })

  if (error) {
    if (error.code === '23505') {
      return { ok: false, message: '이미 팀에 소속된 직원입니다.' }
    }
    return { ok: false, message: error.message }
  }

  return { ok: true }
}

export async function removeAdminTeamMember(
  teamId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId)

  if (error) {
    return { ok: false, message: error.message }
  }

  return { ok: true }
}

export async function updateAdminTeamName(
  teamId: string,
  name: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = name.trim()
  if (!trimmed.length) {
    return { ok: false, message: '팀 이름을 입력해 주세요.' }
  }

  const { error } = await supabase
    .from('teams')
    .update({ name: trimmed })
    .eq('id', teamId)

  if (error) {
    return { ok: false, message: error.message }
  }

  return { ok: true }
}

export async function deleteAdminTeam(
  teamId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.from('teams').delete().eq('id', teamId)

  if (error) {
    return { ok: false, message: error.message }
  }

  return { ok: true }
}

export function useAdminTeams() {
  const [rows, setRows] = useState<AdminTeamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await fetchAdminTeams()
    if (!result.ok) {
      setError(result.message)
      setRows([])
    } else {
      setRows(result.rows)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  return { rows, loading, error, reload: load }
}
