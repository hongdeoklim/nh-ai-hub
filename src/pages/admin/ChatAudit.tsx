import { startTransition, useCallback, useEffect, useState } from 'react'

import { supabase } from '../../lib/supabase'

type BookmarkRow = {
  id: string
  user_id: string
  prompt: string
  ai_response: string
  note: string
  created_at: string
}

type HealthRow = {
  id: string
  plugin_id: string | null
  ok: boolean
  status_code: number | null
  latency_ms: number | null
  detail: string
  created_at: string
}

type FeedbackDialogRow = {
  feedback_id: string
  message_id: string
  message_type: 'session' | 'team'
  feedback_text: string | null
  rating: number
  created_at: string
  is_rag_applied: boolean
  rag_applied_at: string | null
  work_case_id: string | null
  user_email: string
  assistant_response: string
  user_prompt: string
}

export function ChatAudit() {
  const [activeTab, setActiveTab] = useState<'audit' | 'rag'>('audit')

  // 탭 A: 대화 감사 & 시스템 헬스 상태
  const [scraps, setScraps] = useState<BookmarkRow[]>([])
  const [health, setHealth] = useState<HealthRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 탭 B: 자가 학습 피드백 RAG 상태
  const [feedbacks, setFeedbacks] = useState<FeedbackDialogRow[]>([])
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false)
  const [feedbacksError, setFeedbacksError] = useState<string | null>(null)

  // RAG 가공 편집 모달용 상태
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackDialogRow | null>(null)
  const [modalTitle, setModalTitle] = useState('')
  const [modalContent, setModalContent] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submittingId, setSubmittingId] = useState<string | null>(null)

  // -----------------------------------------------------------------------------
  // 탭 A 데이터 로더
  // -----------------------------------------------------------------------------
  const loadAuditData = useCallback(async () => {
    setError(null)
    setLoading(true)
    const [sRes, hRes] = await Promise.all([
      supabase
        .from('bookmarked_chats')
        .select('id, user_id, prompt, ai_response, note, created_at')
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('api_health_logs')
        .select(
          'id, plugin_id, ok, status_code, latency_ms, detail, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(120),
    ])

    if (sRes.error) {
      setError(sRes.error.message)
      setScraps([])
    } else {
      startTransition(() => setScraps((sRes.data ?? []) as BookmarkRow[]))
    }

    if (hRes.error) {
      setError((prev) => prev ?? hRes.error!.message)
      setHealth([])
    } else {
      startTransition(() => setHealth((hRes.data ?? []) as HealthRow[]))
    }

    setLoading(false)
  }, [])

  // -----------------------------------------------------------------------------
  // 탭 B 데이터 로더 (RPC 연동)
  // -----------------------------------------------------------------------------
  const loadFeedbacksData = useCallback(async () => {
    setLoadingFeedbacks(true)
    setFeedbacksError(null)

    const { data, error: rpcErr } = await supabase.rpc(
      'get_positive_feedbacks_with_dialogue',
    )

    if (rpcErr) {
      console.error('get_positive_feedbacks_with_dialogue error:', rpcErr)
      setFeedbacksError(rpcErr.message)
      setFeedbacks([])
    } else {
      startTransition(() => {
        setFeedbacks((data ?? []) as FeedbackDialogRow[])
      })
    }
    setLoadingFeedbacks(false)
  }, [])

  useEffect(() => {
    if (activeTab === 'audit') {
      queueMicrotask(() => void loadAuditData())
    } else {
      queueMicrotask(() => void loadFeedbacksData())
    }
  }, [activeTab, loadAuditData, loadFeedbacksData])

  // -----------------------------------------------------------------------------
  // RAG 모달 열기 및 요약 생성
  // -----------------------------------------------------------------------------
  const openRagModal = (fb: FeedbackDialogRow) => {
    setSelectedFeedback(fb)
    
    // 사용자의 질문 앞부분을 추출하여 제목 자동 추천
    const promptSnippet = fb.user_prompt
      ? fb.user_prompt.trim().slice(0, 24) + (fb.user_prompt.trim().length > 24 ? '...' : '')
      : '사내 업무 지식'
    setModalTitle(`[우수 사례] ${promptSnippet}`)

    // RAG에 들어갈 본문 텍스트 구성 (질문과 핵심 답변의 매핑 형태)
    const defaultContent = `[질문]\n${(fb.user_prompt || '').trim()}\n\n[AI 핵심 답변]\n${(fb.assistant_response || '').trim()}`
    setModalContent(defaultContent)
    setIsModalOpen(true)
  }

  // -----------------------------------------------------------------------------
  // RAG 백엔드 전송 및 연동 트리거
  // -----------------------------------------------------------------------------
  const handleIngestRag = async () => {
    if (!selectedFeedback) return
    if (!modalTitle.trim() || !modalContent.trim()) {
      window.alert('제목과 내용을 입력해 주세요.')
      return
    }

    setSubmittingId(selectedFeedback.feedback_id)
    try {
      // 1536차원 OpenAI 임베딩 및 work_cases 삽입을 통합한 Edge Function 호출
      const { data, error: invokeErr } = await supabase.functions.invoke(
        'rag-ingest',
        {
          body: {
            targetTable: 'work_cases',
            title: modalTitle,
            content: modalContent,
            messageFeedbackId: selectedFeedback.feedback_id,
          },
        },
      )

      if (invokeErr) throw invokeErr
      if (data?.ok === false) {
        throw new Error(data.error || '적재 중 서버 오류')
      }

      window.alert('💡 RAG 지식베이스(work_cases)에 성공적으로 영구 적재되었습니다!')
      setIsModalOpen(false)
      setSelectedFeedback(null)
      await loadFeedbacksData()
    } catch (err) {
      console.error('RAG ingest error:', err)
      window.alert(
        err instanceof Error
          ? err.message
          : 'RAG 적재에 실패했습니다. 다시 시도해 주세요.',
      )
    } finally {
      setSubmittingId(null)
    }
  }

  const failedHealth = health.filter((h) => !h.ok)

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* 어드민 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">대화 감사 & RAG 자가학습</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            사내 AI 시스템의 실시간 동작 상태를 진단하고, 직원들의 피드백을 기반으로 자가 학습(Auto-RAG) 루프를 고도화합니다.
          </p>
        </div>

        {/* 세련된 Glassmorphism 탭 컨트롤러 */}
        <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={[
              'rounded-lg px-4 py-1.5 text-xs font-semibold tracking-wide transition-all duration-200',
              activeTab === 'audit'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
            ].join(' ')}
          >
            🔍 대화 감사 & 시스템 로그
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rag')}
            className={[
              'rounded-lg px-4 py-1.5 text-xs font-semibold tracking-wide transition-all duration-200',
              activeTab === 'rag'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
            ].join(' ')}
          >
            💡 자가 학습 피드백 RAG
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------------------
          탭 A) 대화 감사 & 시스템 로그 (기존 기능)
         ------------------------------------------------------------------------- */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          {error ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {error}
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                스크랩북 (bookmarked_chats)
              </h2>
              <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
                {loading ? (
                  <p className="text-sm text-slate-500">불러오는 중…</p>
                ) : scraps.length === 0 ? (
                  <p className="text-sm text-slate-500">기록이 없습니다.</p>
                ) : (
                  scraps.map((b) => (
                    <article
                      key={b.id}
                      className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40"
                    >
                      <div className="flex flex-wrap gap-2 text-[15px] uppercase tracking-wide text-slate-500">
                        <span>{new Date(b.created_at).toLocaleString('ko-KR')}</span>
                        <span className="font-mono">user {b.user_id.slice(0, 8)}…</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-50">
                        {b.prompt}
                      </p>
                      <p className="mt-2 line-clamp-3 text-xs text-slate-600 dark:text-slate-400">
                        {b.ai_response}
                      </p>
                      {b.note?.trim() ? (
                        <p className="mt-2 text-xs text-indigo-700 dark:text-indigo-300">
                          메모: {b.note}
                        </p>
                      ) : null}
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  시스템·헬스 로그
                </h2>
                <span className="text-[15px] font-semibold uppercase text-red-600 dark:text-red-400">
                  실패 {failedHealth.length}건
                </span>
              </div>
              <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
                {loading ? (
                  <p className="text-sm text-slate-500">불러오는 중…</p>
                ) : health.length === 0 ? (
                  <p className="text-sm text-slate-500">기록이 없습니다.</p>
                ) : (
                  health.map((h) => (
                    <article
                      key={h.id}
                      className={[
                        'rounded-xl border p-4 text-xs',
                        h.ok
                          ? 'border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/30'
                          : 'border-red-200 bg-red-50/80 dark:border-red-900 dark:bg-red-950/30',
                      ].join(' ')}
                    >
                      <div className="flex flex-wrap gap-2 font-mono text-[15px] text-slate-500">
                        <span>{new Date(h.created_at).toLocaleString('ko-KR')}</span>
                        {h.plugin_id ? (
                          <span>plugin {h.plugin_id.slice(0, 8)}…</span>
                        ) : (
                          <span>plugin —</span>
                        )}
                        <span>{h.ok ? 'OK' : 'FAIL'}</span>
                        {h.status_code != null ? <span>HTTP {h.status_code}</span> : null}
                        {h.latency_ms != null ? <span>{h.latency_ms}ms</span> : null}
                      </div>
                      <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                        {h.detail || '—'}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------------
          탭 B) 자가 학습 피드백 RAG 매니저 (신규 추가)
         ------------------------------------------------------------------------- */}
      {activeTab === 'rag' && (
        <div className="space-y-6">
          {feedbacksError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              오류 발생: {feedbacksError}
            </div>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  👍 긍정 피드백 기반 RAG 수집소
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  직원들이 대화 중 '좋아요(👍)'를 클릭해 검증된 모범 대화 사례들입니다. 지식베이스로 가공해 AI 지식을 고도화하세요.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadFeedbacksData()}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                새로고침
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {loadingFeedbacks ? (
                <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                  긍정 피드백 대화 이력을 안전하게 불러오는 중…
                </div>
              ) : feedbacks.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                  수집된 긍정 피드백 대화 사례가 아직 없습니다.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {feedbacks.map((fb) => (
                    <article
                      key={fb.feedback_id}
                      className="group flex flex-col justify-between rounded-2xl border border-slate-150 bg-slate-50/60 p-5 transition-all duration-200 hover:border-indigo-250 hover:bg-white dark:border-slate-800 dark:bg-slate-950/20 dark:hover:border-indigo-900/50 dark:hover:bg-slate-950/40 hover:shadow-md"
                    >
                      <div>
                        {/* 헤더 정보 */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {new Date(fb.created_at).toLocaleDateString('ko-KR')}
                          </span>
                          
                          {/* RAG 적재 상태 배지 */}
                          {fb.is_rag_applied ? (
                            <span className="inline-flex items-center rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/20 dark:border-indigo-900/50 dark:text-indigo-300">
                              ✅ RAG 반영 완료
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/50 dark:text-emerald-300">
                              👍 피드백 대기
                            </span>
                          )}
                        </div>

                        {/* 피드백 한 유저 정보 및 유형 */}
                        <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
                            {fb.message_type === 'session' ? '👤 개인채팅' : '👥 팀채팅'}
                          </span>
                          <span className="truncate">
                            발신: {fb.user_email}
                          </span>
                        </div>

                        {/* 질문 / 답변 프리뷰 */}
                        <div className="mt-4 space-y-2">
                          <div className="rounded-lg bg-white/80 p-2.5 dark:bg-slate-900/80">
                            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">Q. 직원 질문</span>
                            <p className="mt-0.5 line-clamp-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {fb.user_prompt || '(텍스트 없음)'}
                            </p>
                          </div>
                          <div className="rounded-lg bg-white/40 p-2.5 dark:bg-slate-900/40">
                            <span className="text-[10px] font-bold text-slate-500">A. AI 대답</span>
                            <p className="mt-0.5 line-clamp-3 text-xs text-slate-600 dark:text-slate-400">
                              {fb.assistant_response || '(답변 텍스트 없음)'}
                            </p>
                          </div>
                        </div>

                        {/* 작성된 의견 추가 노출 */}
                        {fb.feedback_text?.trim() ? (
                          <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-amber-50/30 p-2.5 text-xs text-amber-800 dark:border-slate-800 dark:bg-slate-950/20 dark:text-amber-300">
                            <strong>직원의 구체적 의견:</strong> {fb.feedback_text}
                          </div>
                        ) : null}
                      </div>

                      {/* 액션 버튼 */}
                      <div className="mt-5 border-t border-slate-100 pt-3 dark:border-slate-800/80 flex items-center justify-between">
                        <span className="text-[11px] font-mono text-slate-400">
                          msg_{fb.message_id.slice(0, 8)}…
                        </span>
                        
                        {fb.is_rag_applied ? (
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            반영일: {new Date(fb.rag_applied_at || '').toLocaleDateString('ko-KR')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={submittingId !== null}
                            onClick={() => openRagModal(fb)}
                            className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-500 transition-colors disabled:opacity-50"
                          >
                            지식베이스 적재
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* -------------------------------------------------------------------------
          AI 지식 편집 & RAG 적재 승인 모달 (Interactive Modal Popup)
         ------------------------------------------------------------------------- */}
      {isModalOpen && selectedFeedback && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all duration-300"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-250">
            {/* 닫기 버튼 */}
            <button
              type="button"
              onClick={() => {
                if (submittingId) return
                setIsModalOpen(false)
                setSelectedFeedback(null)
              }}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              ✕
            </button>

            <div>
              <span className="inline-flex rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                Auto-RAG 지식 가공기
              </span>
              <h3 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
                RAG 지식베이스 적재 검수
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                AI가 질문과 답변 쌍을 RAG 포맷에 적절하도록 템플릿화하였습니다. 검색 유사도를 극대화할 수 있게 정제 후 승인해 주세요.
              </p>
            </div>

            <div className="mt-6 space-y-4">
              {/* 지식 제목 입력 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  RAG 문서 제목 (추천된 제목)
                </label>
                <input
                  type="text"
                  value={modalTitle}
                  disabled={submittingId !== null}
                  onChange={(e) => setModalTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-indigo-500"
                />
              </div>

              {/* 지식 본문 텍스트 에디터 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  RAG 인덱싱용 본문 콘텐츠
                </label>
                <textarea
                  rows={10}
                  value={modalContent}
                  disabled={submittingId !== null}
                  onChange={(e) => setModalContent(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-indigo-500"
                />
              </div>
            </div>

            {/* 모달 하단 버튼 */}
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                type="button"
                disabled={submittingId !== null}
                onClick={() => {
                  setIsModalOpen(false)
                  setSelectedFeedback(null)
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                disabled={submittingId !== null}
                onClick={() => void handleIngestRag()}
                className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-500 transition-colors disabled:opacity-50"
              >
                {submittingId ? '벡터 임베딩 생성 및 적재 중…' : '승인 및 RAG 반영'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
