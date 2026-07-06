import { useEffect, useState } from 'react'

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { AdminPageHeader } from '../../components/auth/admin/AdminPageHeader'
import { supabase } from '../../lib/supabase'
import { adminPageRootWide } from '../../components/auth/admin/admin-ui'
import {
  activityBadgeClassName,
  resolveActivityAction,
} from '../../utils/admin-activity-badge'

type TokenTrendPoint = {
  date: string
  tokens: number
}

type DepartmentShare = {
  name: string
  value: number
  color: string
}

type RecentLog = {
  id: string
  action_type: string
  description: string
  created_at: string
}

type DepartmentBudgetRow = {
  target_department: string
  monthly_limit_usd: number
  current_usage_usd: number
  updated_at: string
}

interface DashboardMetrics {
  monthlyTokens: number
  weeklyActiveUsers: number
  monthlyPrompts: number
  totalCostUsd: number
  tokenTrend: TokenTrendPoint[]
  deptShare: DepartmentShare[]
  recentLogs: RecentLog[]
}

const DEPT_COLORS = [
  '#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#94a3b8',
]

const CHART_GRID = '#e2e8f0'
const CHART_AXIS = '#64748b'
const AREA_STROKE = '#6366f1'
const AREA_FILL = '#6366f1'

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return String(value)
}

function formatLogTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`
}

type ChartTooltipProps = {
  active?: boolean
  payload?: { value: number; name?: string }[]
  label?: string
}

function TokenTrendTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const value = payload[0]?.value ?? 0
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-slate-300">날짜 {label}</p>
      <p className="mt-1 text-xs tabular-nums text-white">
        토큰 {value.toLocaleString('ko-KR')}
      </p>
    </div>
  )
}

function ShareTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const value = payload[0]?.value ?? 0
  const name = payload[0]?.name ?? ''
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-slate-300">{name}</p>
      <p className="mt-1 text-xs tabular-nums text-white">비율 {value}%</p>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <article className="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-indigo-500/5 blur-2xl" />
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">
        {value}
      </p>
      {hint && (
        <p className="mt-2 text-xs leading-snug text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      )}
    </article>
  )
}

function DepartmentBudgetUsageSection() {
  const [rows, setRows] = useState<DepartmentBudgetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: qErr } = await supabase
        .from('department_budgets')
        .select('target_department, monthly_limit_usd, current_usage_usd, updated_at')
        .order('target_department', { ascending: true })

      if (cancelled) return

      if (qErr) {
        setError(qErr.message)
        setRows([])
      } else {
        setRows(
          (data ?? []).map((row) => ({
            target_department: String(row.target_department),
            monthly_limit_usd: Number(row.monthly_limit_usd ?? 0),
            current_usage_usd: Number(row.current_usage_usd ?? 0),
            updated_at: String(row.updated_at ?? ''),
          })),
        )
      }
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section aria-label="부서별 예산 사용 현황">
      <article className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            부서별 예산 사용 현황
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            department_budgets · 월간 한도 대비 누적 사용(USD)
          </p>
        </div>
        {loading ? (
          <p className="px-6 py-8 text-sm text-slate-500 dark:text-slate-400">불러오는 중…</p>
        ) : error ? (
          <p className="px-6 py-8 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500 dark:text-slate-400">
            등록된 부서 예산 데이터가 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => {
              const limit = Math.max(row.monthly_limit_usd, 0.0001)
              const pct = Math.min(100, Math.round((row.current_usage_usd / limit) * 100))
              const barTone = pct >= 80 ? 'bg-red-500' : 'bg-indigo-500 dark:bg-indigo-400'
              return (
                <li key={row.target_department} className="px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {row.target_department}
                    </span>
                    <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {formatUsd(row.current_usage_usd)} / {formatUsd(row.monthly_limit_usd)} ({pct}%)
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className={`h-full rounded-full transition-all ${barTone}`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </article>
    </section>
  )
}

async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // 최근 7일 날짜 목록
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (6 - i))
    return d
  })

  const [
    { data: monthTokenRows },
    { data: wauRows },
    { count: promptCount },
    { data: deptBudgets },
    { data: logRows },
    { data: trendRows },
  ] = await Promise.all([
    // 이번 달 토큰
    supabase
      .from('token_logs')
      .select('total_tokens')
      .gte('created_at', monthStart.toISOString()),
    // 주간 활성 사용자 (user_id distinct 목적으로 조회)
    supabase
      .from('token_logs')
      .select('user_id')
      .gte('created_at', weekAgo.toISOString()),
    // 이번 달 신규 프롬프트
    supabase
      .from('prompt_templates')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart.toISOString()),
    // 부서별 비용 (파이차트 + 총계)
    supabase
      .from('department_budgets')
      .select('target_department, current_usage_usd')
      .order('current_usage_usd', { ascending: false }),
    // 최근 시스템 로그
    supabase
      .from('activity_logs')
      .select('id, action_type, description, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    // 최근 7일 토큰 트렌드
    supabase
      .from('token_logs')
      .select('total_tokens, created_at')
      .gte('created_at', last7Days[0].toISOString()),
  ])

  const monthlyTokens = (monthTokenRows ?? []).reduce(
    (sum, r) => sum + (Number(r.total_tokens) || 0),
    0,
  )

  const wauSet = new Set((wauRows ?? []).map((r) => r.user_id).filter(Boolean))
  const weeklyActiveUsers = wauSet.size

  const monthlyPrompts = promptCount ?? 0

  const totalCostUsd = (deptBudgets ?? []).reduce(
    (sum, r) => sum + (Number(r.current_usage_usd) || 0),
    0,
  )

  // 파이차트: 각 부서의 current_usage_usd 비율
  const totalForShare = (deptBudgets ?? []).reduce(
    (sum, r) => sum + (Number(r.current_usage_usd) || 0),
    0,
  )
  const deptShare: DepartmentShare[] = (deptBudgets ?? [])
    .filter((r) => Number(r.current_usage_usd) > 0)
    .map((r, i) => ({
      name: String(r.target_department),
      value:
        totalForShare > 0
          ? Math.round((Number(r.current_usage_usd) / totalForShare) * 100)
          : 0,
      color: DEPT_COLORS[i % DEPT_COLORS.length],
    }))

  // 7일 트렌드: 날짜별 집계
  const trendMap = new Map<string, number>()
  for (const d of last7Days) {
    const key = `${d.getMonth() + 1}/${d.getDate()}`
    trendMap.set(key, 0)
  }
  for (const row of trendRows ?? []) {
    const d = new Date(row.created_at)
    const key = `${d.getMonth() + 1}/${d.getDate()}`
    if (trendMap.has(key)) {
      trendMap.set(key, (trendMap.get(key) ?? 0) + (Number(row.total_tokens) || 0))
    }
  }
  const tokenTrend: TokenTrendPoint[] = Array.from(trendMap.entries()).map(
    ([date, tokens]) => ({ date, tokens }),
  )

  const recentLogs: RecentLog[] = (logRows ?? []).map((r) => ({
    id: String(r.id),
    action_type: String(r.action_type ?? ''),
    description: String(r.description ?? ''),
    created_at: String(r.created_at ?? ''),
  }))

  return {
    monthlyTokens,
    weeklyActiveUsers,
    monthlyPrompts,
    totalCostUsd,
    tokenTrend,
    deptShare,
    recentLogs,
  }
}

export function ModernAdminDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchDashboardMetrics()
      setMetrics(data)
      setRefreshedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const thisMonth = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })

  return (
    <div className={`${adminPageRootWide} space-y-6`}>
      <AdminPageHeader
        title="운영 대시보드"
        description={`토큰·비용·활성 지표 · ${thisMonth} 기준`}
        actions={
          <div className="flex items-center gap-2">
            {refreshedAt && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                업데이트 {refreshedAt.toLocaleTimeString('ko-KR')}
              </span>
            )}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              {loading ? '로딩 중…' : '새로고침'}
            </button>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          오류: {error}
        </div>
      )}

      {loading && !metrics ? (
        <div className="flex h-40 items-center justify-center text-sm text-slate-400">
          데이터 불러오는 중…
        </div>
      ) : metrics ? (
        <>
          <section aria-label="핵심 KPI" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="이번 달 예상 비용"
              value={`$${metrics.totalCostUsd.toFixed(2)}`}
              hint="department_budgets 누적 합산"
            />
            <StatCard
              label="이번 달 누적 토큰"
              value={formatTokens(metrics.monthlyTokens)}
              hint="token_logs prompt + completion"
            />
            <StatCard
              label="주간 활성 사용자"
              value={String(metrics.weeklyActiveUsers)}
              hint="최근 7일 token_logs 기준"
            />
            <StatCard
              label="이번 달 신규 프롬프트"
              value={String(metrics.monthlyPrompts)}
              hint="prompt_templates 생성 수"
            />
          </section>

          <section aria-label="사용량 차트" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <article className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  최근 7일 토큰 사용량
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  일별 prompt + completion 합산 추이
                </p>
              </div>
              {metrics.tokenTrend.every((p) => p.tokens === 0) ? (
                <div className="flex h-72 items-center justify-center text-sm text-slate-400">
                  최근 7일 토큰 데이터가 없습니다.
                </div>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={metrics.tokenTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="tokenAreaFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={AREA_FILL} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={AREA_FILL} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: CHART_AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: CHART_AXIS, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatTokens} width={48} />
                      <Tooltip content={<TokenTrendTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="tokens"
                        stroke={AREA_STROKE}
                        strokeWidth={2}
                        fill="url(#tokenAreaFill)"
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 0, fill: AREA_STROKE }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </article>

            <article className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  부서별 비용 비율
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  department_budgets current_usage_usd 기준
                </p>
              </div>
              {metrics.deptShare.length === 0 ? (
                <div className="flex h-52 items-center justify-center text-sm text-slate-400">
                  부서 예산 데이터가 없습니다.
                </div>
              ) : (
                <>
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={metrics.deptShare}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={76}
                          paddingAngle={3}
                          stroke="none"
                        >
                          {metrics.deptShare.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<ShareTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-2 space-y-2">
                    {metrics.deptShare.map((dept) => (
                      <li
                        key={dept.name}
                        className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dept.color }} />
                          <span className="truncate">{dept.name}</span>
                        </span>
                        <span className="shrink-0 tabular-nums font-medium">{dept.value}%</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </article>
          </section>

          <DepartmentBudgetUsageSection />

          <section aria-label="최근 시스템 로그">
            <article className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  최근 시스템 로그
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  activity_logs 최신 5건
                </p>
              </div>
              {metrics.recentLogs.length === 0 ? (
                <p className="px-6 py-8 text-sm text-slate-500 dark:text-slate-400">
                  최근 로그가 없습니다.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {metrics.recentLogs.map((log) => {
                    const meta = resolveActivityAction(log.action_type)
                    return (
                      <li
                        key={log.id}
                        className="flex flex-wrap items-start gap-3 px-6 py-4 transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        <span className={activityBadgeClassName(log.action_type)}>
                          {meta.label}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-slate-800 dark:text-slate-100">
                            {log.description}
                          </p>
                          <p className="mt-1 text-xs tabular-nums text-slate-400 dark:text-slate-500">
                            {formatLogTime(log.created_at)}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </article>
          </section>
        </>
      ) : null}
    </div>
  )
}
