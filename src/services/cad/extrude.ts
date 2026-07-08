import { entityToPolyline, type EditorEntity, type Point2D } from './dxf'

/**
 * 2D 편집 엔티티를 3D 벽으로 압출(extrude)하는 순수 기하 함수.
 * 좌표 매핑: DXF(x,y) → three(x, 높이Y, y). 즉 도면은 XZ 평면에 눕고 높이는 Y축.
 * 세 로직은 three 와 무관하게 단위 테스트 가능하다.
 */

export interface Segment {
  ax: number
  ay: number
  bx: number
  by: number
  layer: string
}

/** 각 엔티티를 선분 목록으로 분해(원/닫힘 폴리라인은 둘레 선분 포함). */
export function entitySegments(entities: EditorEntity[]): Segment[] {
  const segs: Segment[] = []
  for (const e of entities) {
    const pl = entityToPolyline(e)
    const pts = pl.points
    for (let i = 0; i < pts.length - 1; i++) {
      segs.push({ ax: pts[i].x, ay: pts[i].y, bx: pts[i + 1].x, by: pts[i + 1].y, layer: e.layer })
    }
    if (pl.closed && pts.length > 2) {
      const a = pts[pts.length - 1]
      const b = pts[0]
      segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, layer: e.layer })
    }
  }
  return segs
}

/**
 * 선분들을 높이 h 의 벽(각 선분당 2 삼각형)으로 세운 정점 배열을 만든다.
 * 반환: [x,y,z, x,y,z, ...] (three BufferAttribute 용). 선분당 6정점 = 18수.
 */
export function buildWallPositions(segments: Segment[], height: number): number[] {
  const out: number[] = []
  const h = height > 0 ? height : 1
  for (const s of segments) {
    // three 좌표: (dxf.x, 높이, dxf.y)
    const baseA = [s.ax, 0, s.ay]
    const baseB = [s.bx, 0, s.by]
    const topA = [s.ax, h, s.ay]
    const topB = [s.bx, h, s.by]
    // 삼각형 1: baseA, baseB, topB
    out.push(...baseA, ...baseB, ...topB)
    // 삼각형 2: baseA, topB, topA
    out.push(...baseA, ...topB, ...topA)
  }
  return out
}

export interface Bounds3D {
  cx: number
  cz: number
  size: number
}

/** XZ 평면 중심과 대각 크기(카메라 맞춤용). */
export function planBounds(segments: Segment[]): Bounds3D | null {
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const s of segments) {
    minX = Math.min(minX, s.ax, s.bx)
    maxX = Math.max(maxX, s.ax, s.bx)
    minZ = Math.min(minZ, s.ay, s.by)
    maxZ = Math.max(maxZ, s.ay, s.by)
  }
  if (!Number.isFinite(minX)) return null
  return {
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    size: Math.max(maxX - minX, maxZ - minZ, 1),
  }
}

// ---------------------------------------------------------------------------
// 바닥/천장 채우기 — 단순 폴리곤 ear-clipping 삼각분할 (순수, 테스트 가능).
// ---------------------------------------------------------------------------

function signedArea(pts: Point2D[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

function pointInTri(p: Point2D, a: Point2D, b: Point2D, c: Point2D): boolean {
  const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y)
  const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y)
  const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}

/** 단순 폴리곤을 삼각형 인덱스 [i,j,k][] 로 분해. 실패 시 가능한 만큼만 반환. */
export function triangulatePolygon(input: Point2D[]): Array<[number, number, number]> {
  const pts = input.slice()
  // 마지막이 첫 점과 같으면(닫힘 중복) 제거
  if (pts.length > 1) {
    const f = pts[0]
    const l = pts[pts.length - 1]
    if (Math.abs(f.x - l.x) < 1e-9 && Math.abs(f.y - l.y) < 1e-9) pts.pop()
  }
  const n = pts.length
  if (n < 3) return []

  // 인덱스 링 (CCW 로 정규화)
  const idx = pts.map((_, i) => i)
  if (signedArea(pts) < 0) idx.reverse()

  const tris: Array<[number, number, number]> = []
  let guard = idx.length * idx.length + 10
  let i = 0
  while (idx.length > 3 && guard-- > 0) {
    const len = idx.length
    const ia = idx[(i + len - 1) % len]
    const ib = idx[i % len]
    const ic = idx[(i + 1) % len]
    const a = pts[ia]
    const b = pts[ib]
    const c = pts[ic]
    // 볼록 정점(귀)인지: 외적 > 0 (CCW)
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    let isEar = cross > 0
    if (isEar) {
      for (let k = 0; k < len; k++) {
        const p = idx[k]
        if (p === ia || p === ib || p === ic) continue
        if (pointInTri(pts[p], a, b, c)) {
          isEar = false
          break
        }
      }
    }
    if (isEar) {
      tris.push([ia, ib, ic])
      idx.splice(i % len, 1)
      i = 0
    } else {
      i++
    }
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]])
  return tris
}

/** 닫힌 엔티티(닫힌 폴리라인/원)의 바닥(Y=0)·천장(Y=h) 삼각형 정점 배열. */
export function buildCapPositions(
  entities: EditorEntity[],
  height: number,
  opts: { floor: boolean; ceiling: boolean } = { floor: true, ceiling: true },
): number[] {
  const out: number[] = []
  const h = height > 0 ? height : 1
  for (const e of entities) {
    const pl = entityToPolyline(e)
    if (!pl.closed || pl.points.length < 3) continue
    const tris = triangulatePolygon(pl.points)
    for (const [i, j, k] of tris) {
      const p = pl.points
      if (opts.floor) {
        out.push(p[i].x, 0, p[i].y, p[j].x, 0, p[j].y, p[k].x, 0, p[k].y)
      }
      if (opts.ceiling) {
        out.push(p[i].x, h, p[i].y, p[k].x, h, p[k].y, p[j].x, h, p[j].y)
      }
    }
  }
  return out
}
