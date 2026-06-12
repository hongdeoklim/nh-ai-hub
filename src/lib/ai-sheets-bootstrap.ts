export const AI_SHEETS_BOOTSTRAP_PREFIX = 'nh-ai-hub.ai-sheets-bootstrap.v1.'

export type AiSheetsBootstrapPayload = {
  prompt: string
  selectedModel?: string
  autoSend?: boolean
  spreadsheetId?: string
  range?: string
  spreadsheetUrl?: string
}

export function aiSheetsBootstrapKey(threadId: string) {
  return `${AI_SHEETS_BOOTSTRAP_PREFIX}${threadId}`
}

export function readAiSheetsBootstrap(
  threadId: string,
): AiSheetsBootstrapPayload | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(aiSheetsBootstrapKey(threadId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as AiSheetsBootstrapPayload
    if (!parsed || typeof parsed.prompt !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function writeAiSheetsBootstrap(
  threadId: string,
  payload: AiSheetsBootstrapPayload,
) {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(aiSheetsBootstrapKey(threadId), JSON.stringify(payload))
}

export function clearAiSheetsBootstrap(threadId: string) {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(aiSheetsBootstrapKey(threadId))
}

export function buildAiSheetsAgentPrompt(
  topic: string,
  ctx?: {
    spreadsheetId?: string
    range?: string
  },
): string {
  const trimmed = topic.trim()
  const lines = [
    '[AI Sheets 에이전트]',
    'Google Sheets 데이터를 조회·분석·요약·시각화 제안까지 수행하세요.',
    '시트 원본이 필요하면 read_google_spreadsheet 도구로 spreadsheetId와 range를 지정해 조회하세요.',
    '표에 없는 수치는 추측하지 마세요.',
  ]

  if (ctx?.spreadsheetId?.trim()) {
    lines.push('')
    if (ctx.spreadsheetId.startsWith('local:')) {
      lines.push('데이터 소스: 사용자가 업로드한 로컬 Excel/CSV 파일')
      lines.push(`fileName: ${ctx.spreadsheetId.replace(/^local:/, '')}`)
    } else {
      lines.push(`spreadsheetId: ${ctx.spreadsheetId.trim()}`)
    }
    lines.push(`range: ${ctx.range?.trim() || 'A1:Z100'}`)
  }

  lines.push('')
  lines.push(`사용자 요청: ${trimmed}`)

  return lines.join('\n')
}
