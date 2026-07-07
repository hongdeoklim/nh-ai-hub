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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:py-10">
      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200/80 bg-orange-50/80 px-3 py-1 text-[10px]! font-semibold uppercase tracking-[0.12em] text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-300 md:text-[11px]!">
          <span aria-hidden>✦</span> 팀 · 공유 채팅
        </span>
        <h1 className="mt-3 text-[22px]! font-bold tracking-tight text-stone-900 dark:text-stone-50 md:text-[28px]!">
          팀과 함께 대화하세요
        </h1>
        <p className="mt-1.5 text-[13px]! text-stone-600 dark:text-stone-400 md:text-[15px]!">
          팀을 만들고 멤버를 이메일로 초대하면, 같은 대화방에서 AI와 협업할 수 있습니다.
        </p>
      </header>

      <section className="rounded-2xl border border-stone-200 bg-gradient-to-br from-white to-orange-50/40 px-5 py-5 shadow-sm dark:border-stone-700 dark:from-stone-900 dark:to-stone-900">
        <h2 className="text-[13px]! font-semibold text-stone-900 dark:text-stone-100 md:text-[14px]!">
          새 팀 만들기
        </h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            disabled={creating || !profile}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim().length >= 1 && !creating) {
                void handleCreate()
              }
            }}
            placeholder="팀 이름 (예: 마케팅팀, 3층 신축 TF)"
            className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[14px]! outline-none ring-orange-700/25 focus:border-orange-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          />
          <button
            type="button"
            disabled={creating || !profile || name.trim().length < 1}
            onClick={() => void handleCreate()}
            className="shrink-0 rounded-xl bg-orange-800 px-5 py-2.5 text-[13px]! font-semibold text-white transition hover:bg-orange-900 disabled:opacity-50 dark:bg-orange-900 md:text-[14px]!"
          >
            {creating ? '생성 중…' : '＋ 팀 생성'}
          </button>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px]! font-semibold text-stone-900 dark:text-stone-100 md:text-[14px]!">
            내 팀
          </h2>
          {!loading && teams.length > 0 ? (
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px]! font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400 md:text-[12px]!">
              {teams.length}개
            </span>
          ) : null}
        </div>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-[92px] animate-pulse rounded-2xl bg-stone-200/70 dark:bg-stone-800/70" />
            ))}
          </div>
        ) : teams.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center dark:border-stone-600 dark:bg-stone-900/40">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-2xl dark:bg-orange-950/50">
              👥
            </div>
            <p className="text-[13px]! font-semibold text-stone-800 dark:text-stone-100 md:text-[14px]!">
              아직 소속된 팀이 없습니다
            </p>
            <p className="mt-1 text-[12px]! text-stone-500 dark:text-stone-400 md:text-[13px]!">
              위에서 팀을 만들어 멤버를 초대해 보세요.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {teams.map((t) => {
              const initial = t.name.trim().charAt(0).toUpperCase() || '팀'
              const isOwner = t.created_by === profile?.id
              return (
                <li key={t.id}>
                  <Link
                    to={`/teams/${t.id}`}
                    className="group flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md dark:border-stone-700 dark:bg-stone-900 dark:hover:border-orange-800/60"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-[16px]! font-bold text-white shadow-sm">
                      {initial}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[14px]! font-semibold text-stone-900 dark:text-stone-100 md:text-[15px]!">
                          {t.name}
                        </span>
                        {isOwner ? (
                          <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px]! font-semibold text-orange-800 dark:bg-orange-950/60 dark:text-orange-300">
                            내 팀
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[11px]! text-stone-500 dark:text-stone-400 md:text-[12px]!">
                        {new Date(t.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })} 생성
                      </span>
                    </span>
                    <svg className="h-4 w-4 shrink-0 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-orange-500 dark:text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <p className="text-[11px]! text-stone-400 dark:text-stone-500 md:text-[12px]!">
        공유 채팅은 수 초 간격으로 새로 고쳐집니다. 팀을 열어 멤버 초대·대화방을 관리하세요.
      </p>
    </div>
  )
}
