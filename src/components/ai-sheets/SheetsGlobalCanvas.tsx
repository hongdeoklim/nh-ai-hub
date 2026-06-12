import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'

import { DEFAULT_SHEETS_RANGE } from '../../lib/google-sheets-url'
import {
  applyStyleToKeys,
  cssFromCellStyle,
  formatDisplayValue,
  getCellStyle,
  styleKey,
  type CellStyle,
  type CellStyleMap,
} from '../../lib/sheet-cell-styles'
import { cellIdFromCoords, parseCellId, parseClipboardGrid } from '../../lib/sheet-formula'
import {
  clearRangeInGrid,
  cloneGrid,
  COL_LABELS,
  createEmptyGrid,
  extractRangeFromGrid,
  fillRangeFromAnchor,
  getDisplayGrid,
  getRawCell,
  gridFromMatrix,
  gridToCsv,
  pasteIntoGrid,
  rangeToClipboardText,
  setCellRaw,
  sortColumnInGrid,
} from '../../lib/sheet-grid'
import {
  cellIdFromSelectionFocus,
  extendSelection,
  isCellInRange,
  isSingleCell,
  iterateRange,
  normalizeRange,
  rangeToLabel,
  selectionFromCellId,
  type CellCoords,
  type SelectionRange,
} from '../../lib/sheet-selection'
import type { GoogleSpreadsheetReadResult } from '../../services/ai/google-sheets-preview'
import {
  SheetsContextMenu,
  type ContextMenuActionId,
} from './SheetsContextMenu'
import {
  SheetsDesignerRibbon,
  type RibbonActionId,
  type RibbonStylePatch,
  type RibbonTabId,
} from './SheetsDesignerRibbon'
import {
  IconExport,
  IconFileOpen,
  IconFullscreen,
  IconFullscreenExit,
  IconGoogleSheets,
  IconLinkOff,
  IconRefresh,
  IconUpload,
} from './SheetsRibbonIcons'
import './sheets-designer.css'

type SheetsGlobalCanvasProps = {
  linkedSpreadsheetId?: string | null
  linkedSpreadsheetUrl?: string | null
  linkedFileName?: string | null
  isLocalFile?: boolean
  range: string
  sheetNames?: string[]
  activeSheetName?: string
  onRangeChange: (range: string) => void
  onConnectUrl: (url: string, range: string) => void
  onOpenLocalFile: (file: File) => void
  onSheetChange?: (sheetName: string) => void
  onDisconnect: () => void
  onRefresh?: () => void
  onSendSelectionToChat?: (text: string) => void
  preview: GoogleSpreadsheetReadResult | null
  previewLoading?: boolean
}

const DEFAULT_ROWS = 50
const DEFAULT_COLS = 16
const EXCEL_GREEN = '#107c41'
const MAX_UNDO = 50

const INITIAL_SELECTION: SelectionRange = {
  anchor: { row: 0, col: 0 },
  focus: { row: 0, col: 0 },
}

function exportCsvFromGrid(grid: string[][], filename: string) {
  const csv = gridToCsv(grid)
  if (!csv.trim() || csv === '""') {
    window.alert('내보낼 데이터가 없습니다.')
    return
  }
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function QatButton({
  children,
  icon,
  onClick,
}: {
  children: ReactNode
  icon?: ReactNode
  onClick?: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="gc-qat-btn">
      {icon ? <span className="gc-qat-btn-icon">{icon}</span> : null}
      {children}
    </button>
  )
}

function previewSnapshotKey(
  preview: GoogleSpreadsheetReadResult | null,
  linkedSpreadsheetId?: string | null,
  linkedFileName?: string | null,
  range?: string,
  activeSheetName?: string,
): string {
  if (!preview?.ok || !preview.matrix?.length) return ''
  return [
    linkedSpreadsheetId ?? '',
    linkedFileName ?? '',
    range ?? '',
    activeSheetName ?? '',
    preview.rowCount ?? preview.matrix.length,
    preview.matrix[0]?.length ?? 0,
  ].join('|')
}

function selectionKeys(range: SelectionRange): string[] {
  const keys: string[] = []
  iterateRange(range, (row, col) => {
    keys.push(styleKey(row, col))
  })
  return keys
}

function formatSelectionForChat(
  rawGrid: string[][],
  displayGrid: string[][],
  range: SelectionRange,
): string {
  const { r0, c0, r1, c1 } = normalizeRange(range)
  const label = rangeToLabel(range)
  const lines: string[] = [`선택 범위: ${label}`, '']
  for (let r = r0; r <= r1; r++) {
    const cells: string[] = []
    for (let c = c0; c <= c1; c++) {
      const raw = getRawCell(rawGrid, r, c)
      const shown = displayGrid[r]?.[c] ?? ''
      cells.push(raw.startsWith('=') ? `${shown} (${raw})` : shown || raw)
    }
    lines.push(cells.join('\t'))
  }
  return lines.join('\n')
}

export function SheetsGlobalCanvas({
  linkedSpreadsheetId,
  linkedSpreadsheetUrl,
  linkedFileName,
  isLocalFile = false,
  range,
  sheetNames = [],
  activeSheetName,
  onRangeChange,
  onConnectUrl,
  onOpenLocalFile,
  onSheetChange,
  onDisconnect,
  onRefresh,
  onSendSelectionToChat,
  preview,
  previewLoading = false,
}: SheetsGlobalCanvasProps) {
  const [activeTab, setActiveTab] = useState<RibbonTabId>('홈')
  const [fullscreen, setFullscreen] = useState(false)
  const [selection, setSelection] = useState<SelectionRange>(INITIAL_SELECTION)
  const [rawGrid, setRawGrid] = useState<string[][]>(() => createEmptyGrid())
  const [cellStyles, setCellStyles] = useState<CellStyleMap>({})
  const [undoStack, setUndoStack] = useState<string[][][]>([])
  const [redoStack, setRedoStack] = useState<string[][][]>([])
  const [formulaDraft, setFormulaDraft] = useState('')
  const [inlineEditCell, setInlineEditCell] = useState<string | null>(null)
  const [inlineDraft, setInlineDraft] = useState('')
  const [openFilePanel, setOpenFilePanel] = useState<'local' | 'google' | null>(
    null,
  )
  const [urlDraft, setUrlDraft] = useState('')
  const [rangeDraft, setRangeDraft] = useState(range)
  const [dragOver, setDragOver] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(
    null,
  )

  const fileInputRef = useRef<HTMLInputElement>(null)
  const formulaInputRef = useRef<HTMLInputElement>(null)
  const gridWrapRef = useRef<HTMLDivElement>(null)
  const loadedPreviewKeyRef = useRef('')
  const selectionRef = useRef(selection)
  const isDragSelectingRef = useRef(false)
  const dragAnchorRef = useRef<CellCoords | null>(null)
  selectionRef.current = selection

  const selectedCell = cellIdFromSelectionFocus(selection)
  const nameBoxLabel = rangeToLabel(selection)

  const formulaDisplayGrid = useMemo(() => getDisplayGrid(rawGrid), [rawGrid])
  const displayGrid = useMemo(
    () =>
      formulaDisplayGrid.map((row, rowIndex) =>
        row.map((cell, colIndex) => {
          const style = getCellStyle(cellStyles, rowIndex, colIndex)
          return formatDisplayValue(cell, style)
        }),
      ),
    [formulaDisplayGrid, cellStyles],
  )

  const colCount = Math.max(DEFAULT_COLS, rawGrid[0]?.length ?? DEFAULT_COLS)

  const focusStyle = useMemo(
    () => getCellStyle(cellStyles, selection.focus.row, selection.focus.col),
    [cellStyles, selection.focus.col, selection.focus.row],
  )

  const hasLinkedSource = Boolean(linkedSpreadsheetId || linkedFileName)

  useEffect(() => {
    if (previewLoading) return
    const key = previewSnapshotKey(
      preview,
      linkedSpreadsheetId,
      linkedFileName,
      range,
      activeSheetName,
    )
    if (key && key !== loadedPreviewKeyRef.current) {
      loadedPreviewKeyRef.current = key
      const next = gridFromMatrix(preview?.matrix)
      setRawGrid(next)
      setCellStyles({})
      setUndoStack([])
      setRedoStack([])
      const coords = selectionRef.current.focus
      setFormulaDraft(getRawCell(next, coords.row, coords.col))
      return
    }
    if (!key && !hasLinkedSource && loadedPreviewKeyRef.current) {
      loadedPreviewKeyRef.current = ''
      setRawGrid(createEmptyGrid())
      setCellStyles({})
      setUndoStack([])
      setRedoStack([])
      setFormulaDraft('')
    }
  }, [
    preview,
    previewLoading,
    linkedSpreadsheetId,
    linkedFileName,
    range,
    activeSheetName,
    hasLinkedSource,
  ])

  const pushUndo = useCallback((grid: string[][]) => {
    setUndoStack((prev) => [...prev.slice(-(MAX_UNDO - 1)), cloneGrid(grid)])
    setRedoStack([])
  }, [])

  const commitCellValue = useCallback(
    (row: number, col: number, value: string) => {
      const current = getRawCell(rawGrid, row, col)
      if (current === value) return
      pushUndo(rawGrid)
      const next = setCellRaw(rawGrid, row, col, value)
      setRawGrid(next)
      if (selection.focus.row === row && selection.focus.col === col) {
        setFormulaDraft(value)
      }
    },
    [rawGrid, pushUndo, selection.focus.col, selection.focus.row],
  )

  const syncFormulaFromSelection = useCallback(
    (rangeSel: SelectionRange, grid = rawGrid) => {
      const { row, col } = rangeSel.focus
      setFormulaDraft(getRawCell(grid, row, col))
    },
    [rawGrid],
  )

  const setSelectionToCell = useCallback(
    (cellId: string, extend = false) => {
      const coords = parseCellId(cellId)
      if (!coords) return
      if (inlineEditCell) {
        const editCoords = parseCellId(inlineEditCell)
        if (editCoords) commitCellValue(editCoords.row, editCoords.col, inlineDraft)
        setInlineEditCell(null)
      }
      setSelection((prev) =>
        extend
          ? extendSelection(prev.anchor, coords)
          : { anchor: coords, focus: coords },
      )
      syncFormulaFromSelection(
        extend ? extendSelection(selectionRef.current.anchor, coords) : { anchor: coords, focus: coords },
      )
      gridWrapRef.current?.focus()
    },
    [inlineEditCell, inlineDraft, commitCellValue, syncFormulaFromSelection],
  )

  const commitFormulaBar = useCallback(() => {
    const { row, col } = selection.focus
    commitCellValue(row, col, formulaDraft)
    setInlineEditCell(null)
  }, [selection.focus, formulaDraft, commitCellValue])

  const getNormalizedSelection = useCallback(
    () => normalizeRange(selectionRef.current),
    [],
  )

  const handleCopyRange = useCallback(
    async (rangeSel = selectionRef.current) => {
      const { r0, c0, r1, c1 } = normalizeRange(rangeSel)
      const patch = extractRangeFromGrid(rawGrid, r0, c0, r1, c1)
      const text = rangeToClipboardText(patch)
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        window.prompt('복사 (Ctrl+C):', text)
      }
    },
    [rawGrid],
  )

  const handleCutRange = useCallback(async () => {
    await handleCopyRange()
    const { r0, c0, r1, c1 } = getNormalizedSelection()
    pushUndo(rawGrid)
    setRawGrid(clearRangeInGrid(rawGrid, r0, c0, r1, c1))
    syncFormulaFromSelection(selectionRef.current)
  }, [handleCopyRange, getNormalizedSelection, pushUndo, rawGrid, syncFormulaFromSelection])

  const handlePaste = useCallback(async () => {
    const { row, col } = selectionRef.current.focus
    let text = ''
    try {
      text = await navigator.clipboard.readText()
    } catch {
      text = window.prompt('붙여넣기 (Ctrl+V):', '') ?? ''
    }
    if (!text) return
    const patch = parseClipboardGrid(text)
    pushUndo(rawGrid)
    const next = pasteIntoGrid(rawGrid, row, col, patch)
    setRawGrid(next)
    syncFormulaFromSelection(selectionRef.current, next)
  }, [rawGrid, pushUndo, syncFormulaFromSelection])

  const handleClearRange = useCallback(() => {
    const { r0, c0, r1, c1 } = getNormalizedSelection()
    pushUndo(rawGrid)
    const next = clearRangeInGrid(rawGrid, r0, c0, r1, c1)
    setRawGrid(next)
    syncFormulaFromSelection(selectionRef.current, next)
  }, [getNormalizedSelection, pushUndo, rawGrid, syncFormulaFromSelection])

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (!prev.length) return prev
      const snapshot = prev[prev.length - 1]
      setRedoStack((redo) => [...redo, cloneGrid(rawGrid)])
      setRawGrid(cloneGrid(snapshot))
      syncFormulaFromSelection(selectionRef.current, snapshot)
      return prev.slice(0, -1)
    })
  }, [rawGrid, syncFormulaFromSelection])

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (!prev.length) return prev
      const snapshot = prev[prev.length - 1]
      setUndoStack((undo) => [...undo, cloneGrid(rawGrid)])
      setRawGrid(cloneGrid(snapshot))
      syncFormulaFromSelection(selectionRef.current, snapshot)
      return prev.slice(0, -1)
    })
  }, [rawGrid, syncFormulaFromSelection])

  const applyStylePatch = useCallback((patch: RibbonStylePatch) => {
    const keys = selectionKeys(selectionRef.current)
    setCellStyles((prev) => applyStyleToKeys(prev, keys, patch))
  }, [])

  const handleRibbonAction = useCallback(
    (action: RibbonActionId) => {
      const { row, col } = selectionRef.current.focus
      const { r0, c0, r1, c1 } = getNormalizedSelection()

      const insertFormula = (formula: string) => {
        setFormulaDraft(formula)
        commitCellValue(row, col, formula)
        formulaInputRef.current?.focus()
      }

      const colLetters = cellIdFromCoords(0, col).replace(/\d+/, '')
      const endRow = row === 0 ? 1 : row
      const sumRange = `${colLetters}1:${colLetters}${endRow}`

      switch (action) {
        case 'undo':
          handleUndo()
          break
        case 'paste':
          void handlePaste()
          break
        case 'copy':
          void handleCopyRange()
          break
        case 'cut':
          void handleCutRange()
          break
        case 'clear':
        case 'clear-content':
        case 'clear-all':
          handleClearRange()
          break
        case 'clear-format': {
          const keys = new Set(selectionKeys(selectionRef.current))
          setCellStyles((prev) => {
            const next = { ...prev }
            keys.forEach((key) => {
              delete next[key]
            })
            return next
          })
          break
        }
        case 'wrap-text':
          applyStylePatch({
            wrapText: !getCellStyle(cellStyles, row, col).wrapText,
          })
          break
        case 'merge-center':
          window.alert('병합 기능은 준비 중입니다.')
          break
        case 'align-left':
          applyStylePatch({ textAlign: 'left' })
          break
        case 'align-center':
          applyStylePatch({ textAlign: 'center' })
          break
        case 'align-right':
          applyStylePatch({ textAlign: 'right' })
          break
        case 'align-top':
          applyStylePatch({ verticalAlign: 'top' })
          break
        case 'align-middle':
          applyStylePatch({ verticalAlign: 'middle' })
          break
        case 'align-bottom':
          applyStylePatch({ verticalAlign: 'bottom' })
          break
        case 'number-general':
          applyStylePatch({ numberFormat: 'general' })
          break
        case 'number-number':
          applyStylePatch({ numberFormat: 'number' })
          break
        case 'number-currency':
          applyStylePatch({ numberFormat: 'currency' })
          break
        case 'number-percent':
          applyStylePatch({ numberFormat: 'percent' })
          break
        case 'conditional-highlight':
        case 'conditional-new-rule':
        case 'conditional-clear':
        case 'table-style':
        case 'cell-style':
        case 'cell-editor-style':
        case 'cell-insert':
        case 'cell-delete':
        case 'cell-format':
        case 'filter':
        case 'replace':
        case 'stub':
          window.alert('이 기능은 준비 중입니다.')
          break
        case 'fill-down':
        case 'fill-right':
        case 'fill-up':
        case 'fill-left': {
          pushUndo(rawGrid)
          setRawGrid(fillRangeFromAnchor(rawGrid, selectionRef.current))
          break
        }
        case 'sort-asc': {
          pushUndo(rawGrid)
          setRawGrid(sortColumnInGrid(rawGrid, col, r0, r1, 'asc'))
          break
        }
        case 'sort-desc': {
          pushUndo(rawGrid)
          setRawGrid(sortColumnInGrid(rawGrid, col, r0, r1, 'desc'))
          break
        }
        case 'insert-function':
          setActiveTab('수식')
          insertFormula('=')
          break
        case 'autosum':
          insertFormula(`=SUM(${sumRange})`)
          break
        case 'autosum-average':
          insertFormula(`=AVERAGE(${sumRange})`)
          break
        case 'autosum-count':
          insertFormula(`=COUNT(${sumRange})`)
          break
        case 'autosum-max':
          insertFormula(`=MAX(${sumRange})`)
          break
        case 'autosum-min':
          insertFormula(`=MIN(${sumRange})`)
          break
        case 'find': {
          const query = window.prompt('찾을 내용을 입력하세요')
          if (!query?.trim()) break
          const needle = query.trim().toLowerCase()
          outer: for (let r = 0; r < displayGrid.length; r++) {
            for (let c = 0; c < displayGrid[r].length; c++) {
              const raw = getRawCell(rawGrid, r, c)
              const shown = displayGrid[r][c]
              if (
                raw.toLowerCase().includes(needle) ||
                shown.toLowerCase().includes(needle)
              ) {
                setSelectionToCell(`${COL_LABELS[c]}${r + 1}`)
                break outer
              }
            }
          }
          break
        }
        default:
          break
      }
    },
    [
      getNormalizedSelection,
      handleUndo,
      handlePaste,
      handleCopyRange,
      handleCutRange,
      handleClearRange,
      applyStylePatch,
      cellStyles,
      pushUndo,
      rawGrid,
      commitCellValue,
      displayGrid,
      setSelectionToCell,
    ],
  )

  const handleContextMenuAction = useCallback(
    (action: ContextMenuActionId) => {
      const { r0, c0, r1, c1 } = getNormalizedSelection()
      const { row, col } = selectionRef.current.focus
      switch (action) {
        case 'send-to-chat': {
          const text = formatSelectionForChat(
            rawGrid,
            displayGrid,
            selectionRef.current,
          )
          if (onSendSelectionToChat) onSendSelectionToChat(text)
          else window.alert(text)
          break
        }
        case 'cut':
          void handleCutRange()
          break
        case 'copy':
          void handleCopyRange()
          break
        case 'paste':
          void handlePaste()
          break
        case 'paste-options':
          void handlePaste()
          break
        case 'insert':
        case 'delete':
        case 'note':
        case 'convert-value':
        case 'rich-text':
        case 'define-name':
        case 'tags':
        case 'default':
          window.alert('이 기능은 준비 중입니다.')
          break
        case 'clear':
          handleClearRange()
          break
        case 'filter':
          window.alert('필터는 준비 중입니다.')
          break
        case 'sort-asc': {
          pushUndo(rawGrid)
          setRawGrid(sortColumnInGrid(rawGrid, col, r0, r1, 'asc'))
          break
        }
        case 'sort-desc': {
          pushUndo(rawGrid)
          setRawGrid(sortColumnInGrid(rawGrid, col, r0, r1, 'desc'))
          break
        }
        case 'format-cells':
          setActiveTab('홈')
          break
        case 'link': {
          const url = window.prompt('링크 URL을 입력하세요')
          if (!url?.trim()) break
          commitCellValue(row, col, url.trim())
          break
        }
        default:
          break
      }
    },
    [
      getNormalizedSelection,
      rawGrid,
      displayGrid,
      onSendSelectionToChat,
      handleCutRange,
      handleCopyRange,
      handlePaste,
      handleClearRange,
      pushUndo,
      commitCellValue,
    ],
  )

  const moveSelection = useCallback(
    (deltaRow: number, deltaCol: number, extend = false) => {
      const { focus, anchor } = selectionRef.current
      const nextRow = Math.max(0, Math.min(DEFAULT_ROWS - 1, focus.row + deltaRow))
      const nextCol = Math.max(0, Math.min(COL_LABELS.length - 1, focus.col + deltaCol))
      const nextFocus = { row: nextRow, col: nextCol }
      setSelection(
        extend
          ? { anchor, focus: nextFocus }
          : { anchor: nextFocus, focus: nextFocus },
      )
      syncFormulaFromSelection(
        extend ? { anchor, focus: nextFocus } : { anchor: nextFocus, focus: nextFocus },
      )
    },
    [syncFormulaFromSelection],
  )

  const handleGridKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (inlineEditCell) return
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) handleRedo()
        else handleUndo()
        return
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        handleRedo()
        return
      }
      if (mod && event.key.toLowerCase() === 'x') {
        event.preventDefault()
        void handleCutRange()
        return
      }
      if (mod && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        void handleCopyRange()
        return
      }
      if (mod && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        void handlePaste()
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        commitFormulaBar()
        moveSelection(1, 0)
        return
      }
      if (event.key === 'F2') {
        event.preventDefault()
        setInlineEditCell(selectedCell)
        setInlineDraft(formulaDraft)
        return
      }
      if (event.shiftKey && event.key === 'ArrowUp') {
        event.preventDefault()
        moveSelection(-1, 0, true)
        return
      }
      if (event.shiftKey && event.key === 'ArrowDown') {
        event.preventDefault()
        moveSelection(1, 0, true)
        return
      }
      if (event.shiftKey && event.key === 'ArrowLeft') {
        event.preventDefault()
        moveSelection(0, -1, true)
        return
      }
      if (event.shiftKey && event.key === 'ArrowRight') {
        event.preventDefault()
        moveSelection(0, 1, true)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        moveSelection(-1, 0)
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        moveSelection(1, 0)
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        moveSelection(0, -1)
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        moveSelection(0, 1)
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        handleClearRange()
        return
      }
      if (event.key.length === 1 && !mod && !event.altKey) {
        setFormulaDraft(event.key === '=' ? '=' : event.key)
        formulaInputRef.current?.focus()
      }
    },
    [
      inlineEditCell,
      handleUndo,
      handleRedo,
      handleCutRange,
      handleCopyRange,
      handlePaste,
      commitFormulaBar,
      moveSelection,
      selectedCell,
      formulaDraft,
      handleClearRange,
    ],
  )

  const handleCellMouseDown = useCallback(
    (event: MouseEvent<HTMLTableCellElement>, cellId: string) => {
      if (event.button !== 0) return
      const coords = parseCellId(cellId)
      if (!coords) return
      isDragSelectingRef.current = true
      dragAnchorRef.current = coords
      if (event.shiftKey) {
        setSelection((prev) => extendSelection(prev.anchor, coords))
        syncFormulaFromSelection(extendSelection(selectionRef.current.anchor, coords))
      } else {
        setSelection({ anchor: coords, focus: coords })
        syncFormulaFromSelection({ anchor: coords, focus: coords })
      }
    },
    [syncFormulaFromSelection],
  )

  const handleCellMouseEnter = useCallback(
    (cellId: string) => {
      if (!isDragSelectingRef.current || !dragAnchorRef.current) return
      const coords = parseCellId(cellId)
      if (!coords) return
      setSelection(extendSelection(dragAnchorRef.current, coords))
    },
    [],
  )

  useEffect(() => {
    const stopDrag = () => {
      isDragSelectingRef.current = false
      dragAnchorRef.current = null
    }
    window.addEventListener('mouseup', stopDrag)
    return () => window.removeEventListener('mouseup', stopDrag)
  }, [])

  const handleConnect = useCallback(() => {
    const url = urlDraft.trim()
    const nextRange = rangeDraft.trim() || DEFAULT_SHEETS_RANGE
    if (!url) {
      window.alert('Google Sheets URL을 입력하세요.')
      return
    }
    onRangeChange(nextRange)
    onConnectUrl(url, nextRange)
    setOpenFilePanel(null)
  }, [onConnectUrl, onRangeChange, rangeDraft, urlDraft])

  const ingestFile = useCallback(
    (file: File | undefined) => {
      if (!file) return
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        window.alert('Excel(.xlsx, .xls) 또는 CSV 파일만 열 수 있습니다.')
        return
      }
      onOpenLocalFile(file)
      setOpenFilePanel(null)
    },
    [onOpenLocalFile],
  )

  const handleFileInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      ingestFile(event.target.files?.[0])
      event.target.value = ''
    },
    [ingestFile],
  )

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setDragOver(false)
      ingestFile(event.dataTransfer.files?.[0])
    },
    [ingestFile],
  )

  const exportName =
    linkedFileName ??
    (linkedSpreadsheetId ? `sheet-${linkedSpreadsheetId}` : 'export')

  const shellCls = fullscreen
    ? 'fixed inset-0 z-[120]'
    : 'h-full min-h-[480px] lg:min-h-0'

  const statusLabel = preview?.ok
    ? preview.source === 'local_file'
      ? `${preview.rowCount ?? 0}행 · 로컬`
      : preview.source === 'oauth'
        ? `${preview.rowCount ?? 0}행 · Google`
        : `${preview.rowCount ?? 0}행 · 서비스 계정`
    : '100%'

  const multiSelect = !isSingleCell(selection)

  return (
    <div
      className={`tool-call-result-sidebar-inner with-drag-resize flex min-h-0 flex-1 flex-col ${shellCls}`}
    >
      <div className="global-canvas sheets-global-canvas sheets-new-global-canvas flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-[#d1d1d1] bg-white shadow-none dark:border-stone-700 dark:bg-[#1e1e1e]">
        <div className="gc-qat-bar dark:border-stone-700 dark:bg-[#2b2b2b]">
          <QatButton
            icon={<IconFileOpen className="h-[18px] w-[18px]" />}
            onClick={() => {
              setOpenFilePanel((current) => (current ? null : 'local'))
            }}
          >
            파일 열기
          </QatButton>
          <QatButton
            icon={<IconExport className="h-[18px] w-[18px]" />}
            onClick={() =>
              exportCsvFromGrid(rawGrid, exportName.replace(/\.(xlsx|xls|csv)$/i, ''))
            }
          >
            내보내기
          </QatButton>
          <QatButton
            icon={
              fullscreen ? (
                <IconFullscreenExit className="h-[18px] w-[18px]" />
              ) : (
                <IconFullscreen className="h-[18px] w-[18px]" />
              )
            }
            onClick={() => setFullscreen((v) => !v)}
          >
            {fullscreen ? '전체 화면 종료' : '전체 화면'}
          </QatButton>
          <QatButton
            icon={<IconGoogleSheets className="h-[18px] w-[18px]" />}
            onClick={() => {
              setOpenFilePanel('google')
              setUrlDraft(linkedSpreadsheetUrl ?? '')
              setRangeDraft(range)
            }}
          >
            Google Sheets
          </QatButton>
          {hasLinkedSource ? (
            <button
              type="button"
              onClick={() => {
                loadedPreviewKeyRef.current = ''
                onDisconnect()
              }}
              className="gc-qat-btn ml-auto text-[#a4262c] hover:border-[#f1bbbc] hover:bg-[#fde7e9]"
            >
              <span className="gc-qat-btn-icon">
                <IconLinkOff className="h-[18px] w-[18px]" />
              </span>
              연결 해제
            </button>
          ) : null}
        </div>

        {openFilePanel ? (
          <div className="shrink-0 border-b border-[#edebe9] bg-[#faf9f8] px-4 py-3 dark:border-stone-700 dark:bg-stone-900">
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => setOpenFilePanel('local')}
                className={`rounded-[2px] px-3 py-1 text-[13px] ${
                  openFilePanel === 'local'
                    ? 'bg-[#107c41] text-white'
                    : 'border border-[#c8c6c4] bg-white text-[#323130]'
                }`}
              >
                Excel / CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenFilePanel('google')
                  setUrlDraft(linkedSpreadsheetUrl ?? '')
                  setRangeDraft(range)
                }}
                className={`inline-flex items-center gap-1.5 rounded-[2px] px-3 py-1 text-[13px] ${
                  openFilePanel === 'google'
                    ? 'bg-[#107c41] text-white'
                    : 'border border-[#c8c6c4] bg-white text-[#323130]'
                }`}
              >
                <IconGoogleSheets className="h-4 w-4" />
                Google Sheets
              </button>
              <button
                type="button"
                onClick={() => setOpenFilePanel(null)}
                className="ml-auto text-[13px] text-[#605e5c] hover:text-[#323130]"
              >
                닫기
              </button>
            </div>
            {openFilePanel === 'local' ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`rounded border-2 border-dashed px-4 py-6 text-center transition ${
                  dragOver
                    ? 'border-[#217346] bg-[#e7f4ec]'
                    : 'border-[#c8c6c4] bg-white dark:border-stone-600 dark:bg-stone-950'
                }`}
              >
                <div
                  className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[2px] text-white"
                  style={{ backgroundColor: EXCEL_GREEN }}
                >
                  <IconUpload className="h-6 w-6" />
                </div>
                <p className="text-[13px] font-medium text-[#323130] dark:text-stone-200">
                  Excel 또는 CSV 파일을 여기에 놓으세요
                </p>
                <p className="mt-1 text-[11px] text-[#605e5c] dark:text-stone-400">
                  .xlsx · .xls · .csv
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 rounded-[2px] px-4 py-1.5 text-[12px] font-medium text-white"
                  style={{ backgroundColor: EXCEL_GREEN }}
                >
                  파일 선택
                </button>
              </div>
            ) : (
              <>
                <p className="mb-2 text-[12px] font-semibold text-[#323130] dark:text-stone-300">
                  Google Sheets URL
                </p>
                <input
                  type="url"
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…/edit"
                  className="mb-2 w-full rounded-[2px] border border-[#8a8886] bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-[#217346] focus:ring-1 focus:ring-[#217346]/25 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                />
                <input
                  type="text"
                  value={rangeDraft}
                  onChange={(e) => setRangeDraft(e.target.value)}
                  placeholder={`범위 (예: ${DEFAULT_SHEETS_RANGE})`}
                  className="mb-3 w-full rounded-[2px] border border-[#8a8886] bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-[#217346] dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleConnect}
                    className="rounded-[2px] px-3 py-1 text-[12px] font-medium text-white"
                    style={{ backgroundColor: EXCEL_GREEN }}
                  >
                    연결
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenFilePanel(null)}
                    className="rounded-[2px] border border-[#8a8886] px-3 py-1 text-[12px] text-[#323130] dark:border-stone-600 dark:text-stone-300"
                  >
                    취소
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          className="sr-only"
          onChange={handleFileInput}
        />

        <div className="new-spreadjs-canvas">
          <div className="spreadjs-interface">
            <div className="spreadsheet-designer-container">
              <div className="designer-host gc-designer-container ko">
                <div className="gc-designer-panel-container-vertical gc-designer-host">
                  <SheetsDesignerRibbon
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    onAction={handleRibbonAction}
                    styleState={focusStyle}
                    onStyleChange={applyStylePatch}
                  />

                  <div className="gc-formula-bar dark:border-stone-700 dark:bg-[#1e1e1e]">
                    <div className="gc-name-box dark:border-stone-700 dark:bg-[#2b2b2b] dark:text-stone-300">
                      {nameBoxLabel}
                    </div>
                    <div className="gc-formula-fx dark:border-stone-700">fx</div>
                    <input
                      ref={formulaInputRef}
                      value={previewLoading ? 'Loading…' : formulaDraft}
                      disabled={previewLoading}
                      onChange={(e) => setFormulaDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          commitFormulaBar()
                          gridWrapRef.current?.focus()
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          syncFormulaFromSelection(selectionRef.current)
                          gridWrapRef.current?.focus()
                        }
                      }}
                      onBlur={() => {
                        if (inlineEditCell) return
                        commitFormulaBar()
                      }}
                      className="gc-formula-input dark:text-stone-100"
                      aria-label="수식 입력줄"
                      spellCheck={false}
                    />
                    {!isLocalFile && linkedSpreadsheetId ? (
                      <div className="hidden shrink-0 items-center gap-1 border-l border-[#edebe9] px-2 sm:flex dark:border-stone-700">
                        <input
                          type="text"
                          value={range}
                          onChange={(e) => onRangeChange(e.target.value)}
                          onBlur={() => {
                            if (linkedSpreadsheetId && range.trim()) onRefresh?.()
                          }}
                          className="w-[9rem] rounded-[2px] border border-[#edebe9] bg-white px-1.5 py-0.5 text-[11px] dark:border-stone-600 dark:bg-stone-950"
                          aria-label="시트 범위"
                        />
                        <button
                          type="button"
                          disabled={previewLoading}
                          onClick={() => onRefresh?.()}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-[2px] text-white disabled:opacity-50"
                          style={{ backgroundColor: EXCEL_GREEN }}
                          aria-label="새로고침"
                        >
                          <IconRefresh className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div
                    ref={gridWrapRef}
                    tabIndex={0}
                    onKeyDown={handleGridKeyDown}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setContextMenu({ x: e.clientX, y: e.clientY })
                    }}
                    className="gc-sheet-grid-wrap dark:bg-[#1e1e1e]"
                  >
                    {previewLoading ? (
                      <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/85 text-[13px] text-[#605e5c] dark:bg-stone-950/85">
                        시트 불러오는 중…
                      </div>
                    ) : null}

                    {preview?.error ? (
                      <div className="absolute left-3 right-3 top-3 z-10 rounded-[2px] border border-[#f1bbbc] bg-[#fde7e9] px-3 py-2 text-[13px] text-[#442726] dark:border-red-900 dark:bg-red-950/50 dark:text-red-100">
                        {preview.error}
                      </div>
                    ) : null}

                    <table className="gc-sheet-grid">
                      <thead>
                        <tr>
                          <th className="gc-corner" />
                          {Array.from({ length: colCount }, (_, i) => (
                            <th key={COL_LABELS[i]}>{COL_LABELS[i]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {displayGrid.map((row, rowIndex) => (
                          <tr key={`r-${rowIndex}`}>
                            <th>{rowIndex + 1}</th>
                            {Array.from({ length: colCount }, (_, colIndex) => {
                              const cellId = `${COL_LABELS[colIndex]}${rowIndex + 1}`
                              const displayValue = row[colIndex] ?? ''
                              const inRange = isCellInRange(rowIndex, colIndex, selection)
                              const isActive =
                                selection.focus.row === rowIndex &&
                                selection.focus.col === colIndex
                              const editing = inlineEditCell === cellId
                              const style = getCellStyle(cellStyles, rowIndex, colIndex)
                              return (
                                <td
                                  key={cellId}
                                  onMouseDown={(e) => {
                                    e.preventDefault()
                                    handleCellMouseDown(e, cellId)
                                  }}
                                  onMouseEnter={() => handleCellMouseEnter(cellId)}
                                  onDoubleClick={() => {
                                    setInlineEditCell(cellId)
                                    setInlineDraft(
                                      getRawCell(rawGrid, rowIndex, colIndex),
                                    )
                                  }}
                                  className={`truncate ${inRange ? 'is-in-range' : ''} ${isActive ? 'is-selected' : ''} ${multiSelect && isActive ? 'is-range-active' : ''} ${editing ? 'is-editing' : ''}`}
                                  style={cssFromCellStyle(style)}
                                  title={
                                    getRawCell(rawGrid, rowIndex, colIndex) || displayValue
                                  }
                                >
                                  {editing ? (
                                    <input
                                      autoFocus
                                      className="gc-cell-editor"
                                      value={inlineDraft}
                                      onChange={(e) => setInlineDraft(e.target.value)}
                                      onKeyDown={(e) => {
                                        e.stopPropagation()
                                        if (e.key === 'Enter') {
                                          e.preventDefault()
                                          commitCellValue(rowIndex, colIndex, inlineDraft)
                                          setInlineEditCell(null)
                                          moveSelection(1, 0)
                                        }
                                        if (e.key === 'Escape') {
                                          e.preventDefault()
                                          setInlineEditCell(null)
                                          syncFormulaFromSelection(
                                            selectionFromCellId(cellId) ?? selection,
                                          )
                                        }
                                        if (e.key === 'Tab') {
                                          e.preventDefault()
                                          commitCellValue(rowIndex, colIndex, inlineDraft)
                                          setInlineEditCell(null)
                                          moveSelection(0, e.shiftKey ? -1 : 1)
                                        }
                                      }}
                                      onBlur={() => {
                                        commitCellValue(rowIndex, colIndex, inlineDraft)
                                        setInlineEditCell(null)
                                      }}
                                      spellCheck={false}
                                    />
                                  ) : (
                                    displayValue
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="gc-status-bar dark:border-stone-700 dark:bg-[#2b2b2b]">
                    <div className="gc-sheet-tabs dark:border-stone-700">
                      {sheetNames.length > 0 ? (
                        sheetNames.map((name) => {
                          const active = (activeSheetName ?? sheetNames[0]) === name
                          return (
                            <button
                              key={name}
                              type="button"
                              onClick={() => onSheetChange?.(name)}
                              className={`gc-sheet-tab dark:border-stone-700 ${
                                active
                                  ? 'is-active dark:bg-[#1e1e1e] dark:text-emerald-400'
                                  : 'dark:text-stone-400'
                              }`}
                            >
                              {name}
                            </button>
                          )
                        })
                      ) : (
                        <span className="gc-sheet-tab dark:text-stone-500">
                          {linkedFileName ?? (linkedSpreadsheetId ? 'Sheet1' : 'Sheet1')}
                        </span>
                      )}
                    </div>
                    <span className="gc-status-ready">Ready</span>
                    <span className="gc-status-meta dark:text-stone-400">
                      {multiSelect ? `${nameBoxLabel} · ` : ''}
                      {statusLabel}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {contextMenu ? (
        <SheetsContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onAction={handleContextMenuAction}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  )
}
