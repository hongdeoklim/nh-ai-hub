import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '../../lib/supabase'

type TokenLogRow = {
  user_id: string
  prompt_tokens: number
  completion_tokens: number
  total_cost: number
}

type UserDeptRow = {
  id: string
  department: string | null
}

/** 원화 환산: 1토큰당 내부 단가(예시). total_cost 컬럼과 별개로 토큰 합산 기준 표시용입니다. */
const KRW_PER_TOKEN = 0.00275

function monthStartUtc(): Date {
  const start = new Date()
  start.setDate(1)
  start.setHours(0, 0, 0, 0)
  return start
}

export function AdminDashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalTokensMonth, setTotalTokensMonth] = useState(0)
  const [estimatedKrw, setEstimatedKrw] = useState(0)
  const [activeUsersMonth, setActiveUsersMonth] = useState(0)
  const [deptTop3, setDeptTop3] = useState<{ dept: string; tokens: number }[]>(
    [],
  )
  const [logRowsMonth, setLogRowsMonth] = useState(0)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const startIso = monthStartUtc().toISOString()

      const [logsRes, usersRes] = await Promise.all([
        supabase
          .from('token_logs')
          .select('user_id, prompt_tokens, completion_tokens, total_cost')
          .gte('created_at', startIso),
        supabase.from('users').select('id, department'),
      ])

      if (logsRes.error) throw new Error(logsRes.error.message)
      if (usersRes.error) throw new Error(usersRes.error.message)

      const logs = (logsRes.data ?? []) as TokenLogRow[]
      const users = (usersRes.data ?? []) as UserDeptRow[]

      const deptByUser = new Map<string, string>()
      for (const u of users) {
        const label = (u.department ?? '').trim()
        deptByUser.set(u.id, label.length ? label : '(미지정)')
      }

      let tokensSum = 0
      let internalCostSum = 0
      const activeIds = new Set<string>()
      const deptTokens = new Map<string, number>()

      for (const row of logs) {
        const pt = Number(row.prompt_tokens ?? 0)
        const ct = Number(row.completion_tokens ?? 0)
        const t = pt + ct
        tokensSum += t
        internalCostSum += Number(row.total_cost ?? 0)
        activeIds.add(row.user_id)

        const dept = deptByUser.get(row.user_id) ?? '(미지정)'
        deptTokens.set(dept, (deptTokens.get(dept) ?? 0) + t)
      }

      const rankedDept = [...deptTokens.entries()]
        .map(([dept, tokens]) => ({ dept, tokens }))
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, 3)

      const krw = Math.round(tokensSum * KRW_PER_TOKEN)

      startTransition(() => {
        setTotalTokensMonth(tokensSum)
        setEstimatedKrw(krw)
        setActiveUsersMonth(activeIds.size)
        setDeptTop3(rankedDept)
        setLogRowsMonth(logs.length)
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  const maxDeptTok = useMemo(() => {
    const m = Math.max(...deptTop3.map((d) => d.tokens), 1)
    return m
  }, [deptTop3])

  const fmtKr = useMemo(
    () =>
      new Intl.NumberFormat('ko-KR', {
        maximumFractionDigits: 0,
      }),
    [],
  )

  const fmtTok = useMemo(
    () =>
      new Intl.NumberFormat('ko-KR', {
        maximumFractionDigits: 0,
      }),
    [],
  )

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 md:text-3xl">
            운영 대시보드
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            이번 달{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              token_logs
            </span>
            와{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              users
            </span>
            를 조인·집계한 비용·활성 지표입니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          새로고침
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid auto-rows-[minmax(8rem,auto)] gap-4 md:grid-cols-6 lg:grid-cols-12">
        <div className="group relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-lg md:col-span-6 lg:col-span-7">
          <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-32 rounded-full bg-black/10 blur-xl" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-100">
            이번 달 예상 사용 금액
          </p>
          <p className="mt-4 text-4xl font-black tabular-nums tracking-tight md:text-5xl">
            {loading ? '—' : `₩ ${fmtKr.format(estimatedKrw)}`}
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-indigo-100/95">
            산식: (입력·출력 토큰 합){' '}
            <span className="font-semibold tabular-nums">
              × {KRW_PER_TOKEN.toFixed(5)}
            </span>{' '}
            원/토큰 · 행 {loading ? '—' : fmtTok.format(logRowsMonth)}건 기준
          </p>
          <p className="mt-2 text-[17px] font-medium text-indigo-200/90">
            내부 규약용 단가입니다. 실제 과금과 다를 수 있습니다.
          </p>
        </div>

        <div className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:col-span-3 lg:col-span-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              활성 사용자
            </p>
            <p className="mt-4 text-4xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {loading ? '—' : fmtTok.format(activeUsersMonth)}
            </p>
            <p className="mt-2 text-xs leading-snug text-slate-500 dark:text-slate-400">
              이번 달{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                token_logs
              </span>
              에 최소 1회 이상 기록된 고유 직원 수
            </p>
          </div>
          <div className="mt-6 rounded-2xl bg-emerald-50 px-3 py-2 text-[17px] font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            신규 가입자 전체 수는 별도 유저 메뉴에서 확인하세요.
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:col-span-3 lg:col-span-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              월간 총 토큰
            </p>
            <p className="mt-4 text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
              {loading ? '—' : fmtTok.format(totalTokensMonth)}
            </p>
          </div>
          <p className="mt-4 text-[17px] leading-snug text-slate-500 dark:text-slate-400">
            prompt_tokens + completion_tokens 합산
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:col-span-6 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">
              부서별 토큰 사용 랭킹 · Top 3
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[15px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              token_logs ⨝ users.department
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {loading ? (
              <p className="text-sm text-slate-500 sm:col-span-3">불러오는 중…</p>
            ) : deptTop3.length === 0 ? (
              <p className="text-sm text-slate-500 sm:col-span-3">
                이번 달 집계 가능한 부서 토큰이 없습니다.
              </p>
            ) : (
              deptTop3.map((row, idx) => {
                const medal =
                  idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`
                const ratio = Math.max(8, Math.round((row.tokens / maxDeptTok) * 100))
                return (
                  <div
                    key={row.dept}
                    className="relative overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50 to-white p-4 dark:border-slate-800 dark:from-slate-950 dark:to-slate-900"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-2xl" aria-hidden>
                        {medal}
                      </span>
                      <span className="rounded-md bg-white px-2 py-0.5 text-[15px] font-bold tabular-nums text-violet-700 shadow-sm ring-1 ring-violet-100 dark:bg-slate-900 dark:text-violet-300 dark:ring-violet-900">
                        #{idx + 1}
                      </span>
                    </div>
                    <p className="mt-3 truncate text-lg font-bold text-slate-900 dark:text-slate-50">
                      {row.dept}
                    </p>
                    <p className="mt-1 text-2xl font-black tabular-nums text-violet-600 dark:text-violet-400">
                      {fmtTok.format(row.tokens)}
                    </p>
                    <p className="mt-0.5 text-[17px] font-medium text-slate-500 dark:text-slate-400">
                      토큰 합계
                    </p>
                    <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200/90 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width] duration-500"
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 p-6 dark:border-slate-700 dark:bg-slate-950/40 md:col-span-6 lg:col-span-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">
            빠른 안내
          </h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            <li className="flex gap-2">
              <span className="text-indigo-500">→</span>
              직원 한도 조정은{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                직원/토큰 관리
              </span>{' '}
              메뉴에서 진행합니다.
            </li>
            <li className="flex gap-2">
              <span className="text-indigo-500">→</span>
              외부 API 노출 여부는{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                플러그인 관리
              </span>{' '}
              스위치로 즉시 반영됩니다.
            </li>
            <li className="flex gap-2">
              <span className="text-indigo-500">→</span>
              단가 상수는{' '}
              <code className="rounded bg-white px-1 py-0.5 text-xs dark:bg-slate-900">
                AdminDashboard.tsx
              </code>{' '}
              의 <span className="font-mono text-xs">KRW_PER_TOKEN</span> 입니다.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
