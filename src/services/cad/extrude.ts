import { entityToPolyline, type EditorEntity } from './dxf'

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
