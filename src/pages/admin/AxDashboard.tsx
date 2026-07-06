import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

interface AxMetrics {
  knowledgeDocCount: number
  knowledgeChunkCount: number
  knowledgeNodeCount: number
  knowledgeEdgeCount: number
  memoryCount: number
  feedbackTotal: number
  feedbackPositive: number
  dpoCount: number
  routerLogCount: number
  routerCorrectCount: number
  tokenTotalToday: number
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-50">{value}</p>
      {sub && <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  )
}

function ProgressBar({ value, max, color = 'indigo' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  const colorClass = color === 'green' ? 'bg-green-500' : color === 'amber' ? 'bg-amber-500' : 'bg-indigo-500'
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[12px] text-slate-500 dark:text-slate-400">
        <span>{value.toLocaleString()} / {max.toLocaleString()}</span>
        <span>{pct}%</span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700">
        <div className={`h-2 rounded-full transition-all ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function AxDashboard() {
  const [metrics, setMetrics] = useState<AxMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const [
        { count: knowledgeDocCount },
        { count: knowledgeChunkCount },
        { count: knowledgeNodeCount },
        { count: knowledgeEdgeCount },
        { count: memoryCount },
        { data: feedbackRows },
        { count: routerLogCount },
        { count: routerCorrectCount },
        { data: tokenRows },
      ] = await Promise.all([
        supabase.from('knowledge_base').select('id', { count: 'exact', head: true }).is('deleted_at', null),
        supabase.from('knowledge_base_chunks').select('id', { count: 'exact', head: true }),
        supabase.from('nh_knowledge_nodes').select('id', { count: 'exact', head: true }),
        supabase.from('nh_knowledge_edges').select('id', { count: 'exact', head: true }),
        supabase.from('user_long_term_memory').select('id', { count: 'exact', head: true }),
        supabase.from('message_feedbacks').select('feedback_type'),
        supabase.from('assistant_router_shadow_logs').select('id', { count: 'exact', head: true }),
        supabase.from('assistant_router_shadow_logs').select('id', { count: 'exact', head: true }).eq('matched', true),
        supabase.from('token_logs').select('total_tokens').gte('created_at', todayStart.toISOString()),
      ])

      const feedbackTotal = feedbackRows?.length ?? 0
      const feedbackPositive = feedbackRows?.filter((r) => r.feedback_type === 'thumbs_up' || r.feedback_type === 'positive').length ?? 0

      let dpoCount = 0
      try {
        const { data: dpoData } = await supabase.rpc('get_dpo_preference_dataset', { p_limit: 1 })
        if (Array.isArray(dpoData)) {
          const { count: fullCount } = await supabase.rpc('get_dpo_preference_dataset', { p_limit: 99999 })
          dpoCount = Array.isArray(fullCount) ? fullCount.length : 0
          const { data: fullDpo } = await supabase.rpc('get_dpo_preference_dataset', { p_limit: 99999 })
          dpoCount = Array.isArray(fullDpo) ? fullDpo.length : 0
        }
      } catch {
        dpoCount = 0
      }

      const tokenTotalToday = tokenRows?.reduce((sum, r) => sum + (r.total_tokens ?? 0), 0) ?? 0

      setMetrics({
        knowledgeDocCount: knowledgeDocCount ?? 0,
        knowledgeChunkCount: knowledgeChunkCount ?? 0,
        knowledgeNodeCount: knowledgeNodeCount ?? 0,
        knowledgeEdgeCount: knowledgeEdgeCount ?? 0,
        memoryCount: memoryCount ?? 0,
        feedbackTotal,
        feedbackPositive,
        dpoCount,
        routerLogCount: routerLogCount ?? 0,
        routerCorrectCount: routerCorrectCount ?? 0,
        tokenTotalToday,
      })
      setRefreshedAt(new Date())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const routerAccuracy = metrics && metrics.routerLogCount > 0
    ? Math.round((metrics.routerCorrectCount / metrics.routerLogCount) * 100)
    : null

  const feedbackQuality = metrics && metrics.feedbackTotal > 0
    ? Math.round((metrics.feedbackPositive / metrics.feedbackTotal) * 100)
    : null

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">AX 고도화 현황</h1>
          <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">
            지식·기억·피드백이 어떻게 축적되고 있는지 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {refreshedAt && (
            <span className="text-[12px] text-slate-400 dark:text-slate-500">
              업데이트: {refreshedAt.toLocaleTimeString('ko-KR')}
            </span>
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {loading ? '로딩 중…' : '새로고침'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          오류: {error}
        </div>
      )}

      {loading && !metrics ? (
        <div className="flex h-40 items-center justify-center text-slate-400">데이터 불러오는 중…</div>
      ) : metrics ? (
        <>
          {/* 지식 베이스 */}
          <section>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              지식 베이스 축적
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="문서 수" value={metrics.knowledgeDocCount.toLocaleString()} sub="knowledge_base" />
              <StatCard label="청크 수" value={metrics.knowledgeChunkCount.toLocaleString()} sub="벡터 검색 단위" />
              <StatCard label="지식 노드" value={metrics.knowledgeNodeCount.toLocaleString()} sub="nh_knowledge_nodes" />
              <StatCard label="지식 엣지" value={metrics.knowledgeEdgeCount.toLocaleString()} sub="개념 연결 수" />
            </div>
          </section>

          {/* 사용자 기억 */}
          <section>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              사용자 장기 기억
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StatCard
                label="누적 기억 수"
                value={metrics.memoryCount.toLocaleString()}
                sub="user_long_term_memory"
              />
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">기억 유형 안내</p>
                <ul className="mt-2 space-y-1 text-[13px] text-slate-600 dark:text-slate-300">
                  <li><span className="font-medium text-indigo-600 dark:text-indigo-400">preference</span> — 사용자 선호 및 규칙</li>
                  <li><span className="font-medium text-green-600 dark:text-green-400">fact</span> — 직무·역할 등 사실 정보</li>
                  <li><span className="font-medium text-amber-600 dark:text-amber-400">style</span> — 응답 스타일 지시</li>
                </ul>
                <p className="mt-2 text-[12px] text-slate-400">memory-extractor가 대화 종료 후 자동 추출</p>
              </div>
            </div>
          </section>

          {/* 피드백 & DPO */}
          <section>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              피드백 및 DPO 학습 데이터
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                label="전체 피드백"
                value={metrics.feedbackTotal.toLocaleString()}
                sub="message_feedbacks"
              />
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">긍정 피드백 비율</p>
                {feedbackQuality !== null ? (
                  <>
                    <p className="mt-1 text-3xl font-bold tabular-nums text-green-600 dark:text-green-400">{feedbackQuality}%</p>
                    <ProgressBar value={metrics.feedbackPositive} max={metrics.feedbackTotal} color="green" />
                  </>
                ) : (
                  <p className="mt-2 text-[13px] text-slate-400">피드백 없음</p>
                )}
              </div>
              <StatCard
                label="DPO 페어 수"
                value={metrics.dpoCount.toLocaleString()}
                sub="선호 학습 데이터셋"
              />
            </div>
          </section>

          {/* 라우터 정확도 */}
          <section>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              스마트 라우터 정확도
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StatCard
                label="라우터 로그"
                value={metrics.routerLogCount.toLocaleString()}
                sub="assistant_router_shadow_logs"
              />
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">라우팅 적중률</p>
                {routerAccuracy !== null ? (
                  <>
                    <p className={`mt-1 text-3xl font-bold tabular-nums ${routerAccuracy >= 80 ? 'text-green-600 dark:text-green-400' : routerAccuracy >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                      {routerAccuracy}%
                    </p>
                    <ProgressBar
                      value={metrics.routerCorrectCount}
                      max={metrics.routerLogCount}
                      color={routerAccuracy >= 80 ? 'green' : routerAccuracy >= 60 ? 'amber' : 'indigo'}
                    />
                  </>
                ) : (
                  <p className="mt-2 text-[13px] text-slate-400">로그 없음</p>
                )}
              </div>
            </div>
          </section>

          {/* 오늘 토큰 사용량 */}
          <section>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              오늘 AI 사용량
            </h2>
            <StatCard
              label="오늘 총 토큰"
              value={metrics.tokenTotalToday.toLocaleString()}
              sub={`기준: ${new Date().toLocaleDateString('ko-KR')} 00:00 이후 token_logs`}
            />
          </section>

          {/* AX 성장 요약 */}
          <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-950">
            <h2 className="mb-2 text-[13px] font-semibold text-indigo-700 dark:text-indigo-300">AX 고도화 요약</h2>
            <ul className="space-y-1 text-[13px] text-indigo-700 dark:text-indigo-300">
              <li>• 지식 문서 <strong>{metrics.knowledgeDocCount}</strong>개, 벡터 청크 <strong>{metrics.knowledgeChunkCount}</strong>개가 Dify에 동기화되어 검색에 활용됩니다.</li>
              <li>• 지식 그래프에 <strong>{metrics.knowledgeNodeCount}</strong>개 노드 · <strong>{metrics.knowledgeEdgeCount}</strong>개 엣지가 개념 연결을 형성합니다.</li>
              <li>• 사용자 장기 기억 <strong>{metrics.memoryCount}</strong>개가 개인화 응답에 반영됩니다.</li>
              <li>• 피드백 <strong>{metrics.feedbackTotal}</strong>건 중 긍정 <strong>{metrics.feedbackPositive}</strong>건, DPO 학습 페어 <strong>{metrics.dpoCount}</strong>개가 모델 개선에 사용됩니다.</li>
              {routerAccuracy !== null && (
                <li>• 스마트 라우터 적중률 <strong>{routerAccuracy}%</strong> — 올바른 AI 모델로 작업을 자동 분류하고 있습니다.</li>
              )}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  )
}
