import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchKnowledgeGraphData,
  searchKnowledgeNodes,
  type GraphData,
  type GraphNode,
} from '../services/knowledge-graph/knowledge-graph-client'
import { KnowledgeGraphViewer } from '../components/knowledge-graph/KnowledgeGraphViewer'
import { KnowledgeGraphHelpDialog } from '../components/knowledge-graph/KnowledgeGraphHelpDialog'

const NODE_TYPE_META: Record<string, { color: string; label: string }> = {
  faq:       { color: '#f472b6', label: 'FAQ' },
  concept:   { color: '#34d399', label: '개념' },
  document:  { color: '#60a5fa', label: '문서' },
  wiki:      { color: '#a78bfa', label: '위키' },
  raw_chunk: { color: '#22d3ee', label: '청크' },
}

const PANEL_STYLE: React.CSSProperties = {
  background: 'rgba(6,10,24,0.85)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.07)',
}

function NodeTypeBadge({ type }: { type: string }) {
  const meta = NODE_TYPE_META[type]
  const color = meta?.color ?? '#94a3b8'
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] font-bold tracking-wider uppercase whitespace-nowrap"
      style={{ background: `${color}1a`, color, border: `1px solid ${color}33` }}
    >
      <span className="w-1 h-1 rounded-full shrink-0" style={{ background: color }} />
      {meta?.label ?? type}
    </span>
  )
}

export function KnowledgeGraphPage() {
  const navigate = useNavigate()
  const [data, setData]             = useState<GraphData>({ nodes: [], edges: [] })
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [helpOpen, setHelpOpen]     = useState(false)
  const [selectedNode, setSelectedNode]         = useState<GraphNode | null>(null)
  const [searchQuery, setSearchQuery]           = useState('')
  const [searchInput, setSearchInput]           = useState('')  // 입력값 (디바운스 전)
  const [searchLoading, setSearchLoading]       = useState(false)
  const [searchData, setSearchData]             = useState<GraphData | null>(null) // 서버 검색 결과
  const [departmentFilter, setDepartmentFilter] = useState('ALL')
  const [nodeTypeFilter, setNodeTypeFilter]     = useState('ALL')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 전체 데이터 로드
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true); setError(null)
        const result = await fetchKnowledgeGraphData(5000)
        if (!cancelled) setData(result)
      } catch (e: any) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [refreshKey])

  // 검색 입력 디바운스 → 500ms 후 DB 검색
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const trimmed = searchInput.trim()
    if (!trimmed) {
      setSearchQuery('')
      setSearchData(null)
      return
    }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const result = await searchKnowledgeNodes(trimmed)
        setSearchData(result)
        setSearchQuery(trimmed)
      } finally {
        setSearchLoading(false)
      }
    }, 500)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [searchInput])

  // 검색 결과 또는 전체 데이터 중 선택
  const baseData = searchData ?? data

  const departments = useMemo(() => {
    const s = new Set<string>()
    data.nodes.forEach(n => { if (n.department) s.add(n.department) })
    return Array.from(s).sort()
  }, [data])

  const nodeTypes = useMemo(() => {
    const s = new Set<string>()
    data.nodes.forEach(n => { if (n.node_type) s.add(n.node_type) })
    return Array.from(s).sort()
  }, [data])

  // 부서/타입 필터는 baseData에서 클라이언트 필터링
  const filteredData = useMemo(() => {
    let nodes = baseData.nodes
    if (departmentFilter !== 'ALL') nodes = nodes.filter(n => n.department === departmentFilter)
    if (nodeTypeFilter !== 'ALL')   nodes = nodes.filter(n => n.node_type === nodeTypeFilter)
    const nodeIds = new Set(nodes.map(n => n.id))
    const edges   = baseData.edges.filter(e => nodeIds.has(e.source_node_id) && nodeIds.has(e.target_node_id))
    // 검색 결과에서 매칭 노드 ID (1-hop 이웃 제외한 직접 매칭)
    const matchingIds = searchData
      ? new Set(searchData.nodes.filter(n =>
          n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.content?.toLowerCase().includes(searchQuery.toLowerCase())
        ).map(n => n.id))
      : null
    return { nodes, edges, nodeIds, matchingIds }
  }, [baseData, departmentFilter, nodeTypeFilter, searchData, searchQuery])

  const selectedNodeEdges = useMemo(() => {
    if (!selectedNode) return []
    return baseData.edges.filter(
      e => e.source_node_id === selectedNode.id || e.target_node_id === selectedNode.id
    )
  }, [selectedNode, baseData.edges])

  const isFiltering = searchQuery !== '' || departmentFilter !== 'ALL' || nodeTypeFilter !== 'ALL'
  const isSearchMode = searchData !== null

  return (
    <div
      className="w-screen h-screen overflow-hidden relative select-none text-slate-100"
      style={{ background: 'radial-gradient(ellipse 120% 80% at 55% 40%, #0d1530 0%, #070b18 55%, #020408 100%)' }}
    >
      {/* 배경 성운 */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute top-[20%] left-[35%] w-[700px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, #7c3aed22 0%, transparent 65%)', filter: 'blur(80px)' }} />
        <div className="absolute bottom-[20%] right-[20%] w-[500px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, #0891b21a 0%, transparent 65%)', filter: 'blur(70px)' }} />
        <div className="absolute top-[60%] left-[15%] w-[400px] h-[300px] rounded-full"
          style={{ background: 'radial-gradient(circle, #be185d14 0%, transparent 65%)', filter: 'blur(60px)' }} />
      </div>

      {/* ── 3D 그래프 (z-0, 전체화면) ── */}
      <main className="absolute inset-0 z-0">
        {error ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center px-6">
              <p className="text-red-400 text-sm mb-1">데이터 로드 실패</p>
              <p className="text-slate-600 text-sm mb-4 max-w-xs">{error}</p>
              <button
                onClick={() => setRefreshKey(k => k + 1)}
                className="px-4 py-1.5 rounded-lg text-sm text-slate-300 hover:text-white transition"
                style={PANEL_STYLE}
              >
                다시 시도
              </button>
            </div>
          </div>
        ) : (
          <>
            <KnowledgeGraphViewer
              data={filteredData}
              onNodeClick={setSelectedNode}
              selectedNodeId={selectedNode?.id}
              matchingNodeIds={isSearchMode ? filteredData.matchingIds ?? filteredData.nodeIds : isFiltering ? filteredData.nodeIds : null}
            />
            {loading && (
              <div
                className="absolute inset-0 flex items-center justify-center z-10"
                style={{ background: 'rgba(2,4,8,0.7)', backdropFilter: 'blur(8px)' }}
              >
                <div className="flex flex-col items-center gap-4">
                  <div className="relative w-12 h-12">
                    <div className="absolute inset-0 rounded-full border-2 border-fuchsia-500/20 border-t-fuchsia-400 animate-spin" />
                    <div className="absolute inset-2 rounded-full border-2 border-cyan-500/20 border-b-cyan-400 animate-spin"
                      style={{ animationDirection: 'reverse', animationDuration: '0.75s' }} />
                  </div>
                  <p className="text-sm text-slate-400 tracking-wide">지식 그래프 로딩 중…</p>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── 좌측 사이드바 ── */}
      <aside className="absolute top-4 left-4 z-20 flex flex-col gap-2.5" style={{ width: 300 }}>

        {/* 헤더 카드 */}
        <div className="rounded-2xl px-4 py-3 shadow-xl" style={PANEL_STYLE}>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/admin')}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title="관리자로 돌아가기">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1">
              <p className="text-base font-bold text-white whitespace-nowrap">사내 지식 그래프</p>
              <p className="text-sm text-slate-500 leading-none mt-0.5 whitespace-nowrap">3D Knowledge Network</p>
            </div>
            <button onClick={() => setRefreshKey(k => k + 1)} disabled={loading}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30" title="새로고침">
              <svg className={`w-4 h-4 ${loading ? 'animate-spin text-fuchsia-400' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button onClick={() => setHelpOpen(true)}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-white/10 transition-colors" title="도움말">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* 통계 */}
        <div className="rounded-2xl px-4 py-3 grid grid-cols-2 gap-3 shadow-xl" style={PANEL_STYLE}>
          <div className="text-center">
            <p className="text-2xl font-bold text-fuchsia-400 tabular-nums leading-none">{filteredData.nodes.length.toLocaleString()}</p>
            <p className="text-sm text-slate-400 mt-1">노드</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-cyan-400 tabular-nums leading-none">{filteredData.edges.length.toLocaleString()}</p>
            <p className="text-sm text-slate-400 mt-1">연결</p>
          </div>
        </div>

        {/* 검색 + 필터 */}
        <div className="rounded-2xl p-4 flex flex-col gap-3 shadow-xl" style={PANEL_STYLE}>
          <div className="relative">
            {searchLoading ? (
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fuchsia-400 animate-spin pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
            <input type="search" placeholder="제목·내용·부서 검색..."
              value={searchInput} onChange={e => setSearchInput(e.target.value)}
              className="w-full rounded-xl border border-white/8 bg-black/30 pl-10 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/20 transition"
            />
          </div>
          {isSearchMode && (
            <p className="text-sm text-slate-400 px-1">
              매칭 <strong className="text-fuchsia-300">{filteredData.matchingIds?.size ?? 0}</strong>개 +
              이웃 <strong className="text-cyan-300">{filteredData.nodes.length - (filteredData.matchingIds?.size ?? 0)}</strong>개 노드
            </p>
          )}
          <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)}
            className="w-full rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-sm text-slate-300 outline-none focus:border-fuchsia-500/50 transition">
            <option value="ALL">전체 부서</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={nodeTypeFilter} onChange={e => setNodeTypeFilter(e.target.value)}
            className="w-full rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-sm text-slate-300 outline-none focus:border-fuchsia-500/50 transition">
            <option value="ALL">전체 타입</option>
            {nodeTypes.map(t => <option key={t} value={t}>{NODE_TYPE_META[t]?.label ?? t}</option>)}
          </select>
          {isFiltering && (
            <button onClick={() => { setSearchInput(''); setSearchQuery(''); setSearchData(null); setDepartmentFilter('ALL'); setNodeTypeFilter('ALL') }}
              className="text-sm text-slate-500 hover:text-fuchsia-400 transition text-center py-0.5">
              필터 전체 초기화
            </button>
          )}
        </div>

        {/* 타입 범례 */}
        {nodeTypes.length > 0 && (
          <div className="rounded-2xl p-4 shadow-xl" style={PANEL_STYLE}>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2.5">노드 타입</p>
            <div className="flex flex-col gap-1.5">
              {nodeTypes.map(t => {
                const color = NODE_TYPE_META[t]?.color ?? '#94a3b8'
                const label = NODE_TYPE_META[t]?.label ?? t
                const count = data.nodes.filter(n => n.node_type === t).length
                const isActive = nodeTypeFilter === t
                return (
                  <button key={t} onClick={() => setNodeTypeFilter(isActive ? 'ALL' : t)}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-left transition-colors ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}99` }} />
                    <span className="flex-1 text-slate-300">{label}</span>
                    <span className="text-slate-500 tabular-nums text-sm">{count}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </aside>

      {/* ── 우측 노드 상세 패널 ── */}
      <aside
        className={`absolute top-4 right-4 z-20 transition-all duration-300 ${selectedNode ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'}`}
        style={{ width: 450 }}
      >
        <div className="rounded-2xl p-6 flex flex-col gap-5 shadow-2xl overflow-y-auto" style={{ ...PANEL_STYLE, maxHeight: 'calc(100vh - 32px)' }}>
          {selectedNode && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <NodeTypeBadge type={selectedNode.node_type} />
                  <h2 className="mt-2.5 text-lg font-bold text-white leading-snug">{selectedNode.title}</h2>
                </div>
                <button onClick={() => setSelectedNode(null)}
                  className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition mt-0.5">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {selectedNode.department && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <svg className="w-4 h-4 text-fuchsia-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  {selectedNode.department}
                </div>
              )}

              {selectedNode.content && (
                <div>
                  <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">본문 미리보기</p>
                  <div className="text-sm text-slate-300 rounded-xl p-4 max-h-48 overflow-y-auto leading-relaxed"
                    style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {selectedNode.content}
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  연결 관계 <span className="text-cyan-400 normal-case font-bold text-sm">{selectedNodeEdges.length}</span>
                </p>
                {selectedNodeEdges.length === 0 ? (
                  <p className="text-sm text-slate-600 italic">연결된 노드가 없습니다.</p>
                ) : (
                  <ul className="flex flex-col gap-2 max-h-56 overflow-y-auto">
                    {selectedNodeEdges.map(edge => {
                      const isOut = edge.source_node_id === selectedNode.id
                      const linkedId = isOut ? edge.target_node_id : edge.source_node_id
                      const linked = baseData.nodes.find(n => n.id === linkedId)
                      return (
                        <li key={edge.id} onClick={() => linked && setSelectedNode(linked)}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer transition"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(167,139,250,0.35)')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)')}>
                          <span className={`font-bold shrink-0 text-base ${isOut ? 'text-fuchsia-400' : 'text-cyan-400'}`}>{isOut ? '→' : '←'}</span>
                          <span className="flex-1 text-slate-200 truncate">{linked?.title ?? linkedId}</span>
                          {linked && <NodeTypeBadge type={linked.node_type} />}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {selectedNode.source_drive_id && (
                <a href={`https://drive.google.com/open?id=${selectedNode.source_drive_id}`} target="_blank" rel="noreferrer"
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#db2777)' }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Drive에서 원본 보기
                </a>
              )}
            </>
          )}
        </div>
      </aside>

      <KnowledgeGraphHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
