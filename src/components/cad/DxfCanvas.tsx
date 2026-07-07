import { useCallback, useEffect, useRef } from 'react'

import type { DxfBounds, EditorEntity, Point2D } from '../../services/cad/dxf'
import { entityToPolyline } from '../../services/cad/dxf'
import { hitTest, snapPoint } from '../../services/cad/snap'

/**
 * DXF 편집 캔버스 (Phase B).
 * - 렌더: 편집 엔티티 → 폴리라인. Y 뒤집기는 화면 변환에서만.
 * - 팬(중/우 드래그 또는 pan 툴), 휠 줌, 맞춤.
 * - 그리기: line/polyline/circle (끝점·그리드 스냅). select: 클릭 선택 + Delete 삭제.
 * 인라인 style은 캔버스 비트맵 크기/커서 같은 런타임 값에만 사용.
 */

export type EditorTool = 'pan' | 'select' | 'line' | 'polyline' | 'circle'

interface View {
  scale: number
  tx: number
  ty: number
}

interface SnapSettings {
  endpoint: boolean
  grid: boolean
  gridStep: number
}

interface DxfCanvasProps {
  entities: EditorEntity[]
  bounds: DxfBounds | null
  tool: EditorTool
  currentLayer: string
  snap: SnapSettings
  hiddenLayers: Set<string>
  selectedIndex: number | null
  onSelect: (index: number | null) => void
  onEntitiesChange: (next: EditorEntity[]) => void
}

const FIT_PADDING = 0.08
const SNAP_PX = 12
const HIT_PX = 8

export function DxfCanvas({
  entities,
  bounds,
  tool,
  currentLayer,
  snap,
  hiddenLayers,
  selectedIndex,
  onSelect,
  onEntitiesChange,
}: DxfCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<View>({ scale: 1, tx: 0, ty: 0 })
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const dprRef = useRef(1)

  // draw()가 항상 최신 값을 읽도록 ref 로 동기화 (frequent redraw)
  const entitiesRef = useRef(entities)
  const propsRef = useRef({ tool, currentLayer, snap, hiddenLayers, selectedIndex })
  const pendingRef = useRef<Point2D[] | null>(null) // 진행 중 그리기 정점
  const cursorRef = useRef<Point2D | null>(null) // 스냅된 커서 월드 좌표
  useEffect(() => {
    entitiesRef.current = entities
    propsRef.current = { tool, currentLayer, snap, hiddenLayers, selectedIndex }
    draw()
  })

  const worldToScreen = (wx: number, wy: number, v: View) => ({
    sx: wx * v.scale + v.tx,
    sy: -wy * v.scale + v.ty,
  })
  const screenToWorld = (sx: number, sy: number, v: View): Point2D => ({
    x: (sx - v.tx) / v.scale,
    y: (v.ty - sy) / v.scale,
  })

  const eventWorld = (e: { clientX: number; clientY: number }): Point2D | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return screenToWorld(e.clientX - rect.left, e.clientY - rect.top, viewRef.current)
  }

  const snappedWorld = (raw: Point2D): Point2D => {
    const v = viewRef.current
    return snapPoint(entitiesRef.current, raw, {
      endpoint: propsRef.current.snap.endpoint,
      grid: propsRef.current.snap.grid,
      gridStep: propsRef.current.snap.gridStep,
      maxDist: SNAP_PX / v.scale,
    }).point
  }

  const drawPolyline = (
    ctx: CanvasRenderingContext2D,
    pts: Point2D[],
    closed: boolean,
    v: View,
  ) => {
    if (pts.length < 2) return
    ctx.beginPath()
    const first = worldToScreen(pts[0].x, pts[0].y, v)
    ctx.moveTo(first.sx, first.sy)
    for (let i = 1; i < pts.length; i++) {
      const p = worldToScreen(pts[i].x, pts[i].y, v)
      ctx.lineTo(p.sx, p.sy)
    }
    if (closed) ctx.closePath()
    ctx.stroke()
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = dprRef.current
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const v = viewRef.current
    const stroke =
      getComputedStyle(document.documentElement).getPropertyValue('--text-h').trim() || '#111'
    const { hiddenLayers: hidden, selectedIndex: sel } = propsRef.current

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    entitiesRef.current.forEach((e, idx) => {
      if (hidden.has(e.layer)) return
      const pl = entityToPolyline(e)
      const selected = idx === sel
      ctx.strokeStyle = selected ? '#c2410c' : stroke
      ctx.lineWidth = selected ? 2.5 : 1
      drawPolyline(ctx, pl.points, pl.closed, v)
    })

    // 진행 중 그리기 미리보기
    const pending = pendingRef.current
    const cur = cursorRef.current
    if (pending && cur) {
      ctx.strokeStyle = '#c2410c'
      ctx.lineWidth = 1
      ctx.setLineDash([5, 4])
      const tool = propsRef.current.tool
      if (tool === 'circle' && pending.length === 1) {
        const r = Math.hypot(cur.x - pending[0].x, cur.y - pending[0].y)
        const c = worldToScreen(pending[0].x, pending[0].y, v)
        ctx.beginPath()
        ctx.arc(c.sx, c.sy, r * v.scale, 0, Math.PI * 2)
        ctx.stroke()
      } else {
        drawPolyline(ctx, [...pending, cur], false, v)
      }
      ctx.setLineDash([])
    }

    // 스냅 마커
    if (cur && propsRef.current.tool !== 'pan') {
      const s = worldToScreen(cur.x, cur.y, v)
      ctx.strokeStyle = '#ea580c'
      ctx.lineWidth = 1.5
      ctx.strokeRect(s.sx - 4, s.sy - 4, 8, 8)
    }
    ctx.restore()
  }, [])

  const resize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return { cssW: 0, cssH: 0 }
    const dpr = window.devicePixelRatio || 1
    dprRef.current = dpr
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(rect.width * dpr))
    canvas.height = Math.max(1, Math.round(rect.height * dpr))
    return { cssW: rect.width, cssH: rect.height }
  }, [])

  const fit = useCallback(() => {
    const { cssW, cssH } = resize()
    if (!bounds || cssW === 0 || cssH === 0) {
      draw()
      return
    }
    const bw = Math.max(bounds.maxX - bounds.minX, 1e-6)
    const bh = Math.max(bounds.maxY - bounds.minY, 1e-6)
    const pad = 1 - FIT_PADDING * 2
    const scale = Math.min((cssW * pad) / bw, (cssH * pad) / bh)
    const cx = (bounds.minX + bounds.maxX) / 2
    const cy = (bounds.minY + bounds.maxY) / 2
    viewRef.current = { scale, tx: cssW / 2 - cx * scale, ty: cssH / 2 + cy * scale }
    draw()
  }, [bounds, resize, draw])

  useEffect(() => {
    fit()
  }, [fit])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => fit())
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [fit])

  // 툴 변경 시 진행 중 그리기 취소
  useEffect(() => {
    pendingRef.current = null
    draw()
  }, [tool, draw])

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const v = viewRef.current
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const newScale = v.scale * factor
      const wx = (cx - v.tx) / v.scale
      const wy = (v.ty - cy) / v.scale
      viewRef.current = { scale: newScale, tx: cx - wx * newScale, ty: cy + wy * newScale }
      draw()
    },
    [draw],
  )

  const isPanGesture = (e: React.PointerEvent) =>
    propsRef.current.tool === 'pan' || e.button === 1 || e.button === 2

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      canvasRef.current?.focus()
      if (isPanGesture(e)) {
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        dragRef.current = { x: e.clientX, y: e.clientY }
        return
      }
      if (e.button !== 0) return
      const raw = eventWorld(e)
      if (!raw) return
      const p = snappedWorld(raw)
      const tool = propsRef.current.tool
      const layer = propsRef.current.currentLayer

      if (tool === 'select') {
        const v = viewRef.current
        const idx = hitTest(entitiesRef.current, raw, HIT_PX / v.scale)
        onSelect(idx >= 0 ? idx : null)
        return
      }
      if (tool === 'line') {
        if (!pendingRef.current) {
          pendingRef.current = [p]
        } else {
          const a = pendingRef.current[0]
          pendingRef.current = null
          onEntitiesChange([...entitiesRef.current, { kind: 'line', a, b: p, layer }])
        }
      } else if (tool === 'circle') {
        if (!pendingRef.current) {
          pendingRef.current = [p]
        } else {
          const c = pendingRef.current[0]
          const radius = Math.hypot(p.x - c.x, p.y - c.y)
          pendingRef.current = null
          if (radius > 0) {
            onEntitiesChange([...entitiesRef.current, { kind: 'circle', center: c, radius, layer }])
          }
        }
      } else if (tool === 'polyline') {
        pendingRef.current = [...(pendingRef.current ?? []), p]
      }
      draw()
    },
    [draw, onEntitiesChange, onSelect],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const start = dragRef.current
      if (start) {
        const dx = e.clientX - start.x
        const dy = e.clientY - start.y
        dragRef.current = { x: e.clientX, y: e.clientY }
        const v = viewRef.current
        viewRef.current = { ...v, tx: v.tx + dx, ty: v.ty + dy }
        draw()
        return
      }
      if (propsRef.current.tool === 'pan') return
      const raw = eventWorld(e)
      if (raw) {
        cursorRef.current = snappedWorld(raw)
        draw()
      }
    },
    [draw],
  )

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    dragRef.current = null
  }, [])

  const finishPolyline = () => {
    const pending = pendingRef.current
    if (pending && pending.length >= 2 && propsRef.current.tool === 'polyline') {
      pendingRef.current = null
      onEntitiesChange([
        ...entitiesRef.current,
        { kind: 'polyline', points: pending, closed: false, layer: propsRef.current.currentLayer },
      ])
    } else {
      pendingRef.current = null
      draw()
    }
  }

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (e.key === 'Escape') {
        pendingRef.current = null
        onSelect(null)
        draw()
      } else if (e.key === 'Enter') {
        finishPolyline()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = propsRef.current.selectedIndex
        if (sel != null && sel >= 0) {
          onSelect(null)
          onEntitiesChange(entitiesRef.current.filter((_, i) => i !== sel))
        }
      }
    },
    // finishPolyline/draw read refs; onSelect/onEntitiesChange stable-ish
    [draw, onEntitiesChange, onSelect],
  )

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={finishPolyline}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        className="h-full w-full touch-none rounded-xl bg-white outline-none dark:bg-stone-950"
      />
      <div className="pointer-events-none absolute bottom-2 right-2 flex gap-1.5">
        <button
          type="button"
          onClick={fit}
          className="pointer-events-auto rounded-lg border border-stone-200 bg-white/90 px-2.5 py-1 text-[12px]! font-medium text-stone-700 shadow-sm backdrop-blur transition-colors hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900/90 dark:text-stone-300 dark:hover:bg-stone-800 md:text-[13px]!"
        >
          맞춤
        </button>
      </div>
    </div>
  )
}

export default DxfCanvas
