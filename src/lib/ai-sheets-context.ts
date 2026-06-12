export const AI_SHEETS_CONTEXT_PREFIX = 'nh-ai-hub.ai-sheets-context.v1.'

export type AiSheetsThreadContext = {
  spreadsheetId: string
  range: string
  spreadsheetUrl?: string
  title?: string
  preview?: {
    ok: boolean
    headers?: string[]
    rows?: Record<string, string>[]
    matrix?: string[][]
    rowCount?: number
    columnCount?: number
    error?: string
    message?: string
    source?: 'oauth' | 'service_account' | 'local_file'
  } | null
  fileName?: string
  source?: 'google' | 'local'
}

export function aiSheetsContextKey(threadId: string) {
  return `${AI_SHEETS_CONTEXT_PREFIX}${threadId}`
}

export function readAiSheetsContext(
  threadId: string,
): AiSheetsThreadContext | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(aiSheetsContextKey(threadId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as AiSheetsThreadContext
    if (!parsed?.spreadsheetId?.trim()) return null
    return {
      ...parsed,
      spreadsheetId: parsed.spreadsheetId.trim(),
      range: parsed.range?.trim() || 'A1:Z100',
    }
  } catch {
    return null
  }
}

export function writeAiSheetsContext(
  threadId: string,
  context: AiSheetsThreadContext,
) {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(aiSheetsContextKey(threadId), JSON.stringify(context))
}

export function updateAiSheetsContextPreview(
  threadId: string,
  preview: AiSheetsThreadContext['preview'],
) {
  const current = readAiSheetsContext(threadId)
  if (!current) return
  writeAiSheetsContext(threadId, { ...current, preview })
}

export function clearAiSheetsContext(threadId: string) {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(aiSheetsContextKey(threadId))
}
