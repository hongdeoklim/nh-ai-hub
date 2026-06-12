import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  NotebookGraphData,
  NotebookGraphNode,
} from '../../types/notebook-graph'

type SimNode = NotebookGraphNode & {
  x: number
  y: number
  vx: number
  vy: number
}

type SimLink = {
  id: string
  source: SimNode
  target: SimNode
  relationType: string
  description: string
  weight: number
}

type KnowledgeGraphProps = {
  data: NotebookGraphData
  loading?: boolean
  onDocumentSelect?: (documentId: string, label: string) => void
  onEntitySelect?: (entityLabel: string, entityType?: string) => void
}

const WIDTH = 320
const HEIGHT = 280

function buildSimGraph(data: NotebookGraphData): {
  nodes: SimNode[]
  links: SimLink[]
} {
  const nodes: SimNode[] = data.nodes.map((n, i) => {
    const angle = (i / Math.max(data.nodes.length, 1)) * Math.PI * 2
    const r = 70 + (i % 3) * 18
    return {
      ...n,
      x: WIDTH / 2 + Math.cos(angle) * r,
      y: HEIGHT / 2 + Math.sin(angle) * r,
      vx: 0,
      vy: 0,
    }
  })

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const links: SimLink[] = []
  for (const l of data.links) {
    const source = byId.get(l.source)
    const target = byId.get(l.target)
    if (!source || !target) continue
    links.push({
      id: l.id,
      source,
      target,
      relationType: l.relationType,
      description: l.description,
      weight: l.weight,
    })
  }

  return { nodes, links }
}

function tickSimulation(nodes: SimNode[], links: SimLink[], alpha: number) {
  const centerX = WIDTH / 2
  const centerY = HEIGHT / 2

  for (const link of links) {
    const dx = link.target.x - link.source.x
    const dy = link.target.y - link.source.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const force = (dist - 72) * 0.04 * alpha
    const fx = (dx / dist) * force
    const fy = (dy / dist) * force
    link.source.vx += fx
    link.source.vy += fy
    link.target.vx -= fx
    link.target.vy -= fy
  }

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const repulse = (900 / (dist * dist)) * alpha
      const fx = (dx / dist) * repulse
      const fy = (dy / dist) * repulse
      a.vx -= fx
      a.vy -= fy
      b.vx += fx
      b.vy += fy
    }
  }

  for (const n of nodes) {
    n.vx += (centerX - n.x) * 0.02 * alpha
    n.vy += (centerY - n.y) * 0.02 * alpha
    n.vx *= 0.85
    n.vy *= 0.85
    n.x += n.vx
    n.y += n.vy
    n.x = Math.max(28, Math.min(WIDTH - 28, n.x))
    n.y = Math.max(28, Math.min(HEIGHT - 28, n.y))
  }
}

export function KnowledgeGraph({
  data,
  loading = false,
  onDocumentSelect,
  onEntitySelect,
}: KnowledgeGraphProps) {
  const [sim, setSim] = useState(() => buildSimGraph(data))
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const frameRef = useRef(0)
  const alphaRef = useRef(1)

  const graphKey = useMemo(
    () =>
      `${data.nodes.length}:${data.links.length}:${data.nodes.map((n) => n.id).join(',')}`,
    [data],
  )

  useEffect(() => {
    setSim(buildSimGraph(data))
    alphaRef.current = 1
  }, [graphKey, data])

  useEffect(() => {
    let running = true
    const step = () => {
      if (!running) return
      alphaRef.current = Math.max(0.02, alphaRef.current * 0.98)
      setSim((prev) => {
        const nextNodes = prev.nodes.map((n) => ({ ...n }))
        const byId = new Map(nextNodes.map((n) => [n.id, n]))
        const nextLinks = prev.links
          .map((l) => ({
            ...l,
            source: byId.get(l.source.id)!,
            target: byId.get(l.target.id)!,
          }))
          .filter((l) => l.source && l.target)
        tickSimulation(nextNodes, nextLinks, alphaRef.current)
        return { nodes: nextNodes, links: nextLinks }
      })
      frameRef.current = requestAnimationFrame(step)
    }
    frameRef.current = requestAnimationFrame(step)
    return () => {
      running = false
      cancelAnimationFrame(frameRef.current)
    }
  }, [graphKey])

  const handleNodeClick = useCallback(
    (node: SimNode) => {
      setSelectedId(node.id)
      if (node.kind === 'document' && node.documentId) {
        onDocumentSelect?.(node.documentId, node.summary ?? node.label)
      } else if (node.kind === 'entity') {
        onEntitySelect?.(node.summary ?? node.label, node.entityType)
      }
    },
    [onDocumentSelect, onEntitySelect],
  )

  const hoverNode = sim.nodes.find((n) => n.id === hoverId) ?? null

  if (loading) {
    return (
      <div className="flex h-full min-h-[12rem] items-center justify-center p-4">
        <p className="text-xs text-stone-500">지식 지도를 불러오는 중…</p>
      </div>
    )
  }

  if (data.nodes.length === 0) {
    return (
      <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 p-4 text-center">
        <p className="text-xs font-medium text-stone-600 dark:text-stone-400">
          선택된 출처가 없습니다.
        </p>
        <p className="text-xs text-stone-500">
          왼쪽에서 문서를 선택하면 연관 그래프가 표시됩니다.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-stone-200/90 bg-stone-50/80 dark:border-stone-700 dark:bg-stone-950/60">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-full w-full"
          role="img"
          aria-label="문서 지식 그래프"
        >
          <rect
            width={WIDTH}
            height={HEIGHT}
            className="fill-stone-50 dark:fill-stone-950"
          />
          {sim.links.map((link) => {
            const strokeW = 0.8 + link.weight * 2.2
            return (
              <line
                key={link.id}
                x1={link.source.x}
                y1={link.source.y}
                x2={link.target.x}
                y2={link.target.y}
                className="stroke-stone-300 dark:stroke-stone-600"
                strokeWidth={strokeW}
                strokeOpacity={0.55 + link.weight * 0.35}
              />
            )
          })}
          {sim.nodes.map((node) => {
            const isDoc = node.kind === 'document'
            const r = isDoc ? 14 : 9
            const active = selectedId === node.id || hoverId === node.id
            return (
              <g
                key={node.id}
                className="cursor-pointer"
                onMouseEnter={() => setHoverId(node.id)}
                onMouseLeave={() => setHoverId(null)}
                onClick={() => handleNodeClick(node)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleNodeClick(node)
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`${isDoc ? '문서' : '개체'} ${node.label}`}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={active ? r + 2 : r}
                  className={
                    isDoc
                      ? 'fill-orange-200 stroke-orange-700 dark:fill-orange-950/60 dark:stroke-orange-400'
                      : 'fill-stone-200 stroke-stone-500 dark:fill-stone-800 dark:stroke-stone-400'
                  }
                  strokeWidth={active ? 2 : 1.2}
                />
                <text
                  x={node.x}
                  y={node.y + r + 10}
                  textAnchor="middle"
                  className="fill-stone-700 text-[10px] font-medium dark:fill-stone-200"
                >
                  {node.label}
                </text>
              </g>
            )
          })}
        </svg>
        {hoverNode ? (
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded-lg border border-stone-200/90 bg-white/95 px-2.5 py-2 shadow-sm dark:border-stone-700 dark:bg-stone-900/95">
            <p className="text-xs font-bold text-stone-900 dark:text-stone-50">
              {hoverNode.kind === 'document' ? '📄 ' : '🔗 '}
              {hoverNode.label}
            </p>
            {hoverNode.summary && hoverNode.summary !== hoverNode.label ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-stone-600 dark:text-stone-400">
                {hoverNode.summary}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-stone-500">클릭하여 채팅에 반영</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
