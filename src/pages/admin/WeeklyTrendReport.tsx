import { useCallback, useEffect, useMemo, useState } from 'react'

import { AdminPageHeader } from '../../components/auth/admin/AdminPageHeader'
import {
  adminBtnSecondary,
  adminPageRootWide,
} from '../../components/auth/admin/admin-ui'
import { supabase } from '../../lib/supabase'
import {
  normalizeTopKeywords,
  type WeeklyAiReportRow,
} from '../../types/weekly-ai-reports'

const KEYWORD_COLORS = [
  'from-indigo-500 to-violet-600',
  'from-sky-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
]

function formatReportLabel(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00`)
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const fmt = (dt: Date) =>
    dt.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  return `${fmt(s)} ~ ${fmt(e)}`
}

export function WeeklyTrendReport() {
  const [rows, setRows] = useState<WeeklyAiReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: qErr } = await supabase
      .from('weekly_ai_reports')
      .select(
        'id, report_date, period_start, period_end, top_keywords, summary, generated_by_ai, created_at',
      )
      .order('report_date', { ascending: false })

    if (qErr) {
      setError(qErr.message)
      setRows([])
      setSelectedId(null)
    } else {
      const list = (data ?? []) as WeeklyAiReportRow[]
      setRows(list)
      setSelectedId((prev) => {
        if (prev && list.some((r) => r.id === prev)) return prev
        return list[0]?.id ?? null
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  )

  const keywords = useMemo(
    () => (selected ? normalizeTopKeywords(selected.top_keywords) : []),
    [selected],
  )

  return (
    <div className={adminPageRootWide}>
      <AdminPageHeader
        title="주간 트렌드 리포트"
        description="매주 월요일 배치로 생성되는 AI 활용 키워드·종합 요약입니다."
        actions={
          <button type="button" onClick={() => void load()} disabled={loading} className={adminBtnSecondary}>
            새로고침
          </button>
        }
      />

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
          {error.includes('weekly_ai_reports') ? (
            <p className="mt-1 text-[17px] opacity-90">
              마이그레이션(20260522100000_weekly_ai_reports.sql) 적용 후 다시 시도하세요.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="px-2 py-1.5 text-[17px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            역대 리포트
          </p>
          {loading ? (
            <p className="px-2 py-4 text-xs text-slate-500">불러오는 중…</p>
          ) : rows.length === 0 ? (
            <p className="px-2 py-4 text-xs leading-relaxed text-slate-500">
              아직 생성된 리포트가 없습니다.
              <br />
              Edge Function을 수동 실행해 첫 리포트를 만드세요.
            </p>
          ) : (
            <ul className="max-h-[min(70vh,520px)] space-y-0.5 overflow-y-auto">
              {rows.map((row) => {
                const active = row.id === selectedId
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className={[
                        'w-full rounded-md px-2.5 py-2 text-left transition',
                        active
                          ? 'bg-indigo-600 text-white shadow-sm dark:bg-indigo-500'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
                      ].join(' ')}
                    >
                      <p className="text-xs font-semibold">{formatReportLabel(row.report_date)}</p>
                      <p
                        className={[
                          'mt-0.5 text-[15px]',
                          active ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400',
                        ].join(' ')}
                      >
                        {formatPeriod(row.period_start, row.period_end)}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        <section className="min-w-0 space-y-3">
          {!selected ? (
            <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-6 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900">
              {loading ? '리포트를 불러오는 중…' : '좌측에서 주간 리포트를 선택하세요.'}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    {formatReportLabel(selected.report_date)} 리포트
                  </p>
                  <p className="text-[17px] text-slate-500 dark:text-slate-400">
                    집계 구간: {formatPeriod(selected.period_start, selected.period_end)}
                  </p>
                </div>
                <span
                  className={[
                    'rounded-full px-2 py-0.5 text-[15px] font-semibold',
                    selected.generated_by_ai
                      ? 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                  ].join(' ')}
                >
                  {selected.generated_by_ai ? 'AI 생성' : '규칙 기반'}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="md:col-span-2 xl:col-span-2">
                  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      핵심 키워드 Top 5
                    </h2>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {keywords.length === 0 ? (
                        <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-3">
                          키워드 데이터가 없습니다.
                        </p>
                      ) : (
                        keywords.slice(0, 5).map((entry, idx) => (
                          <div
                            key={`${entry.rank}-${entry.keyword}`}
                            className={`relative overflow-hidden rounded-lg bg-gradient-to-br ${KEYWORD_COLORS[idx % KEYWORD_COLORS.length]} p-3 text-white shadow-sm`}
                          >
                            <p className="text-[15px] font-bold uppercase tracking-wider opacity-90">
                              #{entry.rank}
                            </p>
                            <p className="mt-1 truncate text-sm font-semibold">{entry.keyword}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    메타
                  </h2>
                  <dl className="mt-3 space-y-2 text-xs">
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">생성 시각</dt>
                      <dd className="font-medium text-slate-800 dark:text-slate-100">
                        {new Date(selected.created_at).toLocaleString('ko-KR')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">리포트 ID</dt>
                      <dd className="break-all font-mono text-[15px] text-slate-600 dark:text-slate-300">
                        {selected.id}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="md:col-span-2 xl:col-span-3">
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                      AI 종합 요약
                    </h2>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-100">
                      {selected.summary}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
