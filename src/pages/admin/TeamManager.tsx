import { toast } from 'sonner'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '../../lib/supabase'
import { logAdminActivity } from '../../services/admin/activity-log'
import {
  addAdminTeamMember,
  createAdminTeam,
  creatorLabel,
  fetchAdminTeamMembers,
  removeAdminTeamMember,
  useAdminTeams,
  type AdminTeamMemberRow,
  type AdminTeamRow,
} from '../../services/admin/admin-teams'

type EmployeeOption = {
  id: string
  email: string
  display_name: string | null
  department: string | null
}

function memberLabel(row: Pick<AdminTeamMemberRow, 'display_name' | 'email'>): string {
  const name = row.display_name?.trim()
  if (name && name.length > 0) return name
  return row.email
}

function employeeLabel(row: EmployeeOption): string {
  const name = row.display_name?.trim()
  if (name && name.length > 0) return `${name} (${row.email})`
  return row.email
}

export function TeamManager() {
  const { rows, loading, error, reload } = useAdminTeams()
  const [createOpen, setCreateOpen] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<AdminTeamRow | null>(null)
  const [members, setMembers] = useState<AdminTeamMemberRow[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [memberBusyId, setMemberBusyId] = useState<string | null>(null)
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [addUserId, setAddUserId] = useState('')

  const loadMembers = useCallback(async (teamId: string) => {
    setMembersLoading(true)
    setMembersError(null)
    const result = await fetchAdminTeamMembers(teamId)
    if (!result.ok) {
      setMembersError(result.message)
      setMembers([])
    } else {
      setMembers(result.rows)
    }
    setMembersLoading(false)
  }, [])

  const loadEmployees = useCallback(async () => {
    const { data, error: qErr } = await supabase
      .from('users')
      .select('id, email, display_name, department')
      .order('display_name', { ascending: true, nullsFirst: false })
      .order('email', { ascending: true })

    if (!qErr) {
      setEmployees((data ?? []) as EmployeeOption[])
    }
  }, [])

  useEffect(() => {
    if (!selectedTeam) return
    void loadMembers(selectedTeam.id)
    void loadEmployees()
  }, [selectedTeam, loadMembers, loadEmployees])

  const availableEmployees = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.user_id))
    return employees.filter((e) => !memberIds.has(e.id))
  }, [employees, members])

  async function submitCreateTeam() {
    const name = teamName.trim()
    if (!name.length) {
      toast.error('팀 이름을 입력해 주세요.')
      return
    }

    setCreateBusy(true)
    try {
      const result = await createAdminTeam(name)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      await logAdminActivity('team_create', `팀 생성: ${name}`)
      setTeamName('')
      setCreateOpen(false)
      await reload()
    } finally {
      setCreateBusy(false)
    }
  }

  function openTeamPanel(team: AdminTeamRow) {
    setSelectedTeam(team)
    setAddUserId('')
  }

  function closeTeamPanel() {
    if (memberBusyId) return
    setSelectedTeam(null)
    setMembers([])
    setAddUserId('')
  }

  async function submitAddMember() {
    if (!selectedTeam || !addUserId) return
    setMemberBusyId(addUserId)
    try {
      const employee = employees.find((e) => e.id === addUserId)
      const result = await addAdminTeamMember(selectedTeam.id, addUserId)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      await logAdminActivity(
        'team_member_add',
        `${selectedTeam.name} ← ${employee ? employeeLabel(employee) : addUserId}`,
      )
      setAddUserId('')
      await loadMembers(selectedTeam.id)
      await reload()
    } finally {
      setMemberBusyId(null)
    }
  }

  async function removeMember(member: AdminTeamMemberRow) {
    if (!selectedTeam) return
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`${memberLabel(member)}님을 팀에서 제외할까요?`)
    ) {
      return
    }

    setMemberBusyId(member.user_id)
    try {
      const result = await removeAdminTeamMember(selectedTeam.id, member.user_id)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      await logAdminActivity(
        'team_member_remove',
        `${selectedTeam.name} → ${memberLabel(member)}`,
      )
      await loadMembers(selectedTeam.id)
      await reload()
    } finally {
      setMemberBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 text-base">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            팀 / 조직 관리
          </h1>
          <p className="mt-1 text-base text-fg-muted">
            프로젝트·TF 등 팀을 생성하고 직원을 배치합니다. 생성자는{' '}
            <span className="font-medium text-fg">users</span> 프로필과
            조인해 표시됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent"
        >
          + 팀 생성
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-border bg-bg text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              <tr>
                <th className="px-4 py-2.5">팀 이름</th>
                <th className="px-4 py-2.5">소속 인원</th>
                <th className="px-4 py-2.5">생성자</th>
                <th className="px-4 py-2.5">생성일</th>
                <th className="px-4 py-2.5 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-fg-subtle">
                    불러오는 중…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-fg-subtle">
                    등록된 팀이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((team) => (
                  <tr
                    key={team.id}
                    className="cursor-pointer transition hover:bg-surface-2/80"
                    tabIndex={0} onClick={() => openTeamPanel(team)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTeamPanel(team) } }}
                  >
                    <td className="px-4 py-2.5 font-medium text-fg">
                      {team.name}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-fg-muted">
                      {team.member_count}명
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-fg">
                        {creatorLabel(team)}
                      </p>
                      {team.creator_email ? (
                        <p className="text-xs text-fg-subtle">
                          {team.creator_email}
                        </p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-fg-muted">
                      {new Date(team.created_at).toLocaleString('ko-KR')}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          openTeamPanel(team)
                        }}
                        className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-accent"
                      >
                        팀원 관리
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 backdrop-blur-[1px] sm:items-center"
          role="presentation"
          onClick={() => !createBusy && setCreateOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-team-title"
            className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="create-team-title"
              className="text-lg font-semibold text-fg"
            >
              새 팀 생성
            </h2>
            <p className="mt-1 text-sm text-fg-subtle">
              TF·프로젝트 그룹 등 운영 단위를 만듭니다.
            </p>
            <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              팀 이름
              <input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="예: 2026 시설공사 TF"
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                disabled={createBusy}
                onClick={() => setCreateOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-fg-muted hover:bg-surface-2"
              >
                취소
              </button>
              <button
                type="button"
                disabled={createBusy}
                onClick={() => void submitCreateTeam()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent disabled:opacity-60"
              >
                {createBusy ? '생성 중…' : '생성'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedTeam ? (
        <>
          <div
            className="fixed inset-0 z-[75] bg-black/35 backdrop-blur-[1px]"
            role="presentation"
            onClick={() => closeTeamPanel()}
          />
          <aside
            className="fixed inset-y-0 right-0 z-[80] flex w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl"
            aria-label={`${selectedTeam.name} 팀원 관리`}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                  팀원 관리
                </p>
                <h2 className="mt-0.5 truncate text-lg font-semibold text-fg">
                  {selectedTeam.name}
                </h2>
                <p className="mt-1 text-xs text-fg-subtle">
                  생성: {creatorLabel(selectedTeam)} · {selectedTeam.member_count}명
                </p>
              </div>
              <button
                type="button"
                onClick={() => closeTeamPanel()}
                className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium"
              >
                닫기
              </button>
            </div>

            <div className="border-b border-border px-5 py-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                직원 추가
                <div className="mt-2 flex gap-2">
                  <select
                    value={addUserId}
                    onChange={(e) => setAddUserId(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <option value="">직원 선택…</option>
                    {availableEmployees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {employeeLabel(e)}
                        {e.department ? ` · ${e.department}` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!addUserId || memberBusyId !== null}
                    onClick={() => void submitAddMember()}
                    className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent disabled:opacity-50"
                  >
                    추가
                  </button>
                </div>
              </label>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {membersError ? (
                <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                  {membersError}
                </div>
              ) : null}

              {membersLoading ? (
                <p className="text-sm text-fg-subtle">팀원 불러오는 중…</p>
              ) : members.length === 0 ? (
                <p className="text-sm text-fg-subtle">아직 소속 직원이 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {members.map((member) => (
                    <li
                      key={member.user_id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-fg">
                          {memberLabel(member)}
                        </p>
                        <p className="truncate text-xs text-fg-subtle">
                          {member.email}
                          {member.department ? ` · ${member.department}` : ''}
                          {member.role === 'owner' ? ' · owner' : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={memberBusyId === member.user_id}
                        onClick={() => void removeMember(member)}
                        className="shrink-0 rounded-md border border-danger/30 px-2 py-1 text-xs font-semibold text-danger transition hover:bg-danger-soft disabled:opacity-50"
                      >
                        제외
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  )
}
