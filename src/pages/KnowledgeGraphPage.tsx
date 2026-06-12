import { useEffect, useState, useMemo } from 'react'
import {
  fetchKnowledgeGraphData,
  type GraphData,
  type GraphNode,
} from '../services/knowledge-graph/knowledge-graph-client'
import { KnowledgeGraphViewer } from '../components/knowledge-graph/KnowledgeGraphViewer'
import { KnowledgeGraphHelpDialog } from '../components/knowledge-graph/KnowledgeGraphHelpDialog'

export function KnowledgeGraphPage() {
  const [data, setData] = useState<GraphData>({ nodes: [], edges: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('ALL')

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const res = await fetchKnowledgeGraphData(300)
        setData(res)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const departments = useMemo(() => {
    const deps = new Set<string>()
    data.nodes.forEach(n => {
      if (n.department) deps.add(n.department)
    })
    return Array.from(deps).sort()
  }, [data])

  const filteredData = useMemo(() => {
    let nodes = data.nodes
    if (departmentFilter !== 'ALL') {
      nodes = nodes.filter(n => n.department === departmentFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      nodes = nodes.filter(n => 
        n.title.toLowerCase().includes(q) || 
        (n.content && n.content.toLowerCase().includes(q))
      )
    }
    
    const nodeIds = new Set(nodes.map(n => n.id))
    const edges = data.edges.filter(e => nodeIds.has(e.source_node_id) && nodeIds.has(e.target_node_id))
    
    return { nodes, edges }
  }, [data, departmentFilter, searchQuery])

  // Get connected edges for selected node
  const selectedNodeEdges = useMemo(() => {
    if (!selectedNode) return []
    return data.edges.filter(
      e => e.source_node_id === selectedNode.id || e.target_node_id === selectedNode.id
    )
  }, [selectedNode, data.edges])

  return (
    <div className="flex flex-col h-full bg-[#05070c] p-4 gap-4 text-slate-100 select-none">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="text-pink-500 animate-pulse">🌌</span> 사내 지식 그래프
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            문서 간의 백링크 관계와 인접 컨텍스트를 옵시디언 스타일의 물리학 시공간에서 탐색합니다.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            placeholder="노드 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-lg border border-slate-800 bg-[#0c101b] px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition duration-200"
          />
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-[#0c101b] px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-pink-500 transition duration-200"
          >
            <option value="ALL">전체 부서</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
 
          {/* 도움말 버튼 */}
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            title="Knowledge Graph 사용 방법"
            aria-label="Knowledge Graph 도움말"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-800 bg-[#0c101b] text-slate-400 shadow-sm transition hover:border-pink-400 hover:bg-[#151c2f] hover:text-pink-400"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      </header>
 
      <main className="flex flex-1 min-h-0 gap-4 overflow-hidden">
        {/* Graph Viewer Section */}
        <div className="flex-1 relative rounded-xl shadow-2xl border border-slate-900 overflow-hidden bg-[#05070a]">
          {error ? (
            <div className="flex items-center justify-center h-full text-red-400 p-6 text-center bg-[#05070a]">
              데이터를 불러오지 못했습니다: {error}
            </div>
          ) : (
            <>
              <KnowledgeGraphViewer 
                data={filteredData}
                onNodeClick={setSelectedNode}
                selectedNodeId={selectedNode?.id}
              />
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10 transition-opacity duration-300">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-pink-500/20 border-t-pink-500 rounded-full animate-spin"></div>
                    <p className="text-sm font-medium text-slate-300 font-sans">지식 그래프를 시각화하는 중...</p>
                  </div>
                </div>
              )}
            </>
          )}
          
          {/* Node Count Overlay */}
          <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md border border-white/5 rounded-full px-3.5 py-1 text-xs font-semibold text-slate-300 shadow-lg">
            🌌 노드: {filteredData.nodes.length} / 엣지: {filteredData.edges.length}
          </div>
        </div>
 
        {/* Detail Panel */}
        <div className={`w-80 shrink-0 bg-[#0c101b]/80 backdrop-blur-xl border border-slate-800/80 rounded-xl p-5 shadow-2xl transition-all duration-300 flex flex-col gap-4 overflow-y-auto ${selectedNode ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0 pointer-events-none hidden md:flex'}`}>
          {selectedNode ? (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-pink-900/40 text-pink-300 border border-pink-500/10 mb-2">
                    {selectedNode.node_type}
                  </span>
                  <h2 className="text-lg font-bold text-white leading-tight">
                    {selectedNode.title}
                  </h2>
                </div>
                <button 
                  onClick={() => setSelectedNode(null)}
                  className="text-slate-400 hover:text-white transition duration-150"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
 
              {selectedNode.department && (
                <p className="text-sm text-slate-300 flex items-center gap-1.5 bg-[#141b2c] border border-slate-800 px-2.5 py-1 rounded-md">
                  <svg className="w-4 h-4 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                  {selectedNode.department}
                </p>
              )}
 
              <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                <h3 className="text-sm font-semibold text-slate-200 mb-2 mt-4 flex items-center gap-1">
                  <span>📄</span> 본문 미리보기
                </h3>
                <div className="text-xs text-slate-300 bg-[#05070a] p-3 rounded-lg border border-slate-800 max-h-48 overflow-y-auto leading-relaxed">
                  {selectedNode.content ? selectedNode.content : '본문 내용이 없습니다.'}
                </div>
 
                <h3 className="text-sm font-semibold text-slate-200 mb-2 mt-6 flex items-center gap-1">
                  <span>🔗</span> 연결 관계망 ({selectedNodeEdges.length})
                </h3>
                <ul className="space-y-2">
                  {selectedNodeEdges.map(edge => {
                    const isSource = edge.source_node_id === selectedNode.id
                    const linkedNodeId = isSource ? edge.target_node_id : edge.source_node_id
                    const linkedNode = data.nodes.find(n => n.id === linkedNodeId)
                    return (
                      <li key={edge.id} className="text-xs p-2.5 rounded-md bg-[#080d16] border border-slate-800 flex items-start gap-2 hover:border-pink-500/30 transition duration-150">
                        <span className={`shrink-0 font-semibold ${isSource ? 'text-pink-400' : 'text-cyan-400'}`}>
                          {isSource ? '→ 아웃링크' : '← 백링크'}
                        </span>
                        <span className="truncate flex-1 text-slate-300 cursor-pointer hover:text-white hover:underline font-medium" onClick={() => linkedNode && setSelectedNode(linkedNode)}>
                          {linkedNode?.title || linkedNodeId}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
              
              {selectedNode.source_drive_id && (
                <div className="pt-3 border-t border-slate-800">
                  <a href={`https://drive.google.com/open?id=${selectedNode.source_drive_id}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 w-full py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-sm font-semibold transition-all duration-200 shadow-md shadow-pink-600/10">
                    Google Drive에서 보기
                  </a>
                </div>
              )}
            </>
          ) : null}
        </div>
      </main>
 
      {/* 도움말 다이얼로그 */}
      <KnowledgeGraphHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
