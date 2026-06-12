import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../components/auth/useAuth'
import { supabase } from '../lib/supabase'
import {
  createSharedConversation,
  fetchTeamConversations,
  fetchTeamDirectory,
  inviteTeamMemberByEmail,
} from '../services/teams'
import type { TeamConversationRow, TeamRow } from '../services/teams'

export function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>()
  const { profile } = useAuth()
  const [team, setTeam] = useState<TeamRow | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [conversations, setConversations] = useState<TeamConversationRow[]>(
    [],
  )
  const [creating, setCreating] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('공유 채팅')
  const [pickVersion, setPickVersion] = useState(0)
  const [selectedParticipants, setSelectedParticipants] = useState<
    Record<string, boolean>
  >({})

  const loadTeam = useCallback(async () => {
    if (!teamId) return
    setLoadError(null)
    const { data, error } = await supabase
      .from('teams')
      .select('id,name,created_by,created_at')
      .eq('id', teamId)
      .maybeSingle()
    if (error || !data) {
      setTeam(null)
      setLoadError(
        error?.message ?? '팀 정보를 불러오지 못했거나 접근 권한이 없습니다.',
      )
      return
    }
    startTransition(() => setTeam(data as TeamRow))
  }, [teamId])

  const loadConversations = useCallback(async () => {
    if (!teamId) return
    const res = await fetchTeamConversations(supabase, teamId)
    if (!res.ok) {
      window.alert(res.message)
      return
    }
    startTransition(() => setConversations(res.rows))
  }, [teamId])

  useEffect(() => {
    queueMicrotask(() => void loadTeam())
  }, [loadTeam])

  useEffect(() => {
    queueMicrotask(() => void loadConversations())
  }, [loadConversations])

  function openModal() {
    setModalOpen(true)
    setPickVersion((v) => v + 1)
  }

  const selectedIds = useMemo(
    () =>
      Object.entries(selectedParticipants)
        .filter(([, v]) => v)
        .map(([id]) => id),
    [selectedParticipants],
  )

  async function handleInvite() {
    if (!teamId) return
    setInviting(true)
    try {
      const res = await inviteTeamMemberByEmail(supabase, teamId, email)
      if (!res.ok) {
        window.alert(res.message)
        return
      }
      setEmail('')
      window.alert('멤버를 추가했습니다.')
    } finally {
      setInviting(false)
    }
  }

  async function handleCreateConversation() {
    if (!teamId || !profile?.id) return
    if (selectedIds.length === 0) {
      window.alert('참여할 동료를 한 명 이상 선택하세요.')
      return
    }
    setCreating(true)
    try {
      const res = await createSharedConversation(supabase, {
        teamId,
        title: newTitle,
        participantUserIds: selectedIds,
      })
      if (!res.ok) {
        window.alert(res.message)
        return
      }
      setModalOpen(false)
      await loadConversations()
      window.location.href = `/teams/${teamId}/chat/${res.conversationId}`
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <nav className="text-xs text-stone-600 dark:text-stone-400">
        <Link to="/teams" className="underline hover:text-stone-900 dark:hover:text-stone-200">
          팀 목록
        </Link>
        <span className="mx-1">/</span>
        <span className="text-stone-900 dark:text-stone-100">상세</span>
      </nav>

      {loadError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {loadError}
        </div>
      ) : null}

      {team ? (
        <div>
          <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50">
            {team.name}
          </h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            팀 멤버를 초대하고, 공유 채팅방을 만들 수 있습니다.
          </p>
        </div>
      ) : (
        !loadError && (
          <p className="text-sm text-stone-500">팀 정보를 불러오는 중…</p>
        )
      )}

      <section className="rounded-2xl border border-stone-200 bg-white px-4 py-4 dark:border-stone-700 dark:bg-stone-900">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
          멤버 초대 (이메일)
        </h2>
        <p className="mt-2 text-[13px] text-stone-600 dark:text-stone-400">
          이미 가입되어 사용자 프로필(
          <code className="text-[12px]">public.users</code>) 에 있는 이메일만 초대할 수
          있습니다.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            placeholder="coworker@example.com"
            disabled={inviting || !teamId}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-[#FAF9F6] px-3 py-2 text-sm outline-none ring-orange-700/25 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          />
          <button
            type="button"
            disabled={inviting || email.trim().length < 4}
            onClick={() => void handleInvite()}
            className="rounded-xl bg-stone-800 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-900 disabled:opacity-50 dark:bg-stone-700"
          >
            {inviting ? '추가 중…' : '초대'}
          </button>
        </div>
      </section>

      <section className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
          공유 채팅
        </h2>
        <button
          type="button"
          disabled={!teamId || !profile}
          onClick={() => openModal()}
          className="rounded-full bg-orange-800 px-4 py-2 text-[13px] font-semibold text-white hover:bg-orange-900 disabled:opacity-50 dark:bg-orange-900"
        >
          새 공유 채팅
        </button>
      </section>

      {conversations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500 dark:border-stone-600">
          아직 채팅이 없습니다. 위 버튼으로 방을 만들고 동료를 선택하세요.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white dark:divide-stone-700 dark:border-stone-700 dark:bg-stone-900">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                className="block px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800"
                to={`/teams/${teamId}/chat/${c.id}`}
              >
                <span className="font-medium text-stone-900 dark:text-stone-100">
                  {c.title}
                </span>
                <span className="mt-1 block text-xs text-stone-500">
                  업데이트 {new Date(c.updated_at).toLocaleString('ko-KR')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {modalOpen && teamId ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:items-center"
          role="presentation"
          onClick={() => setModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[min(88dvh,28rem)] w-full max-w-md overflow-auto rounded-2xl border border-stone-200 bg-[#FAF9F6] shadow-2xl dark:border-stone-700 dark:bg-stone-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-700">
              <p className="text-base font-semibold text-stone-900 dark:text-stone-50">
                새 공유 채팅
              </p>
              <p className="mt-1 text-[12px] text-stone-600 dark:text-stone-400">
                참가자로 선택한 사람만 메시지를 주고받을 수 있습니다. 팀 채팅 화면에 들어오면 해당
                팀의 다른 멤버는 스스로 참가할 수 있습니다(MVP 정책).
              </p>
            </div>
            <div className="space-y-3 px-4 py-3">
              <label className="block text-[12px] font-medium text-stone-700 dark:text-stone-300">
                방 제목
              </label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
              />
              <ParticipantPicker
                teamId={teamId}
                pickVersion={pickVersion}
                selected={selectedParticipants}
                setSelected={setSelectedParticipants}
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={creating || selectedIds.length === 0}
                  onClick={() => void handleCreateConversation()}
                  className="rounded-lg bg-orange-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-orange-900"
                >
                  {creating ? '생성 중…' : '만들기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ParticipantPicker({
  teamId,
  pickVersion,
  selected,
  setSelected,
}: {
  teamId: string
  pickVersion: number
  selected: Record<string, boolean>
  setSelected: Dispatch<SetStateAction<Record<string, boolean>>>
}) {
  const [rows, setRows] = useState<{ user_id: string; email: string }[]>(
    [],
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancel = false
    async function run() {
      setLoading(true)
      const dir = await fetchTeamDirectory(supabase, teamId)
      if (cancel) return
      if (!dir.ok) {
        setRows([])
      } else {
        setRows(dir.rows.map((r) => ({ user_id: r.user_id, email: r.email })))
        setSelected((prev) => {
          const next = { ...prev }
          let changed = false
          for (const r of dir.rows) {
            if (next[r.user_id] === undefined) {
              next[r.user_id] = true
              changed = true
            }
          }
          return changed ? next : prev
        })
      }
      setLoading(false)
    }
    void run()
    return () => {
      cancel = true
    }
  }, [teamId, pickVersion, setSelected])

  if (loading) return <p className="text-sm text-stone-500">멤버 목록 로드…</p>

  return (
    <fieldset className="space-y-2">
      <legend className="text-[12px] font-medium text-stone-700 dark:text-stone-300">
        참가자 선택
      </legend>
      {rows.map((r) => (
        <label
          key={r.user_id}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/70 dark:hover:bg-stone-800"
        >
          <input
            type="checkbox"
            checked={!!selected[r.user_id]}
            onChange={(e) =>
              setSelected((prev) => ({
                ...prev,
                [r.user_id]: e.target.checked,
              }))
            }
          />
          <span className="text-sm text-stone-800 dark:text-stone-200">
            {r.email}
          </span>
        </label>
      ))}
    </fieldset>
  )
}
