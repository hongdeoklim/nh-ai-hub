import type { EditorEntity, Point2D } from './dxf'

/**
 * 스냅 기하 — 순수 함수. 화면(캔버스)과 무관하게 월드 좌표에서 동작하므로
 * 좌표 변환 함정 없이 단위 테스트가 가능하다.
 */

export type SnapKind = 'endpoint' | 'grid' | 'free'
export interface SnapResult {
  point: Point2D
  kind: SnapKind
}

export function snapToGrid(p: Point2D, step: number): Point2D {
  if (!(step > 0)) return p
  return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step }
}

/** 스냅 대상 정점: 선/폴리라인 끝점 + 원 중심. */
export function entityVertices(e: EditorEntity): Point2D[] {
  switch (e.kind) {
    case 'line':
      return [e.a, e.b]
    case 'polyline':
      return e.points
    case 'circle':
      return [e.center]
  }
}

export function nearestVertex(
  entities: EditorEntity[],
  p: Point2D,
  maxDist: number,
): Point2D | null {
  let best: Point2D | null = null
  let bestD2 = maxDist * maxDist
  for (const e of entities) {
    for (const v of entityVertices(e)) {
      const dx = v.x - p.x
      const dy = v.y - p.y
      const d2 = dx * dx + dy * dy
      if (d2 <= bestD2) {
        bestD2 = d2
        best = v
      }
    }
  }
  return best
}

/** 끝점 스냅 우선, 그다음 그리드 스냅. maxDist 는 월드 단위(픽셀임계/scale). */
export function snapPoint(
  entities: EditorEntity[],
  p: Point2D,
  opts: { endpoint: boolean; grid: boolean; gridStep: number; maxDist: number },
): SnapResult {
  if (opts.endpoint) {
    const v = nearestVertex(entities, p, opts.maxDist)
    if (v) return { point: v, kind: 'endpoint' }
  }
  if (opts.grid && opts.gridStep > 0) {
    return { point: snapToGrid(p, opts.gridStep), kind: 'grid' }
  }
  return { point: p, kind: 'free' }
}

/** 점이 엔티티 근처(maxDist 내)인지 — 선택용 히트테스트. */
export function hitTest(
  entities: EditorEntity[],
  p: Point2D,
  maxDist: number,
): number {
  let bestIdx = -1
  let bestD = maxDist
  entities.forEach((e, idx) => {
    const d = distanceToEntity(e, p)
    if (d <= bestD) {
      bestD = d
      bestIdx = idx
    }
  })
  return bestIdx
}

function distanceToEntity(e: EditorEntity, p: Point2D): number {
  switch (e.kind) {
    case 'line':
      return distToSegment(p, e.a, e.b)
    case 'polyline': {
      let min = Infinity
      for (let i = 0; i < e.points.length - 1; i++) {
        min = Math.min(min, distToSegment(p, e.points[i], e.points[i + 1]))
      }
      if (e.closed && e.points.length > 2) {
        min = Math.min(min, distToSegment(p, e.points[e.points.length - 1], e.points[0]))
      }
      return min
    }
    case 'circle': {
      const d = Math.hypot(p.x - e.center.x, p.y - e.center.y)
      return Math.abs(d - e.radius)
    }
  }
}

function distToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}
