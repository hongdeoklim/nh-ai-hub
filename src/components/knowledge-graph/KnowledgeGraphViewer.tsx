import React, { useEffect, useRef, useState } from 'react'
import type { GraphNode, GraphData } from '../../services/knowledge-graph/knowledge-graph-client'

interface SimulationNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  mass: number
  color: string
}

interface SimulationEdge {
  source: SimulationNode
  target: SimulationNode
  weight: number
}

interface KnowledgeGraphViewerProps {
  data: GraphData
  onNodeClick?: (node: GraphNode) => void
  selectedNodeId?: string | null
}

const COLORS = {
  document: '#ec4899', // 옵시디언 네온 핑크
  raw_chunk: '#06b6d4', // 옵시디언 네온 사이언
  wiki: '#a855f7', // 신비로운 퍼플
  default: '#3b82f6', // 세련된 블루
}

export const KnowledgeGraphViewer: React.FC<KnowledgeGraphViewerProps> = ({
  data,
  onNodeClick,
  selectedNodeId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Simulation state refs
  const nodesRef = useRef<SimulationNode[]>([])
  const edgesRef = useRef<SimulationEdge[]>([])
  const animationRef = useRef<number | undefined>(undefined)
  
  // Interaction state
  const isDragging = useRef(false)
  const draggedNode = useRef<SimulationNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<SimulationNode | null>(null)
  
  // Viewport transforms
  const transform = useRef({ x: 0, y: 0, k: 1 })
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0 })

  // Initialize nodes and edges
  useEffect(() => {
    if (!containerRef.current) return
    const width = containerRef.current.clientWidth
    const height = containerRef.current.clientHeight

    const nodeMap = new Map<string, SimulationNode>()

    nodesRef.current = data.nodes.map((n) => {
      // Find existing state to preserve positions across updates
      const existing = nodesRef.current.find((en) => en.id === n.id)
      
      let baseRadius = 8
      if (n.node_type === 'document') baseRadius = 12
      else if (n.node_type === 'raw_chunk') baseRadius = 6

      const simNode: SimulationNode = {
        ...n,
        x: existing?.x ?? width / 2 + (Math.random() - 0.5) * 100,
        y: existing?.y ?? height / 2 + (Math.random() - 0.5) * 100,
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
        radius: baseRadius,
        mass: baseRadius * 0.5,
        color: COLORS[n.node_type as keyof typeof COLORS] || COLORS.default,
      }
      nodeMap.set(n.id, simNode)
      return simNode
    })

    edgesRef.current = data.edges
      .map((e) => {
        const source = nodeMap.get(e.source_node_id)
        const target = nodeMap.get(e.target_node_id)
        if (!source || !target) return null
        return { source, target, weight: e.weight ?? 1 }
      })
      .filter(Boolean) as SimulationEdge[]

  }, [data])

  // Resize observer
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const { clientWidth, clientHeight } = containerRef.current
        canvasRef.current.width = clientWidth * window.devicePixelRatio
        canvasRef.current.height = clientHeight * window.devicePixelRatio
        const ctx = canvasRef.current.getContext('2d')
        if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Physics Simulation Loop
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let isActive = true

    const tick = () => {
      if (!isActive) return
      
      const width = containerRef.current?.clientWidth || 800
      const height = containerRef.current?.clientHeight || 600
      
      const nodes = nodesRef.current
      const edges = edgesRef.current

      // Physics constants
      const K = 0.04 // Spring constant (부드러운 스프링 효과)
      const R = 1500  // Repulsion constant (더 강력하고 우아하게 밀어냄)
      const DAMPING = 0.92 // Friction (옵시디언 특유의 스르륵 정주하는 쫀득한 관성)
      const CENTER_GRAVITY = 0.008 // 과도하게 수축하지 않고 넓고 쾌적하게 퍼지도록 조정

      // 1. Calculate Repulsion (Coulomb)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const n1 = nodes[i]
          const n2 = nodes[j]
          const dx = n1.x - n2.x
          const dy = n1.y - n2.y
          const distSq = dx * dx + dy * dy
          if (distSq === 0) continue
          
          const force = R / distSq
          const fx = (dx / Math.sqrt(distSq)) * force
          const fy = (dy / Math.sqrt(distSq)) * force
          
          n1.vx += fx / n1.mass
          n1.vy += fy / n1.mass
          n2.vx -= fx / n2.mass
          n2.vy -= fy / n2.mass
        }
      }

      // 2. Calculate Attraction (Hooke)
      edges.forEach((edge) => {
        const dx = edge.target.x - edge.source.x
        const dy = edge.target.y - edge.source.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const optimalDist = 85
        
        const force = (dist - optimalDist) * K * edge.weight
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force

        edge.source.vx += fx / edge.source.mass
        edge.source.vy += fy / edge.source.mass
        edge.target.vx -= fx / edge.target.mass
        edge.target.vy -= fy / edge.target.mass
      })

      // 3. Apply Center Gravity and Update Positions
      nodes.forEach((n) => {
        // Center gravity
        n.vx += (width / 2 - n.x) * CENTER_GRAVITY
        n.vy += (height / 2 - n.y) * CENTER_GRAVITY

        if (n !== draggedNode.current) {
          n.vx *= DAMPING
          n.vy *= DAMPING
          n.x += n.vx
          n.y += n.vy
        } else {
          n.vx = 0
          n.vy = 0
        }
      })

      // 4. Render Phase
      ctx.clearRect(0, 0, width, height)
      
      const t = transform.current

      // 4a. Draw Dot Grid in background (Obsidian style - synchronized with zoom and pan!)
      ctx.save()
      ctx.fillStyle = 'rgba(148, 163, 184, 0.08)' // 매우 희미한 차콜/블루 도트
      
      const gridSpacing = 40
      const startX = Math.floor((-t.x) / t.k / gridSpacing) * gridSpacing - gridSpacing
      const endX = startX + (width / t.k) + gridSpacing * 2
      const startY = Math.floor((-t.y) / t.k / gridSpacing) * gridSpacing - gridSpacing
      const endY = startY + (height / t.k) + gridSpacing * 2

      ctx.translate(t.x, t.y)
      ctx.scale(t.k, t.k)

      for (let gx = startX; gx < endX; gx += gridSpacing) {
        for (let gy = startY; gy < endY; gy += gridSpacing) {
          ctx.beginPath()
          ctx.arc(gx, gy, 1, 0, 2 * Math.PI)
          ctx.fill()
        }
      }
      ctx.restore()

      // 4b. Draw Graph Elements
      ctx.save()
      ctx.translate(t.x, t.y)
      ctx.scale(t.k, t.k)

      // Draw Edges
      edges.forEach((edge) => {
        const isSelected = selectedNodeId === edge.source.id || selectedNodeId === edge.target.id
        const isHovered = hoveredNode?.id === edge.source.id || hoveredNode?.id === edge.target.id
        const isDimmed = (selectedNodeId || hoveredNode) && !isSelected && !isHovered

        ctx.beginPath()
        ctx.moveTo(edge.source.x, edge.source.y)
        ctx.lineTo(edge.target.x, edge.target.y)
        
        // Edge styling
        ctx.lineWidth = isHovered || isSelected ? 1.5 : 0.6
        ctx.strokeStyle = isDimmed 
          ? 'rgba(30, 41, 59, 0.04)' 
          : isHovered || isSelected
            ? 'rgba(236, 72, 153, 0.8)' // 네온 핑크 하이라이트
            : `rgba(148, 163, 184, ${0.08 + edge.weight * 0.12})` // 평소에는 아주 얇고 투명한 거미줄
        
        ctx.stroke()
      })

      // Draw Nodes
      nodes.forEach((n) => {
        const isSelected = selectedNodeId === n.id
        const isHovered = hoveredNode?.id === n.id
        
        // Check connectivity for dimming
        const isConnectedToHover = hoveredNode && edges.some(e => 
          (e.source.id === n.id && e.target.id === hoveredNode.id) ||
          (e.target.id === n.id && e.source.id === hoveredNode.id)
        )
        const isConnectedToSelected = selectedNodeId && edges.some(e => 
          (e.source.id === n.id && e.target.id === selectedNodeId) ||
          (e.target.id === n.id && e.source.id === selectedNodeId)
        )
        
        const isDimmed = (selectedNodeId || hoveredNode) && 
                        !isSelected && !isHovered && 
                        !isConnectedToHover && !isConnectedToSelected

        const activeScale = (isSelected || isHovered) ? 1.35 : 1
        
        // Node shadow/glow
        ctx.shadowBlur = isSelected ? 22 : isHovered ? 16 : 4
        ctx.shadowColor = n.color

        ctx.beginPath()
        ctx.arc(n.x, n.y, n.radius * activeScale, 0, 2 * Math.PI)
        ctx.fillStyle = isDimmed ? 'rgba(71, 85, 105, 0.25)' : n.color
        ctx.fill()
        
        ctx.shadowBlur = 0 // reset

        // Selected outline ring for Obsidian
        if (isSelected) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.8
          ctx.stroke()
        }

        // Draw node title if hovered, selected or document type (important node)
        if (isSelected || isHovered || n.node_type === 'document') {
          ctx.font = `${(isSelected || isHovered) ? 'bold 11px' : '9px'} Inter, sans-serif`
          ctx.fillStyle = isDimmed 
            ? 'rgba(100, 116, 139, 0.2)' 
            : (isSelected || isHovered) ? '#ffffff' : 'rgba(241, 245, 249, 0.7)'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          // Draw text shadow for better readability
          ctx.shadowColor = 'rgba(0,0,0,0.9)'
          ctx.shadowBlur = 4
          ctx.fillText(n.title.length > 18 ? n.title.substring(0, 18) + '...' : n.title, n.x, n.y + n.radius * activeScale + 6)
          ctx.shadowBlur = 0
        }
      })

      ctx.restore()

      animationRef.current = requestAnimationFrame(tick)
    }

    tick()

    return () => {
      isActive = false
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [selectedNodeId, hoveredNode])

  // Event Handlers for Canvas (Drag, Pan, Zoom)
  const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const t = transform.current
    return {
      x: (e.clientX - rect.left - t.x) / t.k,
      y: (e.clientY - rect.top - t.y) / t.k,
      rawX: e.clientX,
      rawY: e.clientY
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y, rawX, rawY } = getPointerPos(e)
    
    // Find node under pointer
    let clickedNode = null
    for (const n of nodesRef.current) {
      const dx = n.x - x
      const dy = n.y - y
      if (dx * dx + dy * dy < n.radius * n.radius * 2) { // Hit box multiplier
        clickedNode = n
        break
      }
    }

    if (clickedNode) {
      isDragging.current = true
      draggedNode.current = clickedNode
      if (onNodeClick) onNodeClick(clickedNode)
      canvasRef.current?.setPointerCapture(e.pointerId)
    } else {
      isPanning.current = true
      panStart.current = { x: rawX - transform.current.x, y: rawY - transform.current.y }
      canvasRef.current?.setPointerCapture(e.pointerId)
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y, rawX, rawY } = getPointerPos(e)

    if (isDragging.current && draggedNode.current) {
      draggedNode.current.x = x
      draggedNode.current.y = y
      return
    }

    if (isPanning.current) {
      transform.current.x = rawX - panStart.current.x
      transform.current.y = rawY - panStart.current.y
      return
    }

    // Hover effect
    let hover = null
    for (const n of nodesRef.current) {
      const dx = n.x - x
      const dy = n.y - y
      if (dx * dx + dy * dy < n.radius * n.radius * 2) {
        hover = n
        break
      }
    }
    
    if (hover?.id !== hoveredNode?.id) {
      setHoveredNode(hover)
      if (containerRef.current) {
        containerRef.current.style.cursor = hover ? 'pointer' : 'default'
      }
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDragging.current = false
    draggedNode.current = null
    isPanning.current = false
    canvasRef.current?.releasePointerCapture(e.pointerId)
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const scaleAdjust = e.deltaY > 0 ? 0.9 : 1.1
    const t = transform.current
    
    const rect = canvasRef.current!.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Zoom towards mouse pointer
    t.x = mouseX - (mouseX - t.x) * scaleAdjust
    t.y = mouseY - (mouseY - t.y) * scaleAdjust
    t.k = Math.max(0.1, Math.min(5, t.k * scaleAdjust))
  }

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-[#05070a] rounded-xl shadow-inner shadow-black/80 ring-1 ring-white/5">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_rgba(15,23,42,0)_0%,_rgba(3,7,18,0.92)_100%)]" />
      <canvas
        ref={canvasRef}
        className="block w-full h-full touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      />
      {data.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 font-medium">
          로딩 중이거나 그래프 데이터가 없습니다.
        </div>
      )}
    </div>
  )
}
