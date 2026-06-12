import { evaluateDisplay } from './sheet-formula'

export const DEFAULT_SHEET_ROWS = 50
export const DEFAULT_SHEET_COLS = 16
export const COL_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export function createEmptyGrid(
  rows = DEFAULT_SHEET_ROWS,
  cols = DEFAULT_SHEET_COLS,
): string[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ''),
  )
}

export function gridFromMatrix(matrix: string[][] | undefined | null): string[][] {
  if (!matrix?.length) return createEmptyGrid()
  const colWidth = Math.max(
    DEFAULT_SHEET_COLS,
    ...matrix.map((row) => row.length),
  )
  const grid = matrix.map((row) => {
    const padded = row.map(String)
    while (padded.length < colWidth) padded.push('')
    return padded.slice(0, 26)
  })
  while (grid.length < DEFAULT_SHEET_ROWS) {
    grid.push(Array.from({ length: colWidth }, () => ''))
  }
  return grid
}

export function cloneGrid(grid: string[][]): string[][] {
  return grid.map((row) => [...row])
}

export function getRawCell(grid: string[][], row: number, col: number): string {
  return String(grid[row]?.[col] ?? '')
}

export function getDisplayGrid(rawGrid: string[][]): string[][] {
  const getter = (row: number, col: number) => getRawCell(rawGrid, row, col)
  return rawGrid.map((row, rowIndex) =>
    row.map((cell, colIndex) => {
      const id = `${COL_LABELS[colIndex]}${rowIndex + 1}`
      return evaluateDisplay(cell, getter, new Set(), id)
    }),
  )
}

export function setCellRaw(
  grid: string[][],
  row: number,
  col: number,
  value: string,
): string[][] {
  const next = cloneGrid(grid)
  if (!next[row]) return next
  next[row][col] = value
  return next
}

export function clearRangeInGrid(
  grid: string[][],
  r0: number,
  c0: number,
  r1: number,
  c1: number,
): string[][] {
  const next = cloneGrid(grid)
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (next[r]) next[r][c] = ''
    }
  }
  return next
}

export function extractRangeFromGrid(
  grid: string[][],
  r0: number,
  c0: number,
  r1: number,
  c1: number,
): string[][] {
  const patch: string[][] = []
  for (let r = r0; r <= r1; r++) {
    const row: string[] = []
    for (let c = c0; c <= c1; c++) {
      row.push(getRawCell(grid, r, c))
    }
    patch.push(row)
  }
  return patch
}

export function rangeToClipboardText(patch: string[][]): string {
  return patch.map((row) => row.join('\t')).join('\n')
}

export function fillRangeFromAnchor(
  grid: string[][],
  range: { anchor: { row: number; col: number }; focus: { row: number; col: number } },
): string[][] {
  const next = cloneGrid(grid)
  const r0 = Math.min(range.anchor.row, range.focus.row)
  const r1 = Math.max(range.anchor.row, range.focus.row)
  const c0 = Math.min(range.anchor.col, range.focus.col)
  const c1 = Math.max(range.anchor.col, range.focus.col)
  const source = getRawCell(grid, range.anchor.row, range.anchor.col)
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (next[r]) next[r][c] = source
    }
  }
  return next
}

export function sortColumnInGrid(
  grid: string[][],
  col: number,
  r0: number,
  r1: number,
  direction: 'asc' | 'desc',
): string[][] {
  const next = cloneGrid(grid)
  const rows = next.slice(r0, r1 + 1)
  rows.sort((a, b) => {
    const av = a[col] ?? ''
    const bv = b[col] ?? ''
    const an = Number(av.replace(/,/g, ''))
    const bn = Number(bv.replace(/,/g, ''))
    const bothNumeric = Number.isFinite(an) && Number.isFinite(bn)
    const cmp = bothNumeric
      ? an - bn
      : av.localeCompare(bv, undefined, { numeric: true })
    return direction === 'asc' ? cmp : -cmp
  })
  for (let i = 0; i < rows.length; i++) {
    next[r0 + i] = rows[i]
  }
  return next
}

export function pasteIntoGrid(
  grid: string[][],
  startRow: number,
  startCol: number,
  patch: string[][],
): string[][] {
  const next = cloneGrid(grid)
  for (let r = 0; r < patch.length; r++) {
    for (let c = 0; c < patch[r].length; c++) {
      const tr = startRow + r
      const tc = startCol + c
      if (!next[tr]) continue
      next[tr][tc] = patch[r][c] ?? ''
    }
  }
  return next
}

export function gridToCsv(grid: string[][]): string {
  const trimmed = trimGrid(grid)
  return trimmed
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '')
          if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
          return s
        })
        .join(','),
    )
    .join('\n')
}

function trimGrid(grid: string[][]): string[][] {
  let maxRow = 0
  let maxCol = 0
  grid.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (String(cell).trim()) {
        maxRow = Math.max(maxRow, r)
        maxCol = Math.max(maxCol, c)
      }
    })
  })
  if (maxRow === 0 && maxCol === 0 && !grid[0]?.[0]) {
    return [['']]
  }
  return grid
    .slice(0, maxRow + 1)
    .map((row) => row.slice(0, maxCol + 1))
}
