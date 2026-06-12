/**
 * Google Calendar / Sheets API 호출 코어 (google-agent Edge · ai-chat 도구 공용)
 */

export type ManageCalendarInput = {
  summary: string
  description?: string
  startTime: string
  endTime: string
  calendarId?: string
}

export type UpdateSpreadsheetInput = {
  spreadsheetId: string
  range: string
  values: unknown[]
}

export async function googleAgentFetch(
  accessToken: string,
  url: string,
  init?: RequestInit,
): Promise<
  | { ok: true; body: unknown }
  | { ok: false; status: number; body: unknown }
> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${accessToken}`,
    },
  })
  const text = await res.text()
  let parsed: unknown = text
  try {
    parsed = text.length ? JSON.parse(text) : null
  } catch {
    /* raw text */
  }
  if (!res.ok) {
    return { ok: false, status: res.status, body: parsed }
  }
  return { ok: true, body: parsed }
}

export async function manageCalendarEvent(
  accessToken: string,
  input: ManageCalendarInput,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; error: string; detail?: unknown }
> {
  const calendarId = encodeURIComponent(input.calendarId?.trim() || "primary")
  const summary = input.summary.trim()
  const startTime = input.startTime.trim()
  const endTime = input.endTime.trim()

  if (!summary.length || !startTime.length || !endTime.length) {
    return {
      ok: false,
      error: "summary, startTime, endTime 은 필수입니다.",
    }
  }

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`

  const r = await googleAgentFetch(accessToken, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      summary,
      description: input.description?.trim() || undefined,
      start: { dateTime: startTime },
      end: { dateTime: endTime },
    }),
  })

  if (!r.ok) {
    return {
      ok: false,
      error: "Google Calendar 일정 등록에 실패했습니다.",
      detail: r.body,
    }
  }

  return { ok: true, data: r.body }
}

function normalizeSheetValues(raw: unknown[]): unknown[][] {
  if (raw.length === 0) return [[]]
  if (Array.isArray(raw[0])) {
    return raw as unknown[][]
  }
  return [raw]
}

export async function updateSpreadsheetAppend(
  accessToken: string,
  input: UpdateSpreadsheetInput,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; error: string; detail?: unknown }
> {
  const spreadsheetId = input.spreadsheetId.trim()
  const range = input.range.trim() || "Sheet1!A1"

  if (!spreadsheetId.length) {
    return { ok: false, error: "spreadsheetId 가 필요합니다." }
  }

  const values = normalizeSheetValues(input.values)
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`

  const r = await googleAgentFetch(accessToken, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  })

  if (!r.ok) {
    return {
      ok: false,
      error: "Google Sheets 데이터 추가에 실패했습니다.",
      detail: r.body,
    }
  }

  return { ok: true, data: r.body }
}
