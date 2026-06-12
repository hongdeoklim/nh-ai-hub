import { cellIdFromCoords, parseCellId } from './sheet-formula'
import { COL_LABELS } from './sheet-grid'

export type CellCoords = { row: number; col: number }

export type SelectionRange = {
  anchor: CellCoords
  focus: CellCoords
}

export function normalizeRange(range: SelectionRange): {
  r0: number
  c0: number
  r1: number
  c1: number
} {
  return {
    r0: Math.min(range.anchor.row, range.focus.row),
    c0: Math.min(range.anchor.col, range.focus.col),
    r1: Math.max(range.anchor.row, range.focus.row),
    c1: Math.max(range.anchor.col, range.focus.col),
  }
}

export function isSingleCell(range: SelectionRange): boolean {
  const { r0, c0, r1, c1 } = normalizeRange(range)
  return r0 === r1 && c0 === c1
}

export function rangeToLabel(range: SelectionRange): string {
  const { r0, c0, r1, c1 } = normalizeRange(range)
  const start = cellIdFromCoords(r0, c0)
  if (r0 === r1 && c0 === c1) return start
  const end = cellIdFromCoords(r1, c1)
  return `${start}:${end}`
}

export function isCellInRange(
  row: number,
  col: number,
  range: SelectionRange,
): boolean {
  const { r0, c0, r1, c1 } = normalizeRange(range)
  return row >= r0 && row <= r1 && col >= c0 && col <= c1
}

export function selectionFromCellId(cellId: string): SelectionRange | null {
  const coords = parseCellId(cellId)
  if (!coords) return null
  return { anchor: coords, focus: coords }
}

export function extendSelection(
  anchor: CellCoords,
  focus: CellCoords,
): SelectionRange {
  return { anchor, focus }
}

export function iterateRange(
  range: SelectionRange,
  fn: (row: number, col: number) => void,
): void {
  const { r0, c0, r1, c1 } = normalizeRange(range)
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      fn(r, c)
    }
  }
}

export function coordsFromCellId(cellId: string): CellCoords | null {
  return parseCellId(cellId)
}

export function cellIdFromSelectionFocus(range: SelectionRange): string {
  return cellIdFromCoords(range.focus.row, range.focus.col)
}

export { COL_LABELS }
