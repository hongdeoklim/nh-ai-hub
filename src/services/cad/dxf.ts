import DxfParser from 'dxf-parser'

/**
 * DXF 파싱 → 렌더러가 다루기 쉬운 "폴리라인 목록"으로 정규화.
 *
 * Phase A(읽기 전용 뷰어)의 핵심 아이디어:
 * 원(CIRCLE)·호(ARC)를 여기서 선분으로 샘플링해두면, 캔버스 렌더러는
 * 오직 "점 배열(polyline) 목록"만 그리면 되므로 Y축 뒤집기/각도 방향 같은
 * 좌표계 함정을 렌더러에서 완전히 제거할 수 있다.
 *
 * DWG는 브라우저에서 직접 파싱 불가(비공개 바이너리). DWG는 로컬 에이전트가
 * DXF로 변환한 뒤 이 함수로 넘어온다. (AUTOCAD_AGENT_SPEC.md의 변환 브릿지)
 */

export interface Point2D {
  x: number
  y: number
}

/** 렌더러가 그리는 최소 단위: 한 줄로 이어지는 점들. */
export interface DxfPolyline {
  points: Point2D[]
  /** 끝점과 시작점을 이어 닫힌 도형으로 그릴지 */
  closed: boolean
  layer: string
}

export interface DxfBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface ParsedDxf {
  polylines: DxfPolyline[]
  bounds: DxfBounds | null
  /** 파싱은 됐지만 아직 렌더링을 지원하지 않는 엔티티 타입별 개수 */
  unsupported: Record<string, number>
}

/** 원/호를 몇 개의 선분으로 근사할지 (분해능). */
const ARC_SEGMENTS = 64

function arcToPoints(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): Point2D[] {
  // dxf-parser는 ARC의 각도를 라디안으로 준다. endAngle이 startAngle보다
  // 작으면 한 바퀴 돌아온 것으로 보고 2π를 더한다.
  let sweep = endAngle - startAngle
  while (sweep <= 0) sweep += Math.PI * 2
  const steps = Math.max(2, Math.ceil((sweep / (Math.PI * 2)) * ARC_SEGMENTS))
  const pts: Point2D[] = []
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + (sweep * i) / steps
    pts.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) })
  }
  return pts
}

function circleToPoints(cx: number, cy: number, radius: number): Point2D[] {
  const pts: Point2D[] = []
  for (let i = 0; i < ARC_SEGMENTS; i++) {
    const a = (Math.PI * 2 * i) / ARC_SEGMENTS
    pts.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) })
  }
  return pts
}

interface RawEntity {
  type?: string
  layer?: string
  vertices?: Array<{ x?: number; y?: number }>
  center?: { x?: number; y?: number }
  radius?: number
  startAngle?: number
  endAngle?: number
  // LWPOLYLINE 닫힘 플래그(파서에 따라 shape/closed 둘 다 존재)
  shape?: boolean
  closed?: boolean
  position?: { x?: number; y?: number }
}

function toEntityPolylines(e: RawEntity): DxfPolyline[] {
  const layer = e.layer ?? '0'
  switch (e.type) {
    case 'LINE':
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const points = (e.vertices ?? [])
        .filter((v) => v.x != null && v.y != null)
        .map((v) => ({ x: v.x as number, y: v.y as number }))
      if (points.length < 2) return []
      return [{ points, closed: Boolean(e.shape || e.closed), layer }]
    }
    case 'CIRCLE': {
      if (!e.center || e.radius == null) return []
      return [
        {
          points: circleToPoints(e.center.x ?? 0, e.center.y ?? 0, e.radius),
          closed: true,
          layer,
        },
      ]
    }
    case 'ARC': {
      if (!e.center || e.radius == null) return []
      return [
        {
          points: arcToPoints(
            e.center.x ?? 0,
            e.center.y ?? 0,
            e.radius,
            e.startAngle ?? 0,
            e.endAngle ?? Math.PI * 2,
          ),
          closed: false,
          layer,
        },
      ]
    }
    default:
      return []
  }
}

function computeBounds(polylines: DxfPolyline[]): DxfBounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const pl of polylines) {
    for (const p of pl.points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  if (!Number.isFinite(minX)) return null
  return { minX, minY, maxX, maxY }
}

/**
 * DXF 텍스트를 파싱해 렌더 가능한 폴리라인 목록으로 변환한다.
 * 파싱 실패 시 예외를 던진다(호출부에서 사용자에게 안내).
 */
export function parseDxf(text: string): ParsedDxf {
  const parser = new DxfParser()
  const dxf = parser.parseSync(text) as { entities?: RawEntity[] } | null
  const entities = dxf?.entities ?? []

  const polylines: DxfPolyline[] = []
  const unsupported: Record<string, number> = {}

  for (const e of entities) {
    const converted = toEntityPolylines(e)
    if (converted.length === 0 && e.type && !isDrawableType(e.type)) {
      unsupported[e.type] = (unsupported[e.type] ?? 0) + 1
      continue
    }
    polylines.push(...converted)
  }

  return { polylines, bounds: computeBounds(polylines), unsupported }
}

function isDrawableType(type: string): boolean {
  return (
    type === 'LINE' ||
    type === 'LWPOLYLINE' ||
    type === 'POLYLINE' ||
    type === 'CIRCLE' ||
    type === 'ARC'
  )
}

// ---------------------------------------------------------------------------
// Phase B: 편집 모델 — 렌더용 폴리라인과 달리 원본 형상(선/원)을 보존해
// 편집·저장 시 정확한 DXF 로 되돌릴 수 있게 한다.
// ---------------------------------------------------------------------------

export type EditorEntity =
  | { kind: 'line'; a: Point2D; b: Point2D; layer: string }
  | { kind: 'polyline'; points: Point2D[]; closed: boolean; layer: string }
  | { kind: 'circle'; center: Point2D; radius: number; layer: string }

/** 편집 엔티티를 렌더러가 그릴 폴리라인으로 변환(원은 여기서 샘플링). */
export function entityToPolyline(e: EditorEntity): DxfPolyline {
  switch (e.kind) {
    case 'line':
      return { points: [e.a, e.b], closed: false, layer: e.layer }
    case 'polyline':
      return { points: e.points, closed: e.closed, layer: e.layer }
    case 'circle':
      return {
        points: circleToPoints(e.center.x, e.center.y, e.radius),
        closed: true,
        layer: e.layer,
      }
  }
}

export function entitiesBounds(entities: EditorEntity[]): DxfBounds | null {
  return computeBounds(entities.map(entityToPolyline))
}

/** 편집용: 원본 형상(LINE/CIRCLE)을 보존하며 파싱. ARC 는 폴리라인으로 근사. */
export function parseDxfEntities(text: string): {
  entities: EditorEntity[]
  bounds: DxfBounds | null
  unsupported: Record<string, number>
} {
  const parser = new DxfParser()
  const dxf = parser.parseSync(text) as { entities?: RawEntity[] } | null
  const raw = dxf?.entities ?? []
  const entities: EditorEntity[] = []
  const unsupported: Record<string, number> = {}

  for (const e of raw) {
    const layer = e.layer ?? '0'
    if (e.type === 'LINE') {
      const v = (e.vertices ?? []).filter((p) => p.x != null && p.y != null)
      if (v.length >= 2) {
        entities.push({
          kind: 'line',
          a: { x: v[0].x as number, y: v[0].y as number },
          b: { x: v[1].x as number, y: v[1].y as number },
          layer,
        })
      }
    } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
      const points = (e.vertices ?? [])
        .filter((p) => p.x != null && p.y != null)
        .map((p) => ({ x: p.x as number, y: p.y as number }))
      if (points.length >= 2) {
        entities.push({ kind: 'polyline', points, closed: Boolean(e.shape || e.closed), layer })
      }
    } else if (e.type === 'CIRCLE' && e.center && e.radius != null) {
      entities.push({
        kind: 'circle',
        center: { x: e.center.x ?? 0, y: e.center.y ?? 0 },
        radius: e.radius,
        layer,
      })
    } else if (e.type === 'ARC' && e.center && e.radius != null) {
      entities.push({
        kind: 'polyline',
        points: arcToPoints(e.center.x ?? 0, e.center.y ?? 0, e.radius, e.startAngle ?? 0, e.endAngle ?? Math.PI * 2),
        closed: false,
        layer,
      })
    } else if (e.type) {
      unsupported[e.type] = (unsupported[e.type] ?? 0) + 1
    }
  }
  return { entities, bounds: entitiesBounds(entities), unsupported }
}

// ---------------------------------------------------------------------------
// DXF 직렬화(저장). AC1015(R2000) 헤더 + ENTITIES 만 담은 최소 DXF.
// dxf-parser 와 대부분의 뷰어/AutoCAD 가 읽는다.
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0'
  // 지수표기 방지 + 소수 6자리
  return n.toFixed(6).replace(/\.?0+$/, '') || '0'
}

export function serializeDxf(entities: EditorEntity[]): string {
  const out: string[] = []
  const g = (code: number, value: string | number) => {
    out.push(String(code))
    out.push(String(value))
  }
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1015'); g(0, 'ENDSEC')
  g(0, 'SECTION'); g(2, 'ENTITIES')
  for (const e of entities) {
    if (e.kind === 'line') {
      g(0, 'LINE'); g(8, e.layer)
      g(10, fmt(e.a.x)); g(20, fmt(e.a.y)); g(30, '0')
      g(11, fmt(e.b.x)); g(21, fmt(e.b.y)); g(31, '0')
    } else if (e.kind === 'polyline') {
      g(0, 'LWPOLYLINE'); g(8, e.layer)
      g(90, e.points.length); g(70, e.closed ? 1 : 0)
      for (const p of e.points) { g(10, fmt(p.x)); g(20, fmt(p.y)) }
    } else if (e.kind === 'circle') {
      g(0, 'CIRCLE'); g(8, e.layer)
      g(10, fmt(e.center.x)); g(20, fmt(e.center.y)); g(30, '0'); g(40, fmt(e.radius))
    }
  }
  g(0, 'ENDSEC'); g(0, 'EOF')
  return out.join('\n') + '\n'
}

export function distinctLayers(entities: EditorEntity[]): string[] {
  return [...new Set(entities.map((e) => e.layer))].sort()
}
