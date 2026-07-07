import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { DxfCanvas, type EditorTool } from '../components/cad/DxfCanvas'
import {
  distinctLayers,
  parseDxfEntities,
  serializeDxf,
  type DxfBounds,
  type EditorEntity,
} from '../services/cad/dxf'

/**
 * CAD 에디터 (Phase B) — 브라우저 안 DXF 뷰어 + 편집.
 * 열기: .dxf 파싱. 편집: 선/폴리선/원 그리기(끝점·그리드 스냅), 선택·삭제, 레이어, 저장.
 * DWG는 로컬 에이전트가 DXF로 변환한 파일을 사용한다. (Phase C 브릿지)
 */

const DEFAULT_BOUNDS: DxfBounds = { minX: 0, minY: 0, maxX: 200, maxY: 150 }

const TOOLS: Array<{ id: EditorTool; label: string; hint: string }> = [
  { id: 'pan', label: '이동', hint: '드래그로 화면 이동' },
  { id: 'select', label: '선택', hint: '클릭 선택 후 Delete 삭제' },
  { id: 'line', label: '선', hint: '두 점 클릭' },
  { id: 'polyline', label: '폴리선', hint: '여러 점 클릭 · Enter/더블클릭 종료' },
  { id: 'circle', label: '원', hint: '중심→반지름 클릭' },
]

export function CadEditorPage() {
  const [entities, setEntities] = useState<EditorEntity[]>([])
  const [past, setPast] = useState<EditorEntity[][]>([])
  const [bounds, setBounds] = useState<DxfBounds>(DEFAULT_BOUNDS)
  const [fileName, setFileName] = useState<string | null>(null)
  const [tool, setTool] = useState<EditorTool>('select')
  const [currentLayer, setCurrentLayer] = useState('0')
  const [endpointSnap, setEndpointSnap] = useState(true)
  const [gridSnap, setGridSnap] = useState(false)
  const [gridStep, setGridStep] = useState(10)
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set())
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const layers = useMemo(() => {
    const ls = distinctLayers(entities)
    if (!ls.includes(currentLayer)) ls.push(currentLayer)
    return ls.sort()
  }, [entities, currentLayer])

  const commit = useCallback(
    (next: EditorEntity[]) => {
      setPast((p) => [...p.slice(-49), entities])
      setEntities(next)
      setSelectedIndex(null)
    },
    [entities],
  )

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p
      const prev = p[p.length - 1]
      setEntities(prev)
      setSelectedIndex(null)
      return p.slice(0, -1)
    })
  }, [])

  const loadFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.dxf')) {
      toast.error(
        file.name.toLowerCase().endsWith('.dwg')
          ? 'DWG는 브라우저에서 직접 열 수 없어요. 로컬 에이전트로 DXF 변환 후 사용하세요.'
          : 'DXF 파일만 열 수 있습니다.',
      )
      return
    }
    try {
      const text = await file.text()
      const result = parseDxfEntities(text)
      if (result.entities.length === 0) {
        toast.error('그릴 수 있는 도형이 없습니다. (지원: LINE/POLYLINE/CIRCLE/ARC)')
        return
      }
      setEntities(result.entities)
      setPast([])
      setBounds(result.bounds ?? DEFAULT_BOUNDS)
      setFileName(file.name)
      setSelectedIndex(null)
      const un = Object.values(result.unsupported).reduce((a, b) => a + b, 0)
      toast.success(
        `${file.name} 열기 완료 · 도형 ${result.entities.length}개` +
          (un > 0 ? ` (미지원 ${un}개 생략)` : ''),
      )
    } catch (e) {
      toast.error(`DXF 파싱 실패: ${e instanceof Error ? e.message : e}`)
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) void loadFile(file)
    },
    [loadFile],
  )

  const exportDxf = useCallback(() => {
    if (entities.length === 0) {
      toast.error('내보낼 도형이 없습니다.')
      return
    }
    const blob = new Blob([serializeDxf(entities)], { type: 'application/dxf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (fileName?.replace(/\.dxf$/i, '') || 'drawing') + '-편집.dxf'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('DXF로 저장했습니다.')
  }, [entities, fileName])

  const toggleLayer = useCallback((layer: string) => {
    setHiddenLayers((prev) => {
      const next = new Set(prev)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      return next
    })
  }, [])

  const activeTool = TOOLS.find((t) => t.id === tool)

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-3 px-4 py-6 md:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200/80 bg-violet-50/80 px-3 py-1 text-[10px]! font-semibold uppercase tracking-[0.12em] text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300 md:text-[11px]!">
            <span aria-hidden>✏️</span> CAD 에디터 · 베타
          </span>
          <h1 className="mt-2 text-[22px]! font-bold tracking-tight text-stone-900 dark:text-stone-50 md:text-[28px]!">
            도면 편집 (DXF)
          </h1>
          <p className="mt-1 text-[13px]! leading-relaxed text-stone-600 dark:text-stone-400 md:text-[14px]!">
            {activeTool ? `현재: ${activeTool.label} — ${activeTool.hint}. ` : ''}
            휠=줌, 중/우클릭 드래그=이동.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-lg border border-stone-300 px-3 py-2 text-[13px]! font-semibold text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800 md:text-[14px]!"
          >
            DXF 열기
          </button>
          <button
            type="button"
            onClick={exportDxf}
            className="rounded-lg bg-violet-600 px-4 py-2 text-[13px]! font-semibold text-white transition-colors hover:bg-violet-700 md:text-[14px]!"
          >
            DXF 저장
          </button>
          <input ref={inputRef} type="file" accept=".dxf" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = '' }} className="hidden" />
        </div>
      </header>

      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-stone-200 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-center gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.hint}
              onClick={() => setTool(t.id)}
              className={`rounded-md px-2.5 py-1.5 text-[12px]! font-semibold transition-colors md:text-[13px]! ${
                tool === t.id
                  ? 'bg-violet-600 text-white'
                  : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-stone-200 dark:bg-stone-700" />

        <label className="flex items-center gap-1.5 text-[12px]! text-stone-600 dark:text-stone-300 md:text-[13px]!">
          <input type="checkbox" checked={endpointSnap} onChange={(e) => setEndpointSnap(e.target.checked)} />
          끝점 스냅
        </label>
        <label className="flex items-center gap-1.5 text-[12px]! text-stone-600 dark:text-stone-300 md:text-[13px]!">
          <input type="checkbox" checked={gridSnap} onChange={(e) => setGridSnap(e.target.checked)} />
          그리드
        </label>
        <input
          type="number"
          value={gridStep}
          min={0.1}
          onChange={(e) => setGridStep(Math.max(0.1, Number(e.target.value) || 1))}
          aria-label="그리드 간격"
          className="w-[64px] rounded-md border border-stone-300 px-2 py-1 text-[12px]! dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100 md:text-[13px]!"
        />

        <div className="h-4 w-px bg-stone-200 dark:bg-stone-700" />

        <label className="flex items-center gap-1.5 text-[12px]! text-stone-600 dark:text-stone-300 md:text-[13px]!">
          레이어
          <select
            value={currentLayer}
            onChange={(e) => setCurrentLayer(e.target.value)}
            aria-label="현재 레이어"
            className="rounded-md border border-stone-300 px-2 py-1 text-[12px]! dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100 md:text-[13px]!"
          >
            {layers.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={past.length === 0}
            className="rounded-md px-2.5 py-1.5 text-[12px]! font-medium text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-40 dark:text-stone-300 dark:hover:bg-stone-800 md:text-[13px]!"
          >
            ↶ 실행취소
          </button>
          <button
            type="button"
            onClick={() => { commit([]); setBounds(DEFAULT_BOUNDS); setFileName(null) }}
            className="rounded-md px-2.5 py-1.5 text-[12px]! font-medium text-stone-600 transition-colors hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800 md:text-[13px]!"
          >
            새로 그리기
          </button>
        </div>
      </div>

      <div className="flex flex-1 gap-3">
        {/* 캔버스 */}
        <div
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          className={`relative flex-1 overflow-hidden rounded-2xl border ${
            dragOver ? 'border-violet-400 border-dashed bg-violet-50/40 dark:bg-violet-950/20' : 'border-stone-200 dark:border-stone-800'
          } bg-stone-50 dark:bg-stone-900`}
        >
          <DxfCanvas
            entities={entities}
            bounds={bounds}
            tool={tool}
            currentLayer={currentLayer}
            snap={{ endpoint: endpointSnap, grid: gridSnap, gridStep }}
            hiddenLayers={hiddenLayers}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            onEntitiesChange={commit}
          />
          {entities.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-8 text-center">
              <div className="text-[36px]! opacity-30" aria-hidden>📐</div>
              <p className="text-[13px]! font-medium text-stone-500 dark:text-stone-500 md:text-[14px]!">
                DXF를 열거나, 위 도구로 직접 그려보세요
              </p>
            </div>
          )}
        </div>

        {/* 레이어 패널 */}
        {layers.length > 0 && (
          <aside className="hidden w-[160px] shrink-0 flex-col gap-1 rounded-2xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900 sm:flex">
            <p className="mb-1 text-[11px]! font-semibold uppercase tracking-wide text-stone-400 md:text-[12px]!">레이어</p>
            {layers.map((l) => (
              <label key={l} className="flex items-center gap-2 text-[12px]! text-stone-700 dark:text-stone-300 md:text-[13px]!">
                <input
                  type="checkbox"
                  checked={!hiddenLayers.has(l)}
                  onChange={() => toggleLayer(l)}
                />
                <span className="truncate">{l}</span>
              </label>
            ))}
          </aside>
        )}
      </div>
    </div>
  )
}

export default CadEditorPage
