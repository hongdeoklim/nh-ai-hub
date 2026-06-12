import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../components/auth/useAuth'
import { supabase } from '../lib/supabase'
import { createTeam, fetchMyTeams } from '../services/teams'
import type { TeamRow } from '../services/teams'

export function TeamsPage() {
  const { profile } = useAuth()
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchMyTeams(supabase)
      if (!result.ok) {
        window.alert(result.message)
        setTeams([])
        return
      }
      setTeams(result.rows)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  async function handleCreate() {
    if (!profile?.id) return
    setCreating(true)
    try {
      const result = await createTeam(supabase, name)
      if (!result.ok) {
        window.alert(result.message)
        return
      }
      setName('')
      await load()
      window.alert('팀이 생성되었습니다.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-lg font-semibold text-stone-900 dark:text-stone-50">
          팀 / 공유 채팅
        </h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          팀을 만들면 멤버를 이메일로 초대하고, 같은 대화방에서 메시지를 나눌 수 있습니다(MVP).
        </p>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white px-4 py-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
          새 팀 만들기
        </h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            disabled={creating || !profile}
            onChange={(e) => setName(e.target.value)}
            placeholder="팀 이름"
            className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-[#FAF9F6] px-3 py-2 text-sm outline-none ring-orange-700/25 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          />
          <button
            type="button"
            disabled={creating || !profile || name.trim().length < 1}
            onClick={() => void handleCreate()}
            className="rounded-xl bg-orange-800 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-900 disabled:opacity-50 dark:bg-orange-900"
          >
            {creating ? '생성 중…' : '생성'}
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-stone-900 dark:text-stone-100">
          내 팀
        </h2>
        {loading ? (
          <p className="text-sm text-stone-500">불러오는 중…</p>
        ) : teams.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500 dark:border-stone-600">
            아직 소속된 팀이 없습니다. 위에서 팀을 만들어 보세요.
          </p>
        ) : (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white dark:divide-stone-700 dark:border-stone-700 dark:bg-stone-900">
            {teams.map((t) => (
              <li key={t.id}>
                <Link
                  className="block px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800"
                  to={`/teams/${t.id}`}
                >
                  <span className="font-medium text-stone-900 dark:text-stone-100">
                    {t.name}
                  </span>
                  <span className="mt-1 block text-xs text-stone-500 dark:text-stone-400">
                    자세히 → 멤버·공유 채팅 관리
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-stone-500 dark:text-stone-500">
        실시간 동기화는 MVP 에서 선택 사항입니다. 채팅 화면은 수 초 간격으로 새로 고칩니다.
      </p>
    </div>
  )
}
