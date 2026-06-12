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

type KpiCard = {
  id: string
  label: string
  value: string
  delta: string
  deltaTone: 'up' | 'down' | 'neutral'
  hint: string
}

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

const KPI_CARDS: KpiCard[] = [
  {
    id: 'cost',
    label: '이번 달 예상 비용',
    value: '$2,847.50',
    delta: '+12.4%',
    deltaTone: 'up',
    hint: '전월 대비 LLM API 추정치',
  },
  {
    id: 'tokens',
    label: '누적 토큰',
    value: '12.45M',
    delta: '+8.1%',
    deltaTone: 'up',
    hint: 'prompt + completion 합산',
  },
  {
    id: 'wau',
    label: '주간 활성 사용자',
    value: '847',
    delta: '+3.2%',
    deltaTone: 'up',
    hint: '최근 7일 token_logs 기록',
  },
  {
    id: 'prompts',
    label: '신규 프롬프트',
    value: '23',
    delta: '-2',
    deltaTone: 'down',
    hint: '이번 달 prompt_templates 생성',
  },
]

const TOKEN_TREND: TokenTrendPoint[] = [
  { date: '5/13', tokens: 1_420_000 },
  { date: '5/14', tokens: 1_580_000 },
  { date: '5/15', tokens: 1_390_000 },
  { date: '5/16', tokens: 1_720_000 },
  { date: '5/17', tokens: 1_650_000 },
  { date: '5/18', tokens: 1_880_000 },
  { date: '5/19', tokens: 2_010_000 },
]

const DEPARTMENT_SHARE: DepartmentShare[] = [
  { name: '경영지원부', value: 28, color: '#6366f1' },
  { name: '교류사업부', value: 22, color: '#8b5cf6' },
  { name: '국내여행사업부', value: 18, color: '#06b6d4' },
  { name: '미디어교육부', value: 14, color: '#10b981' },
  { name: '기타', value: 18, color: '#94a3b8' },
]

const DEPARTMENT_DOT_CLASS: Record<string, string> = {
  경영지원부: 'bg-indigo-500',
  교류사업부: 'bg-violet-500',
  국내여행사업부: 'bg-cyan-500',
  미디어교육부: 'bg-emerald-500',
  기타: 'bg-slate-400',
}

const RECENT_LOGS: RecentLog[] = [
  {
    id: '1',
    action_type: 'user_add',
    description: '직원 등록: 김민수 <minsu.kim@nh.co.kr> (user)',
    created_at: '2026-05-19T08:42:00+09:00',
  },
  {
    id: '2',
    action_type: 'admin_prompt_edit',
    description: '[공통] 주간 보고서 요약 프롬프트 수정',
    created_at: '2026-05-19T08:15:00+09:00',
  },
  {
    id: '3',
    action_type: 'token_grant',
    description: '이서연에게 토큰 100,000 부여',
    created_at: '2026-05-19T07:58:00+09:00',
  },
  {
    id: '4',
    action_type: 'team_member_add',
    description: 'AI혁신팀에 박지훈 추가',
    created_at: '2026-05-18T18:30:00+09:00',
  },
  {
    id: '5',
    action_type: 'admin_prompt_create',
    description: '[경영지원부] 예산 분석 어시스턴트 프롬프트 생성',
    created_at: '2026-05-18T16:05:00+09:00',
  },
]

const CHART_GRID = '#e2e8f0'
const CHART_AXIS = '#64748b'
const AREA_STROKE = '#6366f1'
const AREA_FILL = '#6366f1'

function deltaClassName(tone: KpiCard['deltaTone']): string {
  if (tone === 'up') {
    return 'text-emerald-600 dark:text-emerald-400'
  }
  if (tone === 'down') {
    return 'text-rose-600 dark:text-rose-400'
  }
  return 'text-slate-500 dark:text-slate-400'
}

function formatLogTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`
  }
  return String(value)
}

type ChartTooltipProps = {
  active?: boolean
  payload?: { value: number; name?: string }[]
  label?: string
  valueLabel?: string
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

function KpiCardView({ card }: { card: KpiCard }) {
  return (
    <article className="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-900">
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-indigo-500/5 blur-2xl transition group-hover:bg-indigo-500/10" />
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {card.label}
      </p>
      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">
        {card.value}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <span
          className={`text-xs font-semibold tabular-nums ${deltaClassName(card.deltaTone)}`}
        >
          {card.delta}
        </span>
        <span className="text-xs text-slate-400 dark:text-slate-500">vs 지난달</span>
      </div>
      <p className="mt-3 text-xs leading-snug text-slate-500 dark:text-slate-400">
        {card.hint}
      </p>
    </article>
  )
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`
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
            [부서별 예산 사용 현황]
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            department_budgets · 월간 한도 대비 누적 사용(USD)
          </p>
        </div>
        {loading ? (
          <p className="px-6 py-8 text-sm text-slate-500 dark:text-slate-400">
            불러오는 중…
          </p>
        ) : error ? (
          <p className="px-6 py-8 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500 dark:text-slate-400">
            등록된 부서 예산 데이터가 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => {
              const limit = Math.max(row.monthly_limit_usd, 0.0001)
              const pct = Math.min(
                100,
                Math.round((row.current_usage_usd / limit) * 100),
              )
              const barTone =
                pct >= 80 ? 'bg-red-500' : 'bg-indigo-500 dark:bg-indigo-400'

              return (
                <li key={row.target_department} className="px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {row.target_department}
                    </span>
                    <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {formatUsd(row.current_usage_usd)} / {formatUsd(row.monthly_limit_usd)}{' '}
                      ({pct}%)
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-all ${barTone}`}
                      style={{ width: `${pct}%` }}
                    />
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

export function ModernAdminDashboard() {
  return (
    <div className={`${adminPageRootWide} space-y-6`}>
      <AdminPageHeader
        title="운영 대시보드"
        description="토큰·비용·활성 지표를 한눈에 확인하는 벤토 그리드 뷰입니다. (모의 데이터)"
        actions={
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Mock · v2
          </span>
        }
      />

      <section
        aria-label="핵심 KPI"
        className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4"
      >
        {KPI_CARDS.map((card) => (
          <KpiCardView key={card.id} card={card} />
        ))}
      </section>

      <section
        aria-label="사용량 차트"
        className="grid grid-cols-1 gap-4 lg:grid-cols-3"
      >
        <article className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                최근 7일 토큰 사용량
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                일별 prompt + completion 합산 추이
              </p>
            </div>
            <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
              Area · monotone
            </span>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={TOKEN_TREND} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="tokenAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={AREA_FILL} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={AREA_FILL} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: CHART_AXIS, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: CHART_AXIS, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatTokens}
                  width={48}
                />
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
        </article>

        <article className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-1">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              부서별 사용 비율
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              이번 달 token_logs 기준
            </p>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={DEPARTMENT_SHARE}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={76}
                  paddingAngle={3}
                  stroke="none"
                >
                  {DEPARTMENT_SHARE.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<ShareTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-2">
            {DEPARTMENT_SHARE.map((dept) => (
              <li
                key={dept.name}
                className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${DEPARTMENT_DOT_CLASS[dept.name] ?? 'bg-slate-400'}`}
                  />
                  <span className="truncate">{dept.name}</span>
                </span>
                <span className="shrink-0 tabular-nums font-medium">{dept.value}%</span>
              </li>
            ))}
          </ul>
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
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {RECENT_LOGS.map((log) => {
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
        </article>
      </section>
    </div>
  )
}
