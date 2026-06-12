import * as XLSX from 'xlsx'

import { gridToCsv } from './sheet-grid'

function hasExportableData(grid: string[][]): boolean {
  return grid.some((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
}

function normalizeBaseName(filename: string): string {
  return filename.replace(/\.(xlsx|xls|csv)$/i, '') || 'export'
}

export function downloadCsvFromGrid(grid: string[][], filename: string): boolean {
  if (!hasExportableData(grid)) {
    window.alert('?대낫???곗씠?곌? ?놁뒿?덈떎.')
    return false
  }
  const csv = gridToCsv(grid)
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${normalizeBaseName(filename)}.csv`
  a.click()
  URL.revokeObjectURL(url)
  return true
}

export function downloadXlsxFromGrid(
  grid: string[][],
  filename: string,
  sheetName = 'Sheet1',
): boolean {
  if (!hasExportableData(grid)) {
    window.alert('?대낫???곗씠?곌? ?놁뒿?덈떎.')
    return false
  }
  const worksheet = XLSX.utils.aoa_to_sheet(grid)
  const workbook = XLSX.utils.book_new()
  const safeSheetName = sheetName.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet1'
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName)
  XLSX.writeFile(workbook, `${normalizeBaseName(filename)}.xlsx`)
  return true
}

