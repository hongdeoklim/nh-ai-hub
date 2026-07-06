import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  fetchMarketplaceExtensions,
  installExtension,
  setExtensionEnabled,
  type MarketplaceExtension,
} from '../services/marketplace'
import {
  executeWorkflow,
  fetchMyWorkflows,
  fetchWorkflowRuns,
  type WorkflowRow,
  type WorkflowRunRow,
} from '../services/workflows'
import { supabase } from '../lib/supabase'

/**
 * 자동화 스튜디오 — 플러그인·MCP·스킬·공공데이터·AI 어시스턴트·워크플로우·연동을
 * 직원용 단일 카탈로그로 통합. (2단계: 흩어진 5개 진입점의 프론트 도어)
 */

type ToolKind =
  | 'plugin'
  | 'mcp'
  | 'skill'
  | 'public_data'
  | 'assistant'
  | 'workflow'
  | 'integration'

const KIND_LABELS: Record<ToolKind, string> = {
  plugin: '플러그인',
  mcp: 'MCP',
  skill: '스킬',
  public_data: '공공데이터',
  assistant: 'AI 어시스턴트',
  workflow: '워크플로우',
  integration: '연동',
}

const KIND_FILTERS: Array<{ id: ToolKind | 'all'; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'plugin', label: '플러그인' },
  { id: 'mcp', label: 'MCP' },
  { id: 'skill', label: '스킬' },
  { id: 'public_data', label: '공공데이터' },
  { id: 'assistant', label: 'AI 어시스턴트' },
  { id: 'workflow', label: '워크플로우' },
  { id: 'integration', label: '연동' },
]

type StatusTone = 'active' | 'idle' | 'warn'

type AssistantRow = {
  assistant_id: string
  name: string
  category: string
  status: 'partial' | 'ready'
  cost_level: 'low' | 'medium' | 'high' | null
}

async function fetchAvailableAssistants(): Promise<AssistantRow[]> {
  const { data, error } = await supabase
    .from('assistant_registry')
    .select('assistant_id, name, category, status, cost_level')
    .eq('enabled', true)
    .order('sort_order', { ascending: true })
  if (error) return []
  return (data ?? []) as AssistantRow[]
}

function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  const cls =
    tone === 'active'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
      : tone === 'warn'
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
        : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {label}
    </span>
  )
}

function KindBadge({ kind }: { kind: ToolKind }) {
  return (
    <span className="inline-flex shrink-0 rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-tight text-stone-500 dark:bg-stone-800 dark:text-stone-400">
      {KIND_LABELS[kind]}
    </span>
  )
}

const COST_LABELS: Record<string, string> = {
  low: '비용 낮음',
  medium: '비용 보통',
  high: '비용 높음',
}

const RUN_STATUS_META: Record<
  WorkflowRunRow['status'],
  { label: string; tone: StatusTone }
> = {
  succeeded: { label: '성공', tone: 'active' },
  failed: { label: '실패', tone: 'warn' },
  running: { label: '실행 중', tone: 'idle' },
  queued: { label: '대기', tone: 'idle' },
}

function formatRunTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AutomationStudioPage() {
  const [extensions, setExtensions] = useState<MarketplaceExtension[]>([])
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([])
  const [assistants, setAssistants] = useState<AssistantRow[]>([])
  const [runs, setRuns] = useState<WorkflowRunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyExtensionId, setBusyExtensionId] = useState<string | null>(null)
  const [runningWorkflowId, setRunningWorkflowId] = useState<string | null>(null)
  const [actionNote, setActionNote] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<ToolKind | 'all'>('all')

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const [ext, wf, as, rn] = await Promise.allSettled([
      fetchMarketplaceExtensions(),
      fetchMyWorkflows(),
      fetchAvailableAssistants(),
      fetchWorkflowRuns(30),
    ])
    if (ext.status === 'fulfilled') setExtensions(ext.value)
    else
      setLoadError(
        ext.reason instanceof Error
          ? ext.reason.message
          : '도구 목록을 불러오지 못했습니다.',
      )
    if (wf.status === 'fulfilled') setWorkflows(wf.value)
    if (as.status === 'fulfilled') setAssistants(as.value)
    if (rn.status === 'fulfilled') setRuns(rn.value)
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleExtensionAction = useCallback(
    async (extension: MarketplaceExtension) => {
      setBusyExtensionId(extension.id)
      setActionNote(null)
      try {
        if (!extension.installation) {
          await installExtension(extension.id)
          setActionNote(`"${extension.name}" 사용을 시작했습니다.`)
        } else {
          const next = !extension.installation.enabled
          await setExtensionEnabled(extension.installation.id, next)
          setActionNote(
            `"${extension.name}"을(를) ${next ? '다시 켰습니다' : '중지했습니다'}.`,
          )
        }
        await reload()
      } catch (e) {
        setActionNote(
          e instanceof Error ? `실패: ${e.message}` : '처리에 실패했습니다.',
        )
      } finally {
        setBusyExtensionId(null)
      }
    },
    [reload],
  )

  const handleRunWorkflow = useCallback(
    async (workflow: WorkflowRow) => {
      setRunningWorkflowId(workflow.id)
      setActionNote(null)
      try {
        await executeWorkflow(workflow.id)
        setActionNote(`"${workflow.title}" 실행이 완료됐습니다.`)
      } catch (e) {
        setActionNote(
          e instanceof Error
            ? `"${workflow.title}" 실행 실패: ${e.message}`
            : '워크플로우 실행에 실패했습니다.',
        )
      } finally {
        setRunningWorkflowId(null)
        await reload()
      }
    },
    [reload],
  )

  /** 워크플로우별 최근 실행 1건 */
  const latestRunByWorkflow = useMemo(() => {
    const map = new Map<string, WorkflowRunRow>()
    for (const run of runs) {
      if (!map.has(run.workflow_id)) map.set(run.workflow_id, run)
    }
    return map
  }, [runs])

  /** 최근 7일 실행 통계 */
  const weekStats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const recent = runs.filter(
      (run) => new Date(run.created_at).getTime() >= weekAgo,
    )
    const succeeded = recent.filter((run) => run.status === 'succeeded').length
    return { total: recent.length, succeeded }
  }, [runs])

  const workflowTitleById = useMemo(
    () => new Map(workflows.map((row) => [row.id, row.title])),
    [workflows],
  )

  const enabledCount = useMemo(
    () =>
      extensions.filter((row) => row.installation?.enabled === true).length,
    [extensions],
  )

  const matchesQuery = useCallback(
    (text: string) =>
      query.trim().length === 0 ||
      text.toLowerCase().includes(query.trim().toLowerCase()),
    [query],
  )

  const visibleExtensions = useMemo(
    () =>
      extensions.filter(
        (row) =>
          (kindFilter === 'all' || row.extension_type === kindFilter) &&
          matchesQuery(`${row.name} ${row.description} ${row.provider}`),
      ),
    [extensions, kindFilter, matchesQuery],
  )
  const visibleWorkflows = useMemo(
    () =>
      kindFilter === 'all' || kindFilter === 'workflow'
        ? workflows.filter((row) =>
            matchesQuery(`${row.title} ${row.description ?? ''}`),
          )
        : [],
    [workflows, kindFilter, matchesQuery],
  )
  const visibleAssistants = useMemo(
    () =>
      kindFilter === 'all' || kindFilter === 'assistant'
        ? assistants.filter((row) =>
            matchesQuery(`${row.name} ${row.category}`),
          )
        : [],
    [assistants, kindFilter, matchesQuery],
  )
  const showIntegrations =
    (kindFilter === 'all' || kindFilter === 'integration') &&
    matchesQuery('google workspace microsoft 365 연동')

  const visibleTotal =
    visibleExtensions.length +
    visibleWorkflows.length +
    visibleAssistants.length +
    (showIntegrations ? 1 : 0)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50">
            자동화 스튜디오
          </h1>
          <p className="mt-1 text-[13px] text-stone-500 dark:text-stone-400">
            플러그인 · MCP · 스킬 · 워크플로우 · AI 어시스턴트를 한곳에서 켜고
            관리합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-stone-500 dark:text-stone-400">
          <span className="rounded-full bg-stone-100 px-2.5 py-1 dark:bg-stone-800">
            도구 {extensions.length.toLocaleString('ko-KR')}
          </span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
            사용 중 {enabledCount.toLocaleString('ko-KR')}
          </span>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 dark:bg-stone-800">
            내 워크플로우 {workflows.length.toLocaleString('ko-KR')}
          </span>
          <span
            className="rounded-full bg-stone-100 px-2.5 py-1 dark:bg-stone-800"
            title="최근 7일간 워크플로우 실행 횟수와 성공 건수"
          >
            7일 실행 {weekStats.total.toLocaleString('ko-KR')}회
            {weekStats.total > 0 ? ` · 성공 ${weekStats.succeeded}` : ''}
          </span>
        </div>
      </header>

      {loadError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {loadError}
        </p>
      ) : null}
      {actionNote ? (
        <p className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-[13px] text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
          {actionNote}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="도구 검색 (이름·설명)"
          className="w-full max-w-xs rounded-lg border border-stone-300 bg-white px-3 py-2 text-[13px] text-stone-900 outline-none focus:border-stone-500 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setKindFilter(f.id)}
              className={`rounded-full px-3 py-1 text-[12px] font-medium transition ${
                kindFilter === f.id
                  ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-[13px] text-stone-500 dark:text-stone-400">
          카탈로그를 불러오는 중…
        </p>
      ) : visibleTotal === 0 ? (
        <p className="py-8 text-center text-[13px] text-stone-500 dark:text-stone-400">
          조건에 맞는 도구가 없습니다.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleExtensions.map((row) => {
            const installed = row.installation !== null
            const enabled = row.installation?.enabled === true
            return (
              <article
                key={`ext-${row.id}`}
                className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <KindBadge kind={row.extension_type} />
                  <StatusBadge
                    tone={enabled ? 'active' : installed ? 'warn' : 'idle'}
                    label={enabled ? '사용 중' : installed ? '중지됨' : '미설치'}
                  />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-[14px] font-semibold text-stone-900 dark:text-stone-50">
                    {row.name}
                  </h2>
                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-stone-500 dark:text-stone-400">
                    {row.description || '설명이 없습니다.'}
                  </p>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <span className="truncate text-[11px] text-stone-400 dark:text-stone-500">
                    {row.provider} · v{row.version}
                  </span>
                  <button
                    type="button"
                    disabled={busyExtensionId === row.id}
                    onClick={() => void handleExtensionAction(row)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-50 ${
                      enabled
                        ? 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800'
                        : 'bg-stone-900 text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300'
                    }`}
                  >
                    {busyExtensionId === row.id
                      ? '처리 중…'
                      : enabled
                        ? '중지'
                        : installed
                          ? '다시 켜기'
                          : '사용 시작'}
                  </button>
                </div>
              </article>
            )
          })}

          {visibleWorkflows.map((row) => {
            const latestRun = latestRunByWorkflow.get(row.id)
            const runMeta = latestRun ? RUN_STATUS_META[latestRun.status] : null
            const running = runningWorkflowId === row.id
            return (
              <article
                key={`wf-${row.id}`}
                className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <KindBadge kind="workflow" />
                  <span className="flex items-center gap-1">
                    {runMeta ? (
                      <StatusBadge
                        tone={runMeta.tone}
                        label={`최근 ${runMeta.label}`}
                      />
                    ) : null}
                    <StatusBadge
                      tone={row.is_active ? 'active' : 'idle'}
                      label={row.is_active ? '활성' : '비활성'}
                    />
                  </span>
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-[14px] font-semibold text-stone-900 dark:text-stone-50">
                    {row.title}
                  </h2>
                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-stone-500 dark:text-stone-400">
                    {row.description || '내가 만든 워크플로우'}
                  </p>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <span className="min-w-0 truncate text-[11px] text-stone-400 dark:text-stone-500">
                    실행 {row.run_count.toLocaleString('ko-KR')}회
                    {row.last_run_at
                      ? ` · ${formatRunTime(row.last_run_at)}`
                      : ''}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Link
                      to="/workflows"
                      className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                    >
                      열기
                    </Link>
                    <button
                      type="button"
                      disabled={running || !row.is_active}
                      onClick={() => void handleRunWorkflow(row)}
                      title={
                        row.is_active
                          ? '이 워크플로우를 지금 실행합니다'
                          : '비활성 워크플로우는 실행할 수 없습니다'
                      }
                      className="rounded-lg bg-stone-900 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
                    >
                      {running ? '실행 중…' : '실행'}
                    </button>
                  </span>
                </div>
              </article>
            )
          })}

          {visibleAssistants.map((row) => (
            <article
              key={`as-${row.assistant_id}`}
              className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="flex items-center justify-between gap-2">
                <KindBadge kind="assistant" />
                <StatusBadge
                  tone={row.status === 'ready' ? 'active' : 'warn'}
                  label={row.status === 'ready' ? '준비됨' : '부분 지원'}
                />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-[14px] font-semibold text-stone-900 dark:text-stone-50">
                  {row.name}
                </h2>
                <p className="mt-0.5 text-[12px] leading-relaxed text-stone-500 dark:text-stone-400">
                  {row.category}
                  {row.cost_level ? ` · ${COST_LABELS[row.cost_level] ?? ''}` : ''}
                </p>
              </div>
              <p className="mt-auto pt-1 text-[11px] text-stone-400 dark:text-stone-500">
                채팅에서 관련 요청 시 자동으로 호출됩니다.
              </p>
            </article>
          ))}

          {showIntegrations ? (
            <article className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
              <div className="flex items-center justify-between gap-2">
                <KindBadge kind="integration" />
                <StatusBadge tone="idle" label="관리" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[14px] font-semibold text-stone-900 dark:text-stone-50">
                  Google Workspace · Microsoft 365
                </h2>
                <p className="mt-0.5 text-[12px] leading-relaxed text-stone-500 dark:text-stone-400">
                  메일·캘린더·드라이브 연동 계정을 연결하고 상태를 확인합니다.
                </p>
              </div>
              <div className="mt-auto flex justify-end pt-1">
                <Link
                  to="/workspace-tools"
                  className="shrink-0 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  연동 관리
                </Link>
              </div>
            </article>
          ) : null}
        </div>
      )}

      {runs.length > 0 ? (
        <section
          aria-label="최근 실행 기록"
          className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
        >
          <h2 className="text-[15px] font-semibold text-stone-900 dark:text-stone-50">
            최근 실행 기록
          </h2>
          <ul className="mt-3 flex flex-col gap-1.5">
            {runs.slice(0, 10).map((run) => {
              const meta = RUN_STATUS_META[run.status]
              return (
                <li
                  key={run.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-stone-100 px-3 py-2 dark:border-stone-800"
                >
                  <StatusBadge tone={meta.tone} label={meta.label} />
                  <p className="min-w-0 flex-1 truncate text-[13px] text-stone-800 dark:text-stone-200">
                    {workflowTitleById.get(run.workflow_id) ??
                      run.action_key ??
                      '(삭제된 워크플로우)'}
                  </p>
                  <span className="shrink-0 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
                    {formatRunTime(run.created_at)}
                  </span>
                  {run.status === 'failed' && run.error_message ? (
                    <p className="w-full truncate text-[11px] text-red-500 dark:text-red-400">
                      {run.error_message}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <p className="text-[12px] text-stone-400 dark:text-stone-500">
        워크플로우 만들기·수정은{' '}
        <Link to="/workflows" className="underline hover:text-stone-600 dark:hover:text-stone-300">
          워크플로우 빌더
        </Link>
        에서, 새 도구 탐색·설치 상세는{' '}
        <Link to="/marketplace" className="underline hover:text-stone-600 dark:hover:text-stone-300">
          마켓플레이스
        </Link>
        에서 계속할 수 있습니다.
      </p>
    </div>
  )
}
