/**
 * AI 채팅용 Google Workspace agent 도구 (google-agent Edge Function 호출)
 */
import { tool, zodSchema } from "npm:ai@6.0.184"
import { z } from "npm:zod@4.4.3"

export const GOOGLE_AGENT_TOOL_NAMES = [
  "google_add_calendar",
  "google_append_sheets",
] as const

export type GoogleAgentToolName = (typeof GOOGLE_AGENT_TOOL_NAMES)[number]

type CreateGoogleWorkspaceAgentToolsDeps = {
  supabaseUrl: string
  anonKey: string
  userJwt: string
}

async function invokeGoogleAgent(
  deps: CreateGoogleWorkspaceAgentToolsDeps,
  action: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = `${deps.supabaseUrl.replace(/\/$/, "")}/functions/v1/google-agent`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deps.userJwt}`,
      apikey: deps.anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, payload }),
  })

  const text = await res.text()
  let parsed: Record<string, unknown> = {}
  try {
    parsed = text.length ? JSON.parse(text) : {}
  } catch {
    parsed = { ok: false, error: text || `HTTP ${res.status}` }
  }

  if (!res.ok) {
    return {
      ok: false,
      error:
        typeof parsed.error === "string"
          ? parsed.error
          : `google-agent HTTP ${res.status}`,
      detail: parsed.detail,
    }
  }

  return parsed
}

export function createGoogleWorkspaceAgentTools(
  deps: CreateGoogleWorkspaceAgentToolsDeps,
) {
  const google_add_calendar = tool({
    description:
      "Google Calendar(primary)에 일정을 등록합니다. 사용자가 Google Workspace 연동을 완료한 경우에만 사용하세요.",
    inputSchema: zodSchema(
      z.object({
        summary: z.string().min(1).describe("일정 제목"),
        description: z.string().optional().describe("일정 설명·메모"),
        startTime: z
          .string()
          .min(1)
          .describe("시작 시각 (ISO 8601, 예: 2026-05-20T14:00:00+09:00)"),
        endTime: z
          .string()
          .min(1)
          .describe("종료 시각 (ISO 8601, 예: 2026-05-20T15:00:00+09:00)"),
      }),
    ),
    execute: async ({ summary, description, startTime, endTime }) => {
      return invokeGoogleAgent(deps, "manage_calendar", {
        summary,
        description,
        startTime,
        endTime,
      })
    },
  })

  const google_append_sheets = tool({
    description:
      "Google Sheets 스프레드시트에 한 행(또는 여러 행) 데이터를 append 합니다. spreadsheetId는 URL의 /d/{id}/ 부분입니다.",
    inputSchema: zodSchema(
      z.object({
        spreadsheetId: z.string().min(1).describe("스프레드시트 ID"),
        range: z
          .string()
          .min(1)
          .describe("시트 범위 (예: Sheet1!A1 또는 업무대장!A:C)"),
        values: z
          .array(z.union([z.string(), z.number(), z.boolean()]))
          .min(1)
          .describe("추가할 한 행의 셀 값 배열 (예: [\"홍길동\", 100, \"완료\"])"),
      }),
    ),
    execute: async ({ spreadsheetId, range, values }) => {
      return invokeGoogleAgent(deps, "update_spreadsheet", {
        spreadsheetId,
        range,
        values,
      })
    },
  })

  return {
    google_add_calendar,
    google_append_sheets,
  } as const
}

export function isGoogleAgentToolName(name: string): name is GoogleAgentToolName {
  return (GOOGLE_AGENT_TOOL_NAMES as readonly string[]).includes(name)
}
