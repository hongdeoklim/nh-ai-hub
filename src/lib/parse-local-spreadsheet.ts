import * as XLSX from 'xlsx'

import type { GoogleSpreadsheetReadResult } from '../services/ai/google-sheets-preview'

export type LocalSpreadsheetWorkbook = {
  fileName: string
  sheetNames: string[]
  sheets: Record<string, string[][]>
}

function normalizeMatrix(raw: unknown[][]): string[][] {
  if (!raw.length) return [['']]
  const colCount = Math.max(...raw.map((row) => row.length), 1)
  return raw.map((row) => {
    const cells = Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : []
    while (cells.length < colCount) cells.push('')
    return cells
  })
}

function parseCsvText(text: string): string[][] {
  const workbook = XLSX.read(text, { type: 'string' })
  const sheetName = workbook.SheetNames[0] ?? 'Sheet1'
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return [['']]
  return normalizeMatrix(
    XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][],
  )
}

export function matrixToSheetPreview(
  fileName: string,
  sheetName: string,
  matrix: string[][],
): GoogleSpreadsheetReadResult {
  const safeMatrix = matrix.length > 0 ? matrix : [['']]
  const headers = safeMatrix[0].map(String)
  const body = safeMatrix.slice(1)

  return {
    ok: true,
    spreadsheetId: `local:${fileName}`,
    range: sheetName,
    rowCount: body.length,
    columnCount: Math.max(headers.length, ...safeMatrix.map((row) => row.length)),
    headers,
    matrix: safeMatrix,
    rows: body.map((row) => {
      const record: Record<string, string> = {}
      headers.forEach((header, index) => {
        const key = header.trim() || `Col${index + 1}`
        record[key] = String(row[index] ?? '')
      })
      return record
    }),
    source: 'local_file',
    message: `${fileName} · ${sheetName}`,
  }
}

export async function parseLocalSpreadsheetFile(
  file: File,
): Promise<{ workbook: LocalSpreadsheetWorkbook; preview: GoogleSpreadsheetReadResult }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  let workbook: XLSX.WorkBook
  if (ext === 'csv') {
    const text = await file.text()
    const matrix = parseCsvText(text)
    const sheetName = file.name.replace(/\.csv$/i, '') || 'Sheet1'
    const localWorkbook: LocalSpreadsheetWorkbook = {
      fileName: file.name,
      sheetNames: [sheetName],
      sheets: { [sheetName]: matrix },
    }
    return {
      workbook: localWorkbook,
      preview: matrixToSheetPreview(file.name, sheetName, matrix),
    }
  }

  const buffer = await file.arrayBuffer()
  workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

  const sheetNames = workbook.SheetNames.length
    ? workbook.SheetNames
    : ['Sheet1']

  const sheets: Record<string, string[][]> = {}
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) {
      sheets[name] = [['']]
      continue
    }
    sheets[name] = normalizeMatrix(
      XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: '',
        raw: false,
      }) as unknown[][],
    )
  }

  const firstSheet = sheetNames[0]
  const localWorkbook: LocalSpreadsheetWorkbook = {
    fileName: file.name,
    sheetNames,
    sheets,
  }

  return {
    workbook: localWorkbook,
    preview: matrixToSheetPreview(file.name, firstSheet, sheets[firstSheet]),
  }
}
