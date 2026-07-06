import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  fetchIngestQueue,
  fetchKnowledgeHubStats,
  reembedLegacyNodes,
  retryFailedIngest,
  runSearchTest,
  type IngestQueueRow,
  type KnowledgeHubStats,
  type SearchTestMatch,
} from '../services/knowledge-hub'

/**
 * 글자 크기 표기 규칙 — 이 앱은 `.app-shell` 안에서 p/h1/h2/button/input 등
 * 태그 셀렉터가 16~20px로 강제 고정되고, 10~20px 사이 일부 값은 8~12px로
 * 추가 축소되는 언레이어드 CSS 보정이 있다(project_build_pitfalls 참고).
 * 그래서 모든 크기 지정에 Tailwind `!important` 접미사가 필요하고,
 * PC/모바일 구분은 기본값(모바일) + `md:`(768px 이상 PC) 접두사로 표현한다.
 */
function formatCount(value: number): string {
  if (value < 0) return '—'
  return value.toLocaleString('ko-KR')
}

function StatCard(props: {
  label: string
  value: number
  sub?: string
  warn?: boolean
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <p className="text-[11px]! md:text-[12px]! text-stone-500 dark:text-stone-400">
        {props.label}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          props.warn
            ? 'text-red-600 dark:text-red-400'
            : 'text-stone-900 dark:text-stone-50'
        }`}
      >
        {formatCount(props.value)}
      </p>
      {props.sub ? (
        <p className="mt-0.5 text-[10px]! md:text-[11px]! text-stone-400 dark:text-stone-500">
          {props.sub}
        </p>
      ) : null}
    </div>
  )
}

function QueueStatusBadge({ status }: { status: IngestQueueRow['status'] }) {
  const cls =
    status === 'done'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
      : status === 'failed'
        ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'
        : status === 'processing'
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
          : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
  const label =
    status === 'done'
      ? '색인 완료'
      : status === 'failed'
        ? '실패'
        : status === 'processing'
          ? '처리 중'
          : '대기'
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px]! md:text-[11px]! font-medium ${cls}`}
    >
      {label}
    </span>
  )
}

export function KnowledgeHubPage() {
  const [stats, setStats] = useState<KnowledgeHubStats | null>(null)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [queueRows, setQueueRows] = useState<IngestQueueRow[]>([])
  const [queueError, setQueueError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [retryBusy, setRetryBusy] = useState(false)
  const [retryNote, setRetryNote] = useState<string | null>(null)

  const [reembedBusy, setReembedBusy] = useState(false)
  const [reembedNote, setReembedNote] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchMatches, setSearchMatches] = useState<SearchTestMatch[] | null>(
    null,
  )

  const reload = useCallback(async () => {
    setLoading(true)
    const [statsResult, queueResult] = await Promise.allSettled([
      fetchKnowledgeHubStats(),
      fetchIngestQueue(50),
    ])
    if (statsResult.status === 'fulfilled') {
      setStats(statsResult.value)
      setStatsError(null)
    } else {
      setStatsError(
        statsResult.reason instanceof Error
          ? statsResult.reason.message
          : '현황을 불러오지 못했습니다.',
      )
    }
    if (queueResult.status === 'fulfilled') {
      setQueueRows(queueResult.value)
      setQueueError(null)
    } else {
      setQueueError(
        queueResult.reason instanceof Error
          ? queueResult.reason.message
          : '수집 큐를 불러오지 못했습니다.',
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleRetryFailed = useCallback(async () => {
    setRetryBusy(true)
    setRetryNote(null)
    try {
      const result = await retryFailedIngest()
      setRetryNote(
        `실패 ${result.resetCount}건을 다시 대기열에 넣고 워커를 실행했습니다.`,
      )
      await reload()
    } catch (e) {
      setRetryNote(
        e instanceof Error ? `재시도 실패: ${e.message}` : '재시도에 실패했습니다.',
      )
    } finally {
      setRetryBusy(false)
    }
  }, [reload])

  const handleReembed = useCallback(async () => {
    setReembedBusy(true)
    setReembedNote(null)
    try {
      const result = await reembedLegacyNodes(20)
      setReembedNote(
        `${result.processed}건 재임베딩 완료` +
          (result.failed > 0 ? `, 실패 ${result.failed}건` : '') +
          ` · 남은 대상 ${result.remaining.toLocaleString('ko-KR')}건`,
      )
      await reload()
    } catch (e) {
      setReembedNote(
        e instanceof Error
          ? `재임베딩 실패: ${e.message}`
          : '재임베딩에 실패했습니다.',
      )
    } finally {
      setReembedBusy(false)
    }
  }, [reload])

  const handleSearchTest = useCallback(async () => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchError('2자 이상 입력해 주세요.')
      return
    }
    setSearchBusy(true)
    setSearchError(null)
    setSearchMatches(null)
    try {
      const matches = await runSearchTest(q)
      setSearchMatches(matches)
    } catch (e) {
      setSearchError(
        e instanceof Error ? e.message : '검색 테스트에 실패했습니다.',
      )
    } finally {
      setSearchBusy(false)
    }
  }, [searchQuery])

  const failedCount = stats?.queue.failed ?? 0

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px]! md:text-[24px]! font-semibold text-stone-900! dark:text-stone-50!">
            지식 허브
          </h1>
          <p className="mt-1 text-[12px]! md:text-[13px]! text-stone-500 dark:text-stone-400">
            사내 AI 두뇌의 학습(색인) 현황을 확인하고, 실패한 문서를 재시도하고,
            검색 품질을 테스트합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/reference-room"
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[12px]! md:text-[13px]! font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            자료실에서 문서 추가
          </Link>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[12px]! md:text-[13px]! font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            {loading ? '불러오는 중…' : '새로고침'}
          </button>
        </div>
      </header>

      {statsError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px]! md:text-[13px]! text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {statsError}
        </p>
      ) : null}

      <section aria-label="색인 현황">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard
            label="자료실 문서"
            value={stats?.kbDocuments ?? -1}
            sub="knowledge_base"
          />
          <StatCard
            label="사내문서 청크"
            value={stats?.companyChunks ?? -1}
            sub={
              stats && stats.companyChunksNoEmbedding > 0
                ? `임베딩 누락 ${formatCount(stats.companyChunksNoEmbedding)}건`
                : 'company_documents'
            }
            warn={Boolean(stats && stats.companyChunksNoEmbedding > 0)}
          />
          <StatCard
            label="지식 그래프 노드"
            value={stats?.graphNodes ?? -1}
            sub={
              stats && stats.graphNodesNoEmbedding > 0
                ? `임베딩 누락 ${formatCount(stats.graphNodesNoEmbedding)}건`
                : 'nh_knowledge_nodes'
            }
            warn={Boolean(stats && stats.graphNodesNoEmbedding > 0)}
          />
          <StatCard
            label="색인 실패 (큐)"
            value={failedCount}
            sub={
              stats
                ? `대기 ${formatCount(stats.queue.pending)} · 완료 ${formatCount(stats.queue.done)}`
                : undefined
            }
            warn={failedCount > 0}
          />
          <StatCard
            label="노트북 청크"
            value={stats?.notebookChunks ?? -1}
            sub="document_chunks"
          />
          <StatCard
            label="장기 기억"
            value={stats?.memoryRows ?? -1}
            sub="user_long_term_memory"
          />
        </div>
      </section>

      {stats && stats.graphNodesLegacyEmbedding > 0 ? (
        <section
          aria-label="임베딩 마이그레이션"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[14px]! md:text-[16px]! font-semibold text-amber-900! dark:text-amber-200!">
                임베딩 통일 마이그레이션
              </h2>
              <p className="mt-1 text-[12px]! md:text-[13px]! leading-relaxed text-amber-800/90 dark:text-amber-300/90">
                구형 임베딩 노드{' '}
                <strong className="tabular-nums">
                  {formatCount(stats.graphNodesLegacyEmbedding)}건
                </strong>
                이 남아 있습니다. 표준({stats.standardEmbeddingModel})으로
                재임베딩해야 검색에 다시 포함됩니다. 버튼을 반복 클릭해 0건까지
                진행하세요.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleReembed()}
              disabled={reembedBusy}
              className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-[12px]! md:text-[13px]! font-semibold text-white hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400"
            >
              {reembedBusy ? '재임베딩 중…' : '20건 재임베딩'}
            </button>
          </div>
          {reembedNote ? (
            <p className="mt-2 text-[12px]! md:text-[13px]! text-amber-900 dark:text-amber-200">
              {reembedNote}
            </p>
          ) : null}
        </section>
      ) : null}

      <section
        aria-label="검색 테스트"
        className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
      >
        <h2 className="text-[14px]! md:text-[16px]! font-semibold text-stone-900! dark:text-stone-50!">
          검색 테스트
        </h2>
        <p className="mt-1 text-[12px]! md:text-[13px]! text-stone-500 dark:text-stone-400">
          실제 답변 파이프라인과 동일한 병합 검색으로, 이 질문에 두뇌가 어떤 문서
          조각을 근거로 찾는지 미리 봅니다.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSearchTest()
            }}
            placeholder="예: 출장비 정산 규정"
            className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-[16px]! md:text-[14px]! text-stone-900 outline-none focus:border-stone-500 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
          />
          <button
            type="button"
            onClick={() => void handleSearchTest()}
            disabled={searchBusy}
            className="rounded-lg bg-stone-900 px-4 py-2 text-[12px]! md:text-[13px]! font-semibold text-white hover:bg-stone-700 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
          >
            {searchBusy ? '검색 중…' : '테스트'}
          </button>
        </div>
        {searchError ? (
          <p className="mt-2 text-[12px]! md:text-[13px]! text-red-600 dark:text-red-400">
            {searchError}
          </p>
        ) : null}
        {searchMatches !== null ? (
          searchMatches.length === 0 ? (
            <p className="mt-3 rounded-lg bg-stone-50 px-3 py-2 text-[12px]! md:text-[13px]! text-stone-500 dark:bg-stone-950 dark:text-stone-400">
              검색된 문서가 없습니다. 이 주제의 문서가 아직 색인되지 않았다는
              뜻입니다 — 자료실에 문서를 추가해 보세요.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {searchMatches.map((m, i) => (
                <li
                  key={`${m.fileName}-${m.chunkIndex}-${i}`}
                  className="rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-[12px]! md:text-[13px]! font-medium text-stone-800 dark:text-stone-200">
                      [{i + 1}] {m.fileName}
                    </p>
                    <span className="shrink-0 text-[10px]! md:text-[11px]! tabular-nums text-stone-500 dark:text-stone-400">
                      유사도 {m.similarity.toFixed(3)} · 청크 #{m.chunkIndex}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 text-[12px]! md:text-[13px]! leading-relaxed text-stone-600 dark:text-stone-400">
                    {m.snippet}
                  </p>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>

      <section
        aria-label="수집 큐"
        className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14px]! md:text-[16px]! font-semibold text-stone-900! dark:text-stone-50!">
            문서 수집 큐
          </h2>
          <button
            type="button"
            onClick={() => void handleRetryFailed()}
            disabled={retryBusy || failedCount === 0}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[12px]! md:text-[13px]! font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
          >
            {retryBusy ? '재시도 중…' : `실패 ${failedCount}건 전체 재시도`}
          </button>
        </div>
        {retryNote ? (
          <p className="mt-2 text-[12px]! md:text-[13px]! text-stone-600 dark:text-stone-300">
            {retryNote}
          </p>
        ) : null}
        {queueError ? (
          <p className="mt-2 text-[12px]! md:text-[13px]! text-red-600 dark:text-red-400">
            {queueError}
          </p>
        ) : null}
        {queueRows.length === 0 && !queueError ? (
          <p className="mt-3 text-[12px]! md:text-[13px]! text-stone-500 dark:text-stone-400">
            수집 큐가 비어 있습니다. 자료실에 문서를 올리면 자동으로 이 큐에
            들어와 색인됩니다.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {queueRows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-stone-100 px-3 py-2 dark:border-stone-800"
              >
                <QueueStatusBadge status={row.status} />
                <p className="min-w-0 flex-1 truncate text-[12px]! md:text-[13px]! text-stone-800 dark:text-stone-200">
                  {row.fileName}
                </p>
                <span className="shrink-0 text-[10px]! md:text-[11px]! text-stone-400 dark:text-stone-500">
                  {new Date(row.createdAt).toLocaleString('ko-KR', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {row.status === 'failed' && row.errorMessage ? (
                  <p className="w-full truncate text-[10px]! md:text-[11px]! text-red-500 dark:text-red-400">
                    {row.errorMessage}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
