import { useEffect, useRef, useState } from 'react'
import {
  LocaleType,
  LogLevel,
  Univer,
  UniverInstanceType,
} from '@univerjs/core'
import { FUniver } from '@univerjs/core/facade'
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import UniverSheetsKoKR from '@univerjs/presets/preset-sheets-core/locales/ko-KR'
import { UniverSheetsPlugin } from '@univerjs/sheets'
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui'
import { UniverUIPlugin } from '@univerjs/ui'

import '@univerjs/design/lib/index.css'
import '@univerjs/ui/lib/index.css'
import '@univerjs/sheets-ui/lib/index.css'

import '@univerjs/sheets/facade'
import '@univerjs/sheets-ui/facade'
import '@univerjs/ui/facade'

const WORKBOOK_UNIT_ID = 'nh-ai-hub-workbook'

const OFFICE_TABS = [
  { id: 'sheets', label: '스프레드시트', hint: 'Excel' },
  { id: 'docs', label: '문서', hint: 'Word (개발중)' },
  { id: 'slides', label: '슬라이드', hint: 'PPT (개발중)' },
]

/**
 * @typedef {Object} AiCellUpdate
 * @property {string} range
 * @property {string|number|boolean|null} value
 * @property {string} [sheetName]
 */

/**
 * @typedef {Object} AiDataSignal
 * @property {number|string} [tick]
 * @property {AiCellUpdate[]} [updates]
 * @property {Record<string, string|number|boolean|null>} [map]
 * @property {string} [range]
 * @property {string|number|boolean|null} [value]
 */

function extractAiCellUpdates(signal) {
  if (!signal || typeof signal !== 'object') return []
  const updates = []

  if (Array.isArray(signal.updates)) {
    updates.push(...signal.updates)
  }
  if (signal.map && typeof signal.map === 'object') {
    Object.entries(signal.map).forEach(([range, value]) => {
      updates.push({ range, value })
    })
  }
  if (signal.range != null && signal.value !== undefined) {
    updates.push({
      range: signal.range,
      value: signal.value,
      sheetName: signal.sheetName,
    })
  }
  return updates
}

function applyAiDataToWorkbook(univerAPI, signal) {
  const workbook = univerAPI.getActiveWorkbook()
  if (!workbook) return

  const updates = extractAiCellUpdates(signal)
  updates.forEach((item) => {
    const targetRange = item.range
    if (!targetRange || item.value === undefined) return

    const sheetKey = item.sheetName
    const worksheet = sheetKey
      ? workbook.getSheetByName(sheetKey) ?? workbook.getActiveSheet()
      : workbook.getActiveSheet()

    if (!worksheet) return

    const rangeRef = String(targetRange)
    const sheetScopedRange = rangeRef.includes('!')
      ? rangeRef
      : sheetKey
        ? `${sheetKey}!${rangeRef}`
        : rangeRef

    worksheet.getRange(sheetScopedRange).setValue(item.value)
  })
}

/**
 * @param {import('@univerjs/core/facade').FUniver} univerAPI
 * @param {string|undefined} unitId
 * @param {{ maxAttempts?: number, intervalMs?: number }} [options]
 * @returns {() => void}
 */
function scheduleSafeSetCurrent(univerAPI, unitId, options = {}) {
  if (!unitId) {
    return () => {}
  }

  const { maxAttempts = 80, intervalMs = 50 } = options
  let attempts = 0
  let cancelled = false
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timerId = null

  const trySet = () => {
    if (cancelled) return

    attempts += 1
    try {
      univerAPI.setCurrent(unitId)
      return
    } catch {
      if (attempts >= maxAttempts) {
        console.warn(
          `[Univer Sheets Guard]: setCurrent 재시도 한도 초과 — unitId=${unitId}`,
        )
        return
      }
      timerId = setTimeout(trySet, intervalMs)
    }
  }

  timerId = setTimeout(trySet, 0)

  return () => {
    cancelled = true
    if (timerId != null) {
      clearTimeout(timerId)
    }
  }
}

export default function UniverWorkspace({
  aiDataSignal,
  activeTab: activeTabProp,
  onActiveTabChange,
  className = '',
}) {
  const mountRef = useRef(null)
  const univerRef = useRef(null)
  const univerAPIRef = useRef(null)
  const sheetReadyRef = useRef(false)
  const [internalActiveTab, setInternalActiveTab] = useState('sheets')
  const activeTab = activeTabProp ?? internalActiveTab
  const [isReady, setIsReady] = useState(false)

  const handleActiveTabChange = (tabId) => {
    if (tabId !== 'sheets') return
    if (onActiveTabChange) {
      onActiveTabChange(tabId)
      return
    }
    setInternalActiveTab(tabId)
  }

  useEffect(() => {
    const containerEl = mountRef.current
    if (!containerEl) return

    let cancelled = false

    const univer = new Univer({
      locale: LocaleType.KO_KR,
      locales: {
        [LocaleType.KO_KR]: UniverSheetsKoKR,
      },
      logLevel: LogLevel.WARN,
      darkMode: false,
    })

    univer.registerPlugin(UniverRenderEnginePlugin)
    univer.registerPlugin(UniverFormulaEnginePlugin)
    univer.registerPlugin(UniverUIPlugin, {
      container: containerEl,
      header: false,
      toolbar: true,
      footer: true,
      contextMenu: true,
    })
    univer.registerPlugin(UniverSheetsPlugin)
    univer.registerPlugin(UniverSheetsUIPlugin, {
      layout: {
        sheetBar: true,
        formulaBar: true,
        statusBar: true,
      },
    })

    const univerAPI = FUniver.newAPI(univer)
    univerRef.current = univer
    univerAPIRef.current = univerAPI

    try {
      univer.createUnit(UniverInstanceType.UNIVER_SHEET, {
        id: WORKBOOK_UNIT_ID,
        name: 'NH-AX-HUB Master Sheet',
        locale: LocaleType.KO_KR,
        styles: {},
        sheets: {
          sheet1: {
            id: 'sheet1',
            name: '정산 분석 시트',
            rowCount: 200,
            columnCount: 30,
          },
        },
      })
      sheetReadyRef.current = true
    } catch (err) {
      sheetReadyRef.current = false
      console.error('[Univer Sheets Engine Error]:', err)
    } finally {
      if (!cancelled) {
        setIsReady(true)
      }
    }

    return () => {
      cancelled = true
      setIsReady(false)
      sheetReadyRef.current = false
      univerAPIRef.current = null
      univerRef.current = null
      setTimeout(() => {
        try {
          univer.dispose()
        } catch (e) {}
      }, 0)
    }
  }, [])

  useEffect(() => {
    const univerAPI = univerAPIRef.current
    if (!univerAPI || !isReady || !sheetReadyRef.current) return
    if (activeTab !== 'sheets') return

    return scheduleSafeSetCurrent(univerAPI, WORKBOOK_UNIT_ID)
  }, [activeTab, isReady])

  useEffect(() => {
    const univerAPI = univerAPIRef.current
    if (!univerAPI || !aiDataSignal || !isReady) return

    if (activeTab === 'sheets') {
      applyAiDataToWorkbook(univerAPI, aiDataSignal)
    }
  }, [aiDataSignal, activeTab, isReady])

  const rootClassName = [
    'flex h-full min-h-[35rem] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-sm',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className={rootClassName} aria-label="NH-AX-HUB 통합 오피스">
      <header className="grid gap-3 border-b border-zinc-800 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
            통합 워크스페이스
          </span>
          <h2 className="truncate text-lg font-semibold text-zinc-50 md:text-xl">
            NH-AX-HUB Office
          </h2>
          <p className="text-xs text-zinc-500 md:text-sm">
            Sheet 순정 엔진 가동 · AI 데이터 실시간 스트리밍
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start md:justify-end">
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              isReady
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-zinc-700 bg-zinc-900 text-zinc-400'
            }`}
          >
            {isReady ? 'Univer 가동됨' : '엔진 예열 중…'}
          </span>
          <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
            v0.23
          </span>
        </div>
      </header>

      <nav
        className="flex items-center gap-1 overflow-x-auto border-b border-zinc-800 px-2 py-2 md:px-3"
        aria-label="오피스 탭"
      >
        {OFFICE_TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleActiveTabChange(tab.id)}
              aria-pressed={isActive}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition md:px-4 ${
                isActive
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-transparent bg-zinc-900/60 text-zinc-400 opacity-60'
              }`}
            >
              <span className="text-sm font-medium">{tab.label}</span>
              <span
                className={`hidden rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide md:inline ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {tab.hint}
              </span>
            </button>
          )
        })}
      </nav>

      <div className="grid min-h-0 flex-1 gap-2 p-2 md:grid-cols-[minmax(0,1fr)_14rem] md:p-3">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-200">
                스프레드시트 캔버스
              </p>
              <p className="truncate text-[11px] text-zinc-500">
                수식 엔진 · 셀 편집 · AI 데이터 정밀 주입
              </p>
            </div>
            <span className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Bento
            </span>
          </div>

          <div className="relative flex-grow flex-1 min-h-[35rem] w-full bg-white">
            <div
              ref={mountRef}
              className="absolute inset-0 h-full w-full overflow-hidden"
              aria-label="Univer Sheets 마운트 타깃"
            />
          </div>
        </div>

        <aside className="hidden min-h-0 flex-col gap-2 md:flex">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
              AI Stream
            </p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              <code className="rounded bg-zinc-950 px-1 py-0.5 text-emerald-400">
                aiDataSignal
              </code>
              로 시트 세포에 수식과 정산 수치를 다이렉트로 사격합니다.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Sheets Payload
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-[10px] leading-relaxed text-zinc-400">
              {`{
  tick: Date.now(),
  updates: [
    { range: "A1", value: "매출 현황" },
    { range: "B1", value: "=SUM(B2:B10)" }
  ]
}`}
            </pre>
          </div>
        </aside>
      </div>
    </section>
  )
}
