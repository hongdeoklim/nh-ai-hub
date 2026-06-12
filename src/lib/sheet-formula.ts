const COL_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function parseCellId(cellId: string): { row: number; col: number } | null {
  const match = /^([A-Z]+)(\d+)$/i.exec(cellId.trim())
  if (!match) return null
  const letters = match[1].toUpperCase()
  let col = 0
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64)
  }
  const row = parseInt(match[2], 10)
  if (!Number.isFinite(row) || row < 1 || col < 1) return null
  return { row: row - 1, col: col - 1 }
}

export function cellIdFromCoords(row: number, col: number): string {
  let n = col + 1
  let letters = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    letters = COL_LABELS[rem] + letters
    n = Math.floor((n - 1) / 26)
  }
  return `${letters}${row + 1}`
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function expandRange(
  range: string,
  getRaw: (row: number, col: number) => string,
  visiting: Set<string>,
): number[] {
  const parts = range.split(':')
  if (parts.length !== 2) return []
  const start = parseCellId(parts[0])
  const end = parseCellId(parts[1])
  if (!start || !end) return []
  const nums: number[] = []
  const r0 = Math.min(start.row, end.row)
  const r1 = Math.max(start.row, end.row)
  const c0 = Math.min(start.col, end.col)
  const c1 = Math.max(start.col, end.col)
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const id = cellIdFromCoords(r, c)
      const display = evaluateDisplay(getRaw(r, c), getRaw, visiting, id)
      const n = parseNumber(display)
      if (n != null) nums.push(n)
    }
  }
  return nums
}

function evalExpression(
  expr: string,
  getRaw: (row: number, col: number) => string,
  visiting: Set<string>,
  selfId: string,
): string {
  const fnSum = /^SUM\(([^)]+)\)$/i.exec(expr)
  if (fnSum) {
    const nums = expandRange(fnSum[1].replace(/\$/g, ''), getRaw, visiting)
    if (!nums.length) return '0'
    return String(nums.reduce((a, b) => a + b, 0))
  }

  const fnAvg = /^AVERAGE\(([^)]+)\)$/i.exec(expr)
  if (fnAvg) {
    const nums = expandRange(fnAvg[1].replace(/\$/g, ''), getRaw, visiting)
    if (!nums.length) return '0'
    return String(nums.reduce((a, b) => a + b, 0) / nums.length)
  }

  const fnCount = /^COUNT\(([^)]+)\)$/i.exec(expr)
  if (fnCount) {
    const nums = expandRange(fnCount[1].replace(/\$/g, ''), getRaw, visiting)
    return String(nums.length)
  }

  const fnMax = /^MAX\(([^)]+)\)$/i.exec(expr)
  if (fnMax) {
    const nums = expandRange(fnMax[1].replace(/\$/g, ''), getRaw, visiting)
    if (!nums.length) return '0'
    return String(Math.max(...nums))
  }

  const fnMin = /^MIN\(([^)]+)\)$/i.exec(expr)
  if (fnMin) {
    const nums = expandRange(fnMin[1].replace(/\$/g, ''), getRaw, visiting)
    if (!nums.length) return '0'
    return String(Math.min(...nums))
  }

  // A1+B1 or simple arithmetic with cell refs and numbers
  const replaced = expr.replace(
    /\$?([A-Z]+\d+)/gi,
    (ref) => {
      const coords = parseCellId(ref.replace(/\$/g, ''))
      if (!coords) return '0'
      const id = cellIdFromCoords(coords.row, coords.col)
      if (id === selfId) return '0'
      const v = evaluateDisplay(getRaw(coords.row, coords.col), getRaw, visiting, id)
      const n = parseNumber(v)
      return n != null ? String(n) : '0'
    },
  )

  if (!/^[\d+\-*/().\s]+$/.test(replaced)) return '#ERROR!'
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${replaced});`)()
    if (typeof result === 'number' && Number.isFinite(result)) {
      return String(Math.round(result * 1e9) / 1e9)
    }
    return '#ERROR!'
  } catch {
    return '#ERROR!'
  }
}

export function evaluateDisplay(
  raw: string,
  getRaw: (row: number, col: number) => string,
  visiting: Set<string> = new Set(),
  selfId = '',
): string {
  const text = String(raw ?? '')
  if (!text.startsWith('=')) return text
  if (visiting.has(selfId)) return '#REF!'
  visiting.add(selfId)
  const body = text.slice(1).trim()
  const result = evalExpression(body, getRaw, visiting, selfId)
  visiting.delete(selfId)
  return result
}

export function parseClipboardGrid(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows = normalized.split('\n').filter((row, index, arr) => {
    if (index < arr.length - 1) return true
    return row.length > 0
  })
  return rows.map((row) => row.split('\t'))
}
