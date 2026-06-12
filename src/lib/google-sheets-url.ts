import { extractGoogleDriveFileId } from './google-drive-url'

export const DEFAULT_SHEETS_RANGE = 'A1:Z100'

export type ParsedSheetsPromptInput = {
  spreadsheetId: string | null
  spreadsheetUrl: string | null
  range: string
  userMessage: string
}

const SHEETS_URL_RE =
  /https?:\/\/(?:docs\.google\.com\/spreadsheets\/[^\s]+|drive\.google\.com\/[^\s]*)/gi

const RANGE_HINT_RE = /(?:range|범위)\s*[:：]\s*([^\s\n]+)/i

/** Google Sheets URL 또는 본문에서 spreadsheetId·range 추출 */
export function parseSheetsPromptInput(text: string): ParsedSheetsPromptInput {
  const trimmed = text.trim()
  let spreadsheetId: string | null = null
  let spreadsheetUrl: string | null = null
  let range = DEFAULT_SHEETS_RANGE
  let working = trimmed

  const rangeMatch = working.match(RANGE_HINT_RE)
  if (rangeMatch?.[1]) {
    range = rangeMatch[1].trim()
    working = working.replace(rangeMatch[0], '').trim()
  }

  const urls = working.match(SHEETS_URL_RE) ?? []
  for (const url of urls) {
    const id = extractGoogleSpreadsheetId(url)
    if (id) {
      spreadsheetId = id
      spreadsheetUrl = url
      working = working.replace(url, '').trim()
      break
    }
  }

  if (!spreadsheetId) {
    const bareId = working.match(/\b([a-zA-Z0-9-_]{20,})\b/)
    if (bareId?.[1] && !bareId[1].includes('://')) {
      spreadsheetId = bareId[1]
      working = working.replace(bareId[1], '').trim()
    }
  }

  return {
    spreadsheetId,
    spreadsheetUrl,
    range,
    userMessage: working.replace(/\s{2,}/g, ' ').trim(),
  }
}

export function extractGoogleSpreadsheetId(raw: string): string | null {
  return extractGoogleDriveFileId(raw)
}

export function buildGoogleSheetsViewUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
}
