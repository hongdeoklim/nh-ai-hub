import { JWT } from "npm:google-auth-library@9.15.1"

const GOOGLE_SHEETS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/spreadsheets.readonly"

type GoogleServiceAccountCredentials = {
  client_email?: string
  private_key?: string
}

export type GoogleSpreadsheetReadResult = {
  ok: boolean
  spreadsheetId?: string
  range?: string
  rowCount?: number
  columnCount?: number
  headers?: string[]
  rows?: Record<string, string>[]
  markdownTable?: string
  message?: string
  error?: string
}

export function isGoogleSpreadsheetReadConfigured(): boolean {
  return Boolean(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY")?.trim())
}

export async function getGoogleSheetsServiceAccountToken(): Promise<string | null> {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY")?.trim()
  if (!raw) return null

  try {
    const credentials = JSON.parse(raw) as GoogleServiceAccountCredentials
    const email = credentials.client_email?.trim()
    const key = credentials.private_key?.trim()
    if (!email || !key) return null

    const client = new JWT({
      email,
      key,
      scopes: [GOOGLE_SHEETS_READONLY_SCOPE],
    })

    const tokenResponse = await client.getAccessToken()
    return tokenResponse.token?.trim() ?? null
  } catch {
    return null
  }
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ")
}

function buildMarkdownTableFromRows(
  headers: string[],
  bodyRows: string[][],
): string {
  if (headers.length === 0) return ""

  const headerLine =
    `| ${headers.map((h) => escapeMarkdownTableCell(h)).join(" | ")} |`
  const separatorLine =
    `| ${headers.map(() => "---").join(" | ")} |`
  const dataLines = bodyRows.map((row) =>
    `| ${
      headers.map((_, index) =>
        escapeMarkdownTableCell(row[index] ?? "")
      ).join(" | ")
    } |`
  )

  return [headerLine, separatorLine, ...dataLines].join("\n")
}

export function parseSheetValuesToStructuredData(values: string[][]): {
  rowCount: number
  columnCount: number
  headers: string[]
  rows: Record<string, string>[]
  markdownTable: string
} {
  const normalized = values.map((row) =>
    row.map((cell) => String(cell ?? ""))
  )

  if (normalized.length === 0) {
    return {
      rowCount: 0,
      columnCount: 0,
      headers: [],
      rows: [],
      markdownTable: "",
    }
  }

  const headerCells = normalized[0] ?? []
  const dataMatrix = normalized.slice(1)
  const columnCount = Math.max(
    headerCells.length,
    ...normalized.map((row) => row.length),
    0,
  )

  const headers = Array.from({ length: columnCount }, (_, index) => {
    const header = headerCells[index]?.trim()
    return header && header.length > 0 ? header : `Col${index + 1}`
  })

  const bodyRows = (dataMatrix.length > 0 ? dataMatrix : [headerCells]).map(
    (row) => headers.map((_, index) => row[index] ?? ""),
  )

  const rows = bodyRows.map((row) => {
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      record[header] = row[index] ?? ""
    })
    return record
  })

  return {
    rowCount: bodyRows.length,
    columnCount: headers.length,
    headers,
    rows,
    markdownTable: buildMarkdownTableFromRows(headers, bodyRows),
  }
}

export async function readGoogleSpreadsheetValues(input: {
  spreadsheetId: string
  range: string
  accessToken?: string | null
}): Promise<GoogleSpreadsheetReadResult> {
  const spreadsheetId = input.spreadsheetId?.trim()
  const range = input.range?.trim()

  if (!spreadsheetId || !range) {
    return { ok: false, error: "spreadsheetId와 range는 필수입니다." }
  }

  const accessToken = input.accessToken?.trim() ||
    await getGoogleSheetsServiceAccountToken()

  if (!accessToken) {
    return {
      ok: false,
      spreadsheetId,
      range,
      rows: [],
      markdownTable: "",
      message: "Google Sheets 인증 실패 (OAuth 또는 서비스 계정)",
    }
  }

  try {
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    })

    const payload = await response.json().catch(() => ({})) as {
      values?: unknown
      error?: { message?: string }
    }

    if (!response.ok) {
      const apiMessage = typeof payload.error?.message === "string"
        ? payload.error.message
        : `Google Sheets API HTTP ${response.status}`
      return { ok: false, spreadsheetId, range, error: apiMessage }
    }

    const rawValues = Array.isArray(payload.values) ? payload.values : []
    const values = rawValues.map((row) =>
      Array.isArray(row)
        ? row.map((cell) => String(cell ?? ""))
        : [String(row ?? "")]
    )

    if (values.length === 0) {
      return {
        ok: true,
        spreadsheetId,
        range,
        rowCount: 0,
        columnCount: 0,
        headers: [],
        rows: [],
        markdownTable: "",
        message: "지정 범위에 데이터가 없습니다.",
      }
    }

    const structured = parseSheetValuesToStructuredData(values)

    return {
      ok: true,
      spreadsheetId,
      range,
      ...structured,
      message:
        `${structured.rowCount}행 × ${structured.columnCount}열 조회 완료`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, spreadsheetId, range, error: message }
  }
}
