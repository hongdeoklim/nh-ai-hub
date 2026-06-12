import { supabase } from '../../lib/supabase'
import { invokeGoogleWorkspaceApi } from '../integrations/workspace-tools'

export type GoogleSpreadsheetReadResult = {
  ok: boolean
  spreadsheetId?: string
  range?: string
  rowCount?: number
  columnCount?: number
  headers?: string[]
  rows?: Record<string, string>[]
  /** 원본 2차원 배열 (헤더 포함) */
  matrix?: string[][]
  markdownTable?: string
  message?: string
  error?: string
  source?: 'oauth' | 'service_account' | 'local_file'
}

type OAuthValuesResponse = {
  ok?: boolean
  data?: { values?: string[][] } | string
  error?: string
}

function extractValuesMatrix(payload: OAuthValuesResponse): string[][] | null {
  const data = payload?.data
  if (!data || typeof data === 'string') return null
  const values = data.values
  if (!Array.isArray(values) || values.length === 0) return null
  return values.map((row) =>
    Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : [],
  )
}

function resultFromMatrix(
  spreadsheetId: string,
  range: string,
  matrix: string[][],
  source: 'oauth' | 'service_account',
): GoogleSpreadsheetReadResult {
  const headers = (matrix[0] ?? []).map(String)
  const body = matrix.slice(1)
  return {
    ok: true,
    spreadsheetId,
    range,
    rowCount: body.length,
    columnCount: headers.length,
    headers,
    matrix,
    rows: body.map((row) => {
      const record: Record<string, string> = {}
      headers.forEach((header, index) => {
        const key = header.trim() || `Col${index + 1}`
        record[key] = String(row[index] ?? '')
      })
      return record
    }),
    source,
    message: `${body.length}행 × ${headers.length}열`,
  }
}

/** OAuth(사용자 Google) 우선 → read-google-sheet Edge(서비스 계정 폴백) */
export async function fetchGoogleSheetPreview(
  spreadsheetId: string,
  range: string,
): Promise<GoogleSpreadsheetReadResult> {
  try {
    const oauth = await invokeGoogleWorkspaceApi<OAuthValuesResponse>(
      'sheets.getValues',
      { spreadsheetId, range },
    )
    const matrix = extractValuesMatrix(oauth)
    if (matrix) {
      return resultFromMatrix(spreadsheetId, range, matrix, 'oauth')
    }
    if (oauth?.error) {
      /* OAuth 연동은 됐지만 조회 실패 — 서비스 계정 폴백 시도 */
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('연동') && !msg.includes('401')) {
      /* ignore — fallback below */
    }
  }

  const { data, error } = await supabase.functions.invoke('read-google-sheet', {
    body: { spreadsheetId, range },
  })

  if (error) {
    return {
      ok: false,
      spreadsheetId,
      range,
      error:
        error.message ||
        '시트를 불러오지 못했습니다. Google 연동 또는 서비스 계정 공유를 확인하세요.',
    }
  }

  const result = data as GoogleSpreadsheetReadResult
  if (result?.ok && result.headers?.length && !result.matrix) {
    const headerRow = result.headers
    const bodyRows = (result.rows ?? []).map((row) =>
      headerRow.map((header) => row[header] ?? ''),
    )
    return {
      ...result,
      matrix: [headerRow, ...bodyRows],
      source: 'service_account',
    }
  }

  return {
    ...result,
    source: result.ok ? 'service_account' : result.source,
    error:
      result.error ||
      (result.ok
        ? undefined
        : '시트 데이터가 비어 있거나 접근 권한이 없습니다.'),
  }
}
