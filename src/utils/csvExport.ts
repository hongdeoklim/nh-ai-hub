const CSV_BOM = '\uFEFF'

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim()
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  return inner.split('|').map((cell) => cell.trim())
}

function isMarkdownTableSeparatorRow(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim())
}

function isMarkdownTableLine(line: string): boolean {
  const t = line.trim()
  return /^\|?.+\|.+/.test(t) || isMarkdownTableSeparatorRow(t)
}

export function parseMarkdownTable(content: string): string[][] | null {
  const lines = content
    .trim()
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)

  const tableLines = lines.filter(isMarkdownTableLine)
  if (tableLines.length < 2) return null

  const rows: string[][] = []
  for (const line of tableLines) {
    if (isMarkdownTableSeparatorRow(line)) continue
    rows.push(splitMarkdownTableRow(line))
  }

  return rows.length > 0 ? rows : null
}

export function parseHtmlTable(content: string): string[][] | null {
  if (!/<table[\s>]/i.test(content)) return null

  const parser = new DOMParser()
  const doc = parser.parseFromString(content, 'text/html')
  const table = doc.querySelector('table')
  if (!table) return null

  const rows: string[][] = []
  table.querySelectorAll('tr').forEach((tr) => {
    const cells = [...tr.querySelectorAll('th, td')]
    if (cells.length === 0) return
    rows.push(cells.map((cell) => (cell.textContent ?? '').trim()))
  })

  return rows.length > 0 ? rows : null
}

export function parseTableToGrid(content: string): string[][] | null {
  const trimmed = content.trim()
  if (!trimmed) return null

  if (/<table[\s>]/i.test(trimmed)) {
    const htmlGrid = parseHtmlTable(trimmed)
    if (htmlGrid) return htmlGrid
  }

  return parseMarkdownTable(trimmed)
}

export function contentContainsTable(content: string): boolean {
  return parseTableToGrid(content) !== null
}

function escapeCsvCell(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`
  }
  return normalized
}

export function gridToCsvString(grid: string[][]): string {
  return grid.map((row) => row.map(escapeCsvCell).join(',')).join('\n')
}

export function sanitizeCsvFilename(title: string): string {
  const base = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  const safe = base.length > 0 ? base : '표_데이터'
  return safe.toLowerCase().endsWith('.csv') ? safe : `${safe}.csv`
}

export function downloadCsvFile(filename: string, csvBody: string): void {
  const blob = new Blob([`${CSV_BOM}${csvBody}`], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = sanitizeCsvFilename(filename)
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function exportTableContentAsCsv(
  content: string,
  filename: string,
): boolean {
  const grid = parseTableToGrid(content)
  if (!grid) return false
  const csv = gridToCsvString(grid)
  downloadCsvFile(filename, csv)
  return true
}
