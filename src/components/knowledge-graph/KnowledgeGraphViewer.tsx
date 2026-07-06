import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import type { GraphNode, GraphData } from '../../services/knowledge-graph/knowledge-graph-client'
import ForceGraph3D from 'react-force-graph-3d'
import SpriteText from 'three-spritetext'

interface KnowledgeGraphViewerProps {
  data: GraphData
  onNodeClick?: (node: GraphNode | null) => void
  selectedNodeId?: string | null
  matchingNodeIds?: Set<string> | null
}

const NODE_TYPE_COLORS: Record<string, string> = {
  faq:       '#f472b6',
  concept:   '#34d399',
  document:  '#60a5fa',
  wiki:      '#a78bfa',
  raw_chunk: '#22d3ee',
}
const FALLBACK = ['#f59e0b','#ef4444','#10b981','#3b82f6','#8b5cf6','#ec4899','#06b6d4']

function hashStr(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h)
}
function nodeColor(n: GraphNode) {
  return NODE_TYPE_COLORS[n.node_type] ?? FALLBACK[hashStr(n.node_type) % FALLBACK.length]!
}

export const KnowledgeGraphViewer: React.FC<KnowledgeGraphViewerProps> = ({
  data, onNodeClick, selectedNodeId, matchingNodeIds,
}) => {
  const fgRef = useRef<any>(null)
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  })

  useEffect(() => {
    const onResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const graphData = useMemo(() => ({
    nodes: data.nodes.map(n => ({
      ...n,
      color: nodeColor(n),
      val: n.node_type === 'document' ? 3 : n.node_type === 'faq' ? 2 : 1,
    })),
    links: data.edges.map(e => ({
      source: e.source_node_id,
      target: e.target_node_id,
      weight: e.weight ?? 1,
    })),
  }), [data])

  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    fg.d3Force('charge')?.strength(-80)
    fg.d3Force('link')?.distance(50)
  }, [graphData])

  // 자동 천천히 회전 — 마우스 조작 중엔 멈추고 2.5초 후 재개
  useEffect(() => {
    const fg = fgRef.current
    if (!fg || !graphData.nodes.length) return
    const controls = fg.controls()
    if (!controls) return

    controls.autoRotate = true
    controls.autoRotateSpeed = 0.3

    let resumeTimer: ReturnType<typeof setTimeout> | null = null
    const onStart = () => {
      controls.autoRotate = false
      if (resumeTimer) clearTimeout(resumeTimer)
    }
    const onEnd = () => {
      resumeTimer = setTimeout(() => {
        const c = fgRef.current?.controls()
        if (c) c.autoRotate = true
      }, 2500)
    }

    controls.addEventListener('start', onStart)
    controls.addEventListener('end', onEnd)
    return () => {
      controls.removeEventListener('start', onStart)
      controls.removeEventListener('end', onEnd)
      if (resumeTimer) clearTimeout(resumeTimer)
    }
  }, [graphData.nodes.length])

  const renderLabel = useCallback((node: any) => {
    const isSelected = selectedNodeId === node.id
    const isHovered  = hoverNodeId === node.id
    const searchActive = !!(matchingNodeIds?.size)
    const isMatch = searchActive ? matchingNodeIds!.has(node.id) : false
    const show = isSelected || isHovered || isMatch
    if (!show || !node.title) return null as any

    const sp = new SpriteText(
      node.title.length > 30 ? node.title.slice(0, 30) + '…' : node.title
    )
    sp.color = '#ffffff'
    sp.textHeight = isSelected ? 5 : 3.5
    sp.strokeWidth = 0.8
    sp.strokeColor = 'rgba(0,0,0,0.9)'
    sp.backgroundColor = 'rgba(0,0,0,0.55)'
    sp.padding = 2
    sp.borderRadius = 3
    return sp
  }, [selectedNodeId, hoverNodeId, matchingNodeIds])

  const handleNodeClick = useCallback((node: any) => {
    onNodeClick?.(node as GraphNode)
    const fg = fgRef.current
    if (!fg || node.x == null) return
    const dist = 120
    fg.cameraPosition(
      { x: node.x + dist, y: node.y + dist / 2, z: node.z + dist },
      { x: node.x, y: node.y, z: node.z },
      1000,
    )
  }, [onNodeClick])

  const handleZoom = useCallback((dir: 'in' | 'out' | 'reset') => {
    const fg = fgRef.current
    if (!fg) return
    if (dir === 'reset') {
      fg.cameraPosition({ x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: 0 }, 800)
    } else {
      const p = fg.cameraPosition()
      const s = dir === 'in' ? 0.7 : 1.4
      fg.cameraPosition({ x: p.x * s, y: p.y * s, z: p.z * s }, null, 400)
    }
  }, [])

  const getNodeSize = useCallback((node: any) => {
    if (node.id === selectedNodeId) return 8
    if (node.id === hoverNodeId)    return 6
    if (matchingNodeIds?.has(node.id)) return 5
    return 4
  }, [selectedNodeId, hoverNodeId, matchingNodeIds])

  if (data.nodes.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="text-slate-500 text-[13px] md:text-[15px]">그래프 데이터가 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="absolute inset-0">
      <ForceGraph3D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeColor={(node: any) => node.color}
        nodeVal={getNodeSize}
        nodeLabel={() => ''}
        nodeThreeObjectExtend={true}
        nodeThreeObject={renderLabel}
        onNodeClick={handleNodeClick}
        onBackgroundClick={() => onNodeClick?.(null)}
        onNodeHover={(node: any) => setHoverNodeId(node?.id ?? null)}
        onNodeDragEnd={(node: any) => { node.fx = node.x; node.fy = node.y; node.fz = node.z }}
        backgroundColor="#050813"
        showNavInfo={false}
        linkColor={(link: any) => {
          const active = selectedNodeId ?? hoverNodeId
          const src = link.source?.id ?? link.source
          const tgt = link.target?.id ?? link.target
          if (active && (src === active || tgt === active)) return '#22d3ee'
          if (matchingNodeIds?.size && (matchingNodeIds.has(src) || matchingNodeIds.has(tgt))) return '#a78bfa'
          return 'rgba(100,120,200,0.25)'
        }}
        linkWidth={(link: any) => {
          const active = selectedNodeId ?? hoverNodeId
          const src = link.source?.id ?? link.source
          const tgt = link.target?.id ?? link.target
          return active && (src === active || tgt === active) ? 2 : 0.5
        }}
        linkOpacity={0.6}
        nodeResolution={12}
      />

      {/* 줌 컨트롤 */}
      <div className="absolute bottom-8 right-6 flex flex-col gap-2 z-10">
        {([
          { dir: 'in'    as const, title: '확대', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /> },
          { dir: 'reset' as const, title: '초기화', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /> },
          { dir: 'out'   as const, title: '축소', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /> },
        ]).map(({ dir, title, icon }) => (
          <button
            key={dir}
            onClick={() => handleZoom(dir)}
            title={title}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-white/10 text-slate-300 hover:text-white hover:border-cyan-400/50 transition-all shadow-lg"
            style={{ background: 'rgba(6,10,24,0.8)', backdropFilter: 'blur(12px)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">{icon}</svg>
          </button>
        ))}
      </div>
    </div>
  )
}
