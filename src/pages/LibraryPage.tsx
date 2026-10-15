import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/auth/useAuth'
import {
  fetchKnowledgeBase,
  softDeleteKnowledgeBaseDocument,
  type KnowledgeBaseRow,
} from '../services/reference-room/knowledge-base'
import { knowledgeDepartmentLabel } from '../lib/knowledge-departments'
import { fetchKnowledgeGraphData } from '../services/knowledge-graph/knowledge-graph-client'
import { invokeIngestWorker } from '../services/knowledge-graph/knowledge-ingest-client'
import { PageHeader } from '../components/common/PageHeader'
import { IconLibrary } from '../components/common/icons'
import { useDialogs } from '../components/common/DialogProvider'
import { EmptyState } from '../components/common/EmptyState'


// 파일 확장자 → 타입 레이블 매핑
function getFileType(fileName: string): 'slides' | 'sheets' | 'pdf' | 'image' | 'doc' | 'etc' {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (['pptx', 'ppt'].includes(ext)) return 'slides'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'sheets'
  if (ext === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  if (['docx', 'doc', 'hwp', 'hwpx', 'txt', 'md'].includes(ext)) return 'doc'
  return 'etc'
}

const FILE_TYPE_META: Record<
  'slides' | 'sheets' | 'pdf' | 'image' | 'doc' | 'etc',
  { emoji: string; label: string; colorClass: string }
> = {
  slides: { emoji: '📊', label: 'Slides', colorClass: 'bg-orange-950/40 text-warning border-orange-500/20' },
  sheets: { emoji: '📋', label: 'Sheets', colorClass: 'bg-emerald-950/40 text-success border-emerald-500/20' },
  pdf: { emoji: '📄', label: 'PDF', colorClass: 'bg-red-950/40 text-danger border-red-500/20' },
  image: { emoji: '🖼️', label: 'Image', colorClass: 'bg-violet-950/40 text-accent border-violet-500/20' },
  doc: { emoji: '📝', label: 'Document', colorClass: 'bg-sky-950/40 text-accent border-sky-500/20' },
  etc: { emoji: '📎', label: 'File', colorClass: 'bg-surface-3 text-fg-subtle border-border-strong' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function LibraryPage() {
  const { confirm: confirmDialog } = useDialogs()
  const { profile } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [deptFilter, setDeptFilter] = useState('ALL')
  const [showPipeline, setShowPipeline] = useState(false)

  // 사내 자료실 데이터
  const [docs, setDocs] = useState<KnowledgeBaseRow[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [docsError, setDocsError] = useState<string | null>(null)

  // 지식 그래프 통계
  const [graphStats, setGraphStats] = useState<{ nodes: number; edges: number } | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStep, setSyncStep] = useState('')
  const [syncProgress, setSyncProgress] = useState(0)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // 사내 자료실 불러오기
  useEffect(() => {
    setDocsLoading(true)
    fetchKnowledgeBase(supabase)
      .then((res) => {
        if (res.ok) setDocs(res.rows)
        else setDocsError(res.message)
      })
      .catch((e) => setDocsError(String(e)))
      .finally(() => setDocsLoading(false))
  }, [])

  // 지식 그래프 통계
  useEffect(() => {
    fetchKnowledgeGraphData(300)
      .then((res) => setGraphStats({ nodes: res.nodes.length, edges: res.edges.length }))
      .catch(() => setGraphStats(null))
  }, [])

  // 필터 옵션
  const categories = useMemo(
    () => ['ALL', ...Array.from(new Set(docs.map((d) => d.category).filter(Boolean))).sort()],
    [docs],
  )
  const departments = useMemo(
    () => ['ALL', ...Array.from(new Set(docs.map((d) => d.target_department).filter(Boolean))).sort()],
    [docs],
  )

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      const q = searchQuery.toLowerCase()
      const matchSearch =
        !q ||
        d.file_name.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        d.target_department.toLowerCase().includes(q)
      const matchCat = categoryFilter === 'ALL' || d.category === categoryFilter
      const matchDept = deptFilter === 'ALL' || d.target_department === deptFilter
      return matchSearch && matchCat && matchDept
    })
  }, [docs, searchQuery, categoryFilter, deptFilter])

  // 내 파일만
  const myDocs = useMemo(
    () => filtered.filter((d) => d.uploader_id === profile?.id),
    [filtered, profile],
  )
  const sharedDocs = useMemo(
    () => filtered.filter((d) => d.uploader_id !== profile?.id),
    [filtered, profile],
  )

  async function handleDeleteDoc(doc: KnowledgeBaseRow) {
    if (doc.id.startsWith('mock-')) {
      setToastMessage(`"${doc.file_name}"은(는) 데모 자료라 삭제할 수 없습니다.`)
      setTimeout(() => setToastMessage(null), 4000)
      return
    }

    const yes = await confirmDialog({
      title: `"${doc.file_name}" 자료를 휴지통으로 이동할까요?`,
      description: '사내 자료실 휴지통에서 복원할 수 있습니다.',
      confirmLabel: '휴지통으로 이동',
      tone: 'danger',
    })
    if (!yes) return

    setDeletingId(doc.id)
    const res = await softDeleteKnowledgeBaseDocument(supabase, doc.id)
    setDeletingId(null)

    if (!res.ok) {
      setToastMessage(`삭제 실패: ${res.message}`)
    } else {
      setDocs((prev) => prev.filter((row) => row.id !== doc.id))
      setToastMessage(`"${doc.file_name}"이(가) 휴지통으로 이동되었습니다.`)
    }
    setTimeout(() => setToastMessage(null), 4000)
  }

  // 동기화 로직 (실시간 새로고침 + 그래프 재조회)
  const handleSync = async () => {
    if (isSyncing) return
    setIsSyncing(true)
    setSyncProgress(12)
    setSyncStep('📁 사내 자료실 변경사항 스캔 중...')

    setTimeout(() => { setSyncProgress(42); setSyncStep('☁️ Supabase RAG 임베딩 노드 스캔 중...') }, 700)
    setTimeout(() => { setSyncProgress(78); setSyncStep('🧠 지식 그래프 인접 연계성 재계산 중...') }, 1400)

    setTimeout(async () => {
      // 미처리 큐 항목 처리 (pending 상태인 문서를 그래프에 적재)
      const workerRes = await invokeIngestWorker(20).catch(() => null)
      if (workerRes?.ok && workerRes.succeeded > 0) {
        setSyncStep(`🧠 ${workerRes.succeeded}건 그래프 노드 적재 완료...`)
      }

      // 실제 데이터 재조회
      const [docsRes, graphRes] = await Promise.allSettled([
        fetchKnowledgeBase(supabase),
        fetchKnowledgeGraphData(300),
      ])

      let fetchedDocsCount = docs.length
      if (docsRes.status === 'fulfilled' && docsRes.value.ok) {
        setDocs(docsRes.value.rows)
        fetchedDocsCount = docsRes.value.rows.length
      }
      if (graphRes.status === 'fulfilled') {
        setGraphStats({ nodes: graphRes.value.nodes.length, edges: graphRes.value.edges.length })
      }

      const workerMsg = workerRes?.ok && workerRes.succeeded > 0
        ? ` (+${workerRes.succeeded}건 그래프 노드 신규 적재)`
        : ''
      setSyncProgress(100)
      setIsSyncing(false)
      setSyncStep('')
      setToastMessage(`⚡ 동기화 완료! 실제 데이터 ${fetchedDocsCount}건이 최신 상태로 반영되었습니다.${workerMsg}`)
      setTimeout(() => setToastMessage(null), 4000)
    }, 2200)
  }


  return (
    <div className="flex flex-col h-full bg-bg p-6 gap-6 text-fg overflow-y-auto relative">
      {/* 토스트 */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-surface/95 border border-brand/30 text-brand px-5 py-3 rounded-xl shadow-2xl backdrop-blur-lg flex items-center gap-3">
          <span className="text-lg">⚡</span>
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {/* 헤더 + 필터 (최상단) */}
      <PageHeader
        eyebrow="지식 · 라이브러리"
        title="라이브러리"
        description="내가 올리거나 사내에 공유된 문서·이미지를 검색하고 탐색합니다."
        icon={IconLibrary}
        actions={
          <>
            <input
              type="search"
              placeholder="파일명, 부서, 카테고리 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-[36px] w-full rounded-[10px] border border-border bg-surface px-[12px] text-base text-fg outline-none transition placeholder:text-fg-subtle focus:border-brand focus:ring-2 focus:ring-focus/25 md:w-[220px] md:text-sm"
            />
            <select
              aria-label="카테고리 필터"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-[36px] rounded-[10px] border border-border bg-surface px-[10px] text-sm text-fg outline-none focus:border-brand"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c === 'ALL' ? '전체 카테고리' : c}</option>
              ))}
            </select>
            <select
              aria-label="부서 필터"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="h-[36px] rounded-[10px] border border-border bg-surface px-[10px] text-sm text-fg outline-none focus:border-brand"
            >
              {departments.map((d) => (
                <option key={d} value={d}>{d === 'ALL' ? '전체 부서' : d}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowPipeline((v) => !v)}
              aria-expanded={showPipeline}
              className="inline-flex h-[36px] items-center gap-[6px] rounded-[10px] border border-border bg-surface px-[12px] text-sm font-medium text-fg transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 disabled:opacity-50"
            >
              {showPipeline ? '현황 접기 ▲' : '📊 파이프라인 현황'}
            </button>
          </>
        }
      />

      {/* 상단 AI 성장 대시보드 (선택 표시) */}
      {showPipeline && (
      <div className="rounded-2xl border border-border bg-surface/90 p-6 shadow-2xl backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-32 bg-brand/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-32 bg-accent/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand" />
              </span>
              <h2 className="text-xs font-bold tracking-wider text-brand uppercase">
                NH-AX-HUB: 사내 지식 데이터 파이프라인
              </h2>
            </div>
            <h3 className="text-lg font-bold text-fg mt-1.5">
              사내 자료실 × 지식 그래프 융합 현황
            </h3>
            <p className="text-xs text-fg-subtle mt-2 max-w-3xl leading-relaxed">
              사내 자료실에 등록된 문서가 AI에 의해 자동 분석·임베딩되어 지식 그래프와 RAG 검색에 활용됩니다.
              파일 업로드 시 백그라운드에서 개념 추출 및 관계성 평가가 수행됩니다.
            </p>

            {/* 실시간 통계 카드 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-5">
              {/* 전체 등록 문서 */}
              <div className="bg-surface-2/40 border border-border rounded-xl p-3.5 hover:border-border-strong transition-all duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-fg-muted">📁 전체 등록 문서</span>
                  <span className="text-[10px] text-brand bg-pink-950/20 px-2 py-0.5 rounded border border-brand/30 font-medium">
                    🟢 실시간
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5 mt-2.5">
                  <span className="text-lg font-bold text-fg font-mono">
                    {docsLoading ? '—' : docs.length.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-fg-subtle">개 파일</span>
                </div>
                <div className="w-full bg-surface h-1.5 rounded-full mt-2.5 overflow-hidden">
                  <div className="bg-brand h-full rounded-full transition-all duration-700"
                    style={{ width: docs.length > 0 ? `${Math.min(100, (myDocs.length / docs.length) * 100)}%` : '0%' }} />
                </div>
                <div className="flex justify-between text-[9px] text-fg-subtle mt-1">
                  <span>내 업로드 비율</span>
                  <span className="font-bold text-fg-muted">
                    {docs.length > 0 ? Math.round((myDocs.length / docs.length) * 100) : 0}%
                  </span>
                </div>
              </div>

              {/* 지식 그래프 노드 */}
              <div className="bg-surface-2/40 border border-border rounded-xl p-3.5 hover:border-border-strong transition-all duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-fg-muted">🌐 지식 그래프 노드</span>
                  {graphStats && graphStats.nodes > 0 ? (
                    <span className="text-[10px] text-accent bg-cyan-950/20 px-2 py-0.5 rounded border border-cyan-500/10 font-medium animate-pulse">
                      🟢 연결됨
                    </span>
                  ) : (
                    <span className="text-[10px] text-fg-subtle bg-surface px-2 py-0.5 rounded border border-border font-medium">
                      ⚪ 대기 중
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1.5 mt-2.5">
                  <span className="text-lg font-bold text-fg font-mono">
                    {graphStats ? graphStats.nodes.toLocaleString() : '0'}
                  </span>
                  <span className="text-[10px] text-fg-subtle">개 노드</span>
                </div>
                <div className="w-full bg-surface h-1.5 rounded-full mt-2.5 overflow-hidden">
                  <div 
                    className="bg-cyan-500 h-full rounded-full transition-all duration-700" 
                    style={{ width: graphStats && graphStats.nodes > 0 ? `${Math.min(100, (graphStats.edges / graphStats.nodes) * 100)}%` : '0%' }} 
                  />
                </div>
                <div className="flex justify-between text-[9px] text-fg-subtle mt-1">
                  <span>연결 엣지 수</span>
                  <span className="font-bold text-fg-muted">
                    {graphStats ? graphStats.edges.toLocaleString() : '0'}개
                  </span>
                </div>
              </div>

              {/* 부서별 분포 */}
              <div className="bg-surface-2/40 border border-border rounded-xl p-3.5 hover:border-border-strong transition-all duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-fg-muted">🏢 참여 부서</span>
                  <span className="text-[10px] text-accent bg-purple-950/20 px-2 py-0.5 rounded border border-purple-500/10 font-medium flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                    🟢 실시간
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5 mt-2.5">
                  <span className="text-lg font-bold text-fg font-mono">
                    {Math.max(0, departments.length - 1)}
                  </span>
                  <span className="text-[10px] text-fg-subtle">개 부서</span>
                </div>
                <div className="w-full bg-surface h-1.5 rounded-full mt-2.5 overflow-hidden">
                  <div 
                    className="bg-purple-500 h-full rounded-full transition-all duration-700" 
                    style={{ width: categories.length > 1 ? `${Math.min(100, ((departments.length - 1) / (categories.length - 1)) * 100)}%` : '0%' }} 
                  />
                </div>
                <div className="flex justify-between text-[9px] text-fg-subtle mt-1">
                  <span>등록 카테고리</span>
                  <span className="font-bold text-fg-muted">{Math.max(0, categories.length - 1)}개</span>
                </div>
              </div>
            </div>
          </div>

          {/* 동기화 패널 */}
          <div className="shrink-0 bg-surface-2/60 border border-border rounded-2xl p-5 text-center shadow-inner w-full xl:w-64 flex flex-col justify-between gap-4">
            <div>
              <span className="block text-[10px] text-fg-subtle uppercase font-bold tracking-wider">
                내 업로드 문서
              </span>
              <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-accent to-accent font-mono">
                {docsLoading ? '...' : myDocs.length.toLocaleString()}건
              </span>
            </div>
            <div className="border-t border-b border-border py-3 my-1 grid grid-cols-2 gap-4">
              <div>
                <span className="block text-[9px] text-fg-subtle font-semibold">전체 공유 문서</span>
                <span className="text-base font-bold text-fg font-mono">{docs.length}건</span>
              </div>
              <div>
                <span className="block text-[9px] text-fg-subtle font-semibold">카테고리</span>
                <span className="text-base font-bold text-success font-mono">{categories.length - 1}종</span>
              </div>
            </div>
            <div>
              {isSyncing ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] text-brand font-semibold">
                    <span className="animate-pulse">{syncStep}</span>
                    <span>{syncProgress}%</span>
                  </div>
                  <div className="w-full bg-surface h-2 rounded-full overflow-hidden border border-border">
                    <div
                      className="bg-gradient-to-r from-brand to-accent h-full transition-all duration-300"
                      style={{ width: `${syncProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleSync}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-brand to-accent hover:from-pink-500 hover:to-violet-500 text-fg text-xs font-bold tracking-wide shadow-lg shadow-card transition-all duration-200 flex items-center justify-center gap-2 border border-brand/30 active:scale-[0.98]"
                >
                  <span>⚡</span> 데이터 새로고침
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* 문서 목록 */}
      <main className="flex-1">
        {docsLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-4 border-brand/30 border-t-pink-500 rounded-full animate-spin" />
            <p className="text-sm text-fg-subtle">사내 자료실을 불러오는 중...</p>
          </div>
        ) : docsError ? (
          <div className="flex items-center justify-center py-20 text-danger text-sm">
            데이터를 불러오지 못했습니다: {docsError}
          </div>
        ) : filtered.length === 0 ? (
          docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-surface/40 border border-border rounded-2xl gap-6 max-w-2xl mx-auto shadow-inner backdrop-blur-sm">
              <span className="text-5xl animate-bounce duration-[3000ms]">📚</span>
              <div className="space-y-3">
                <h4 className="text-base font-bold text-fg tracking-wide">사내 지식 아카이브가 비어 있습니다</h4>
                <div className="text-xs leading-relaxed text-fg-subtle max-w-lg mx-auto space-y-2 text-left bg-surface/50 p-4 rounded-xl border border-border">
                  <p className="font-semibold text-fg-muted">💡 라이브러리에 RAG 문서를 수집하는 두 가지 방법:</p>
                  <p>1. <span className="font-semibold text-brand">사내 자료실 직접 업로드:</span> 📁 공개 폴더, 내 개인 폴더 등에 파일을 직접 등록하면 즉시 AI RAG 분석이 수행되어 이곳에 기록됩니다.</p>
                  <p>2. <span className="font-semibold text-accent">공유 구글 드라이브 문서 RAG 연동:</span> 연동된 구글 드라이브 문서는 사내 자료실(<Link to="/reference-room" className="text-accent underline">자료실 바로가기</Link>)에서 해당 문서 옆의 <span className="font-semibold text-fg">"RAG 등록"</span> 버튼을 1회 실행하시면 즉시 본문을 발췌·학습하여 이곳 라이브러리 및 지식 그래프에 자동 연계됩니다!</p>
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-3 w-full">
                <Link
                  to="/reference-room"
                  className="py-3 px-6 rounded-xl bg-gradient-to-r from-brand to-accent hover:from-pink-500 hover:to-violet-500 text-fg text-xs font-bold tracking-wide shadow-lg shadow-card hover:shadow-pink-500/30 transition-all duration-200 active:scale-[0.98] border border-brand/30"
                >
                  📂 사내 자료실 & 드라이브 RAG 검토하러 가기 →
                </Link>
              </div>
            </div>
          ) : (
            <EmptyState
              className="mx-auto max-w-2xl"
              icon={IconLibrary}
              title="검색 조건에 맞는 문서가 없습니다"
              description="검색어나 카테고리·부서 필터를 바꿔 보세요."
            />
          )
        ) : (

          <div className="space-y-6">
            {/* 내 문서 */}
            {myDocs.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider text-brand mb-3 flex items-center gap-2">
                  <span>👤</span> 내가 등록한 문서 ({myDocs.length})
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {myDocs.map((doc) => (
                    <DocCard
                      key={doc.id}
                      doc={doc}
                      mine
                      canDelete
                      deleting={deletingId === doc.id}
                      onDelete={() => void handleDeleteDoc(doc)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* 공유 문서 */}
            {sharedDocs.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider text-accent mb-3 flex items-center gap-2">
                  <span>🏢</span> 사내 공유 문서 ({sharedDocs.length})
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sharedDocs.map((doc) => (
                    <DocCard
                      key={doc.id}
                      doc={doc}
                      canDelete={doc.uploader_id === profile?.id}
                      deleting={deletingId === doc.id}
                      onDelete={() => void handleDeleteDoc(doc)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function DocCard({
  doc,
  mine,
  canDelete = false,
  deleting = false,
  onDelete,
}: {
  doc: KnowledgeBaseRow
  mine?: boolean
  canDelete?: boolean
  deleting?: boolean
  onDelete?: () => void
}) {
  const fileType = getFileType(doc.file_name)
  const meta = FILE_TYPE_META[fileType]

  return (
    <article className="flex flex-col justify-between bg-surface/80 border border-border rounded-2xl p-4 shadow-xl hover:border-brand transition-all duration-200 gap-3">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${meta.colorClass}`}>
            {meta.emoji} {meta.label}
          </span>
          {mine && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-pink-950/40 text-brand border border-brand/30 font-bold">
              내 파일
            </span>
          )}
        </div>

        <h3 className="text-sm font-bold text-fg leading-snug break-all line-clamp-2">
          {doc.file_name}
        </h3>

        <div className="flex flex-wrap gap-2 mt-2">
          {doc.category && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-surface-3 border border-border-strong text-fg-muted">
              {doc.category}
            </span>
          )}
          {doc.target_department && (
            <span
              className="text-[10px] px-2 py-0.5 rounded bg-surface-3 border border-border-strong text-fg-muted"
              title="드라이브 폴더 경로 또는 등록 시 지정된 RAG 부서"
            >
              🏢 {knowledgeDepartmentLabel(doc.target_department)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        <span className="text-[10px] text-fg-subtle tabular-nums">
          {formatDate(doc.created_at)}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {doc.file_url && !doc.file_url.startsWith('kb-storage:') && (
            <a
              href={doc.file_url}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-brand hover:text-brand-strong font-semibold flex items-center gap-1 transition"
            >
              열기 →
            </a>
          )}
          {canDelete && onDelete ? (
            <button
              type="button"
              disabled={deleting}
              onClick={onDelete}
              className="text-[10px] font-semibold text-danger transition hover:text-danger disabled:opacity-50"
            >
              {deleting ? '삭제 중…' : '삭제'}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}
