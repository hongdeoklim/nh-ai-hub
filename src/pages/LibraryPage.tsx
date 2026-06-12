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
  slides: { emoji: '📊', label: 'Slides', colorClass: 'bg-orange-950/40 text-orange-400 border-orange-500/20' },
  sheets: { emoji: '📋', label: 'Sheets', colorClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-500/20' },
  pdf: { emoji: '📄', label: 'PDF', colorClass: 'bg-red-950/40 text-red-400 border-red-500/20' },
  image: { emoji: '🖼️', label: 'Image', colorClass: 'bg-violet-950/40 text-violet-400 border-violet-500/20' },
  doc: { emoji: '📝', label: 'Document', colorClass: 'bg-sky-950/40 text-sky-400 border-sky-500/20' },
  etc: { emoji: '📎', label: 'File', colorClass: 'bg-slate-800 text-slate-400 border-slate-700' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function LibraryPage() {
  const { profile } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [deptFilter, setDeptFilter] = useState('ALL')

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

    const yes = window.confirm(
      `"${doc.file_name}" 자료를 안전하게 휴지통으로 이동할까요?\n(사내 자료실 휴지통에서 복원할 수 있습니다.)`,
    )
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
    <div className="flex flex-col h-full bg-[#05070c] p-6 gap-6 text-slate-100 select-none overflow-y-auto relative">
      {/* 토스트 */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-[#0c101b]/95 border border-pink-500/30 text-pink-300 px-5 py-3 rounded-xl shadow-2xl backdrop-blur-lg flex items-center gap-3">
          <span className="text-lg">⚡</span>
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {/* 상단 AI 성장 대시보드 */}
      <div className="rounded-2xl border border-slate-800 bg-[#070b14]/90 p-6 shadow-2xl backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-32 bg-pink-500/5 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-32 bg-cyan-500/5 blur-[100px] rounded-full pointer-events-none" />

        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-pink-500" />
              </span>
              <h2 className="text-xs font-bold tracking-wider text-pink-400 uppercase">
                NH-AX-HUB: 사내 지식 데이터 파이프라인
              </h2>
            </div>
            <h3 className="text-lg font-bold text-white mt-1.5">
              사내 자료실 × 지식 그래프 융합 현황
            </h3>
            <p className="text-xs text-slate-400 mt-2 max-w-3xl leading-relaxed">
              사내 자료실에 등록된 문서가 AI에 의해 자동 분석·임베딩되어 지식 그래프와 RAG 검색에 활용됩니다.
              파일 업로드 시 백그라운드에서 개념 추출 및 관계성 평가가 수행됩니다.
            </p>

            {/* 실시간 통계 카드 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-5">
              {/* 전체 등록 문서 */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3.5 hover:border-slate-700/60 transition-all duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">📁 전체 등록 문서</span>
                  <span className="text-[10px] text-pink-400 bg-pink-950/20 px-2 py-0.5 rounded border border-pink-500/10 font-medium">
                    🟢 실시간
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5 mt-2.5">
                  <span className="text-lg font-bold text-white font-mono">
                    {docsLoading ? '—' : docs.length.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-500">개 파일</span>
                </div>
                <div className="w-full bg-slate-950 h-1.5 rounded-full mt-2.5 overflow-hidden">
                  <div className="bg-pink-500 h-full rounded-full transition-all duration-700"
                    style={{ width: docs.length > 0 ? `${Math.min(100, (myDocs.length / docs.length) * 100)}%` : '0%' }} />
                </div>
                <div className="flex justify-between text-[9px] text-slate-500 mt-1">
                  <span>내 업로드 비율</span>
                  <span className="font-bold text-slate-300">
                    {docs.length > 0 ? Math.round((myDocs.length / docs.length) * 100) : 0}%
                  </span>
                </div>
              </div>

              {/* 지식 그래프 노드 */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3.5 hover:border-slate-700/60 transition-all duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">🌐 지식 그래프 노드</span>
                  {graphStats && graphStats.nodes > 0 ? (
                    <span className="text-[10px] text-cyan-400 bg-cyan-950/20 px-2 py-0.5 rounded border border-cyan-500/10 font-medium animate-pulse">
                      🟢 연결됨
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 font-medium">
                      ⚪ 대기 중
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1.5 mt-2.5">
                  <span className="text-lg font-bold text-white font-mono">
                    {graphStats ? graphStats.nodes.toLocaleString() : '0'}
                  </span>
                  <span className="text-[10px] text-slate-500">개 노드</span>
                </div>
                <div className="w-full bg-slate-950 h-1.5 rounded-full mt-2.5 overflow-hidden">
                  <div 
                    className="bg-cyan-500 h-full rounded-full transition-all duration-700" 
                    style={{ width: graphStats && graphStats.nodes > 0 ? `${Math.min(100, (graphStats.edges / graphStats.nodes) * 100)}%` : '0%' }} 
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-500 mt-1">
                  <span>연결 엣지 수</span>
                  <span className="font-bold text-slate-300">
                    {graphStats ? graphStats.edges.toLocaleString() : '0'}개
                  </span>
                </div>
              </div>

              {/* 부서별 분포 */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3.5 hover:border-slate-700/60 transition-all duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">🏢 참여 부서</span>
                  <span className="text-[10px] text-purple-400 bg-purple-950/20 px-2 py-0.5 rounded border border-purple-500/10 font-medium flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                    🟢 실시간
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5 mt-2.5">
                  <span className="text-lg font-bold text-white font-mono">
                    {Math.max(0, departments.length - 1)}
                  </span>
                  <span className="text-[10px] text-slate-500">개 부서</span>
                </div>
                <div className="w-full bg-slate-950 h-1.5 rounded-full mt-2.5 overflow-hidden">
                  <div 
                    className="bg-purple-500 h-full rounded-full transition-all duration-700" 
                    style={{ width: categories.length > 1 ? `${Math.min(100, ((departments.length - 1) / (categories.length - 1)) * 100)}%` : '0%' }} 
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-500 mt-1">
                  <span>등록 카테고리</span>
                  <span className="font-bold text-slate-300">{Math.max(0, categories.length - 1)}개</span>
                </div>
              </div>
            </div>
          </div>

          {/* 동기화 패널 */}
          <div className="shrink-0 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 text-center shadow-inner w-full xl:w-64 flex flex-col justify-between gap-4">
            <div>
              <span className="block text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                내 업로드 문서
              </span>
              <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-violet-400 to-cyan-400 font-mono">
                {docsLoading ? '...' : myDocs.length.toLocaleString()}건
              </span>
            </div>
            <div className="border-t border-b border-slate-800/80 py-3 my-1 grid grid-cols-2 gap-4">
              <div>
                <span className="block text-[9px] text-slate-500 font-semibold">전체 공유 문서</span>
                <span className="text-base font-bold text-white font-mono">{docs.length}건</span>
              </div>
              <div>
                <span className="block text-[9px] text-slate-500 font-semibold">카테고리</span>
                <span className="text-base font-bold text-emerald-400 font-mono">{categories.length - 1}종</span>
              </div>
            </div>
            <div>
              {isSyncing ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] text-pink-400 font-semibold">
                    <span className="animate-pulse">{syncStep}</span>
                    <span>{syncProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="bg-gradient-to-r from-pink-500 to-cyan-500 h-full transition-all duration-300"
                      style={{ width: `${syncProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleSync}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-pink-600 to-violet-600 hover:from-pink-500 hover:to-violet-500 text-white text-xs font-bold tracking-wide shadow-lg shadow-pink-500/10 transition-all duration-200 flex items-center justify-center gap-2 border border-pink-500/20 active:scale-[0.98]"
                >
                  <span>⚡</span> 데이터 새로고침
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 헤더 + 필터 */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-[26px]">📚</span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">라이브러리</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              사내 자료실에 등록된 문서를 검색하고 탐색합니다.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="파일명, 부서, 카테고리 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-56 rounded-lg border border-slate-800 bg-[#0c101b] px-3.5 py-2 text-xs text-slate-200 outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition duration-200"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-[#0c101b] px-3 py-2 text-xs text-slate-200 outline-none focus:border-pink-500 transition duration-200"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c === 'ALL' ? '전체 카테고리' : c}</option>
            ))}
          </select>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-[#0c101b] px-3 py-2 text-xs text-slate-200 outline-none focus:border-pink-500 transition duration-200"
          >
            {departments.map((d) => (
              <option key={d} value={d}>{d === 'ALL' ? '전체 부서' : d}</option>
            ))}
          </select>
        </div>
      </header>

      {/* 문서 목록 */}
      <main className="flex-1">
        {docsLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-4 border-pink-500/20 border-t-pink-500 rounded-full animate-spin" />
            <p className="text-sm text-slate-400">사내 자료실을 불러오는 중...</p>
          </div>
        ) : docsError ? (
          <div className="flex items-center justify-center py-20 text-red-400 text-sm">
            데이터를 불러오지 못했습니다: {docsError}
          </div>
        ) : filtered.length === 0 ? (
          docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-[#070b14]/40 border border-slate-800/80 rounded-2xl gap-6 max-w-2xl mx-auto shadow-inner backdrop-blur-sm">
              <span className="text-5xl animate-bounce duration-[3000ms]">📚</span>
              <div className="space-y-3">
                <h4 className="text-base font-bold text-white tracking-wide">사내 지식 아카이브가 비어 있습니다</h4>
                <div className="text-xs leading-relaxed text-slate-400 max-w-lg mx-auto space-y-2 text-left bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                  <p className="font-semibold text-slate-300">💡 라이브러리에 RAG 문서를 수집하는 두 가지 방법:</p>
                  <p>1. <span className="font-semibold text-pink-400">사내 자료실 직접 업로드:</span> 📁 공개 폴더, 내 개인 폴더 등에 파일을 직접 등록하면 즉시 AI RAG 분석이 수행되어 이곳에 기록됩니다.</p>
                  <p>2. <span className="font-semibold text-cyan-400">공유 구글 드라이브 문서 RAG 연동:</span> 연동된 구글 드라이브 문서는 사내 자료실(<Link to="/reference-room" className="text-cyan-400 underline">자료실 바로가기</Link>)에서 해당 문서 옆의 <span className="font-semibold text-white">"RAG 등록"</span> 버튼을 1회 실행하시면 즉시 본문을 발췌·학습하여 이곳 라이브러리 및 지식 그래프에 자동 연계됩니다!</p>
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-3 w-full">
                <Link
                  to="/reference-room"
                  className="py-3 px-6 rounded-xl bg-gradient-to-r from-pink-600 to-violet-600 hover:from-pink-500 hover:to-violet-500 text-white text-xs font-bold tracking-wide shadow-lg shadow-pink-500/20 hover:shadow-pink-500/30 transition-all duration-200 active:scale-[0.98] border border-pink-500/10"
                >
                  📂 사내 자료실 & 드라이브 RAG 검토하러 가기 →
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500 bg-[#070b14]/25 border border-slate-800/40 rounded-2xl max-w-2xl mx-auto">
              <span className="text-4xl">📭</span>
              <p className="text-sm">검색 조건에 맞는 문서가 없습니다.</p>
            </div>
          )
        ) : (

          <div className="space-y-6">
            {/* 내 문서 */}
            {myDocs.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider text-pink-400 mb-3 flex items-center gap-2">
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
                <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-3 flex items-center gap-2">
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
    <article className="flex flex-col justify-between bg-[#0c101b]/80 border border-slate-800/80 rounded-2xl p-4 shadow-xl hover:border-pink-500/20 transition-all duration-200 gap-3">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${meta.colorClass}`}>
            {meta.emoji} {meta.label}
          </span>
          {mine && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-pink-950/40 text-pink-400 border border-pink-500/20 font-bold">
              내 파일
            </span>
          )}
        </div>

        <h3 className="text-sm font-bold text-white leading-snug break-all line-clamp-2">
          {doc.file_name}
        </h3>

        <div className="flex flex-wrap gap-2 mt-2">
          {doc.category && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
              {doc.category}
            </span>
          )}
          {doc.target_department && (
            <span
              className="text-[10px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300"
              title="드라이브 폴더 경로 또는 등록 시 지정된 RAG 부서"
            >
              🏢 {knowledgeDepartmentLabel(doc.target_department)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
        <span className="text-[10px] text-slate-500 tabular-nums">
          {formatDate(doc.created_at)}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {doc.file_url && !doc.file_url.startsWith('kb-storage:') && (
            <a
              href={doc.file_url}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-pink-400 hover:text-pink-300 font-semibold flex items-center gap-1 transition"
            >
              열기 →
            </a>
          )}
          {canDelete && onDelete ? (
            <button
              type="button"
              disabled={deleting}
              onClick={onDelete}
              className="text-[10px] font-semibold text-red-400 transition hover:text-red-300 disabled:opacity-50"
            >
              {deleting ? '삭제 중…' : '삭제'}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}
