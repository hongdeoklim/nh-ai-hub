/**
 * Google Workspace Agent Edge Function
 *
 * AI tool calling 백엔드 — Calendar 일정 등록 · Sheets 행 추가
 *
 * 환경 변수 (Supabase Dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET
 *     (미설정 시 GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET 재사용)
 *   INTEGRATION_CREDENTIALS_SECRET — 기존 OAuth 연동 refresh 복호화
 *
 * 요청 본문:
 *   { "action": "manage_calendar" | "update_spreadsheet", "payload": { ... } }
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createClient } from "npm:@supabase/supabase-js@2.49.8"

import {
  manageCalendarEvent,
  updateSpreadsheetAppend,
} from "../_shared/google-agent-core.ts"
import { getValidGoogleAgentAccessToken } from "../_shared/google-agent-token.ts"

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

type GoogleAgentBody = {
  action?: string
  payload?: Record<string, unknown>
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "POST 만 허용됩니다." }, 405)
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ ok: false, error: "인증이 필요합니다." }, 401)
  }

  const supabaseUrl = readEnv("SUPABASE_URL")
  const anonKey = readEnv("SUPABASE_ANON_KEY")
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ ok: false, error: "서버 설정 오류" }, 500)
  }

  const jwt = authHeader.replace(/^Bearer\s+/i, "")
  const supabaseUser = createClient(supabaseUrl, anonKey)
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return jsonResponse({ ok: false, error: "세션이 유효하지 않습니다." }, 401)
  }

  const userId = userData.user.id
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let body: GoogleAgentBody
  try {
    body = (await req.json()) as GoogleAgentBody
  } catch {
    return jsonResponse({ ok: false, error: "JSON 본문이 필요합니다." }, 400)
  }

  const action = typeof body.action === "string" ? body.action.trim() : ""
  const payload = body.payload ?? {}

  if (action !== "manage_calendar" && action !== "update_spreadsheet") {
    return jsonResponse(
      {
        ok: false,
        error: "action 은 manage_calendar 또는 update_spreadsheet 이어야 합니다.",
      },
      400,
    )
  }

  const tokenResult = await getValidGoogleAgentAccessToken(admin, userId)
  if (!tokenResult.ok) {
    return jsonResponse({ ok: false, error: tokenResult.error }, 403)
  }

  const accessToken = tokenResult.accessToken

  if (action === "manage_calendar") {
    const summary = typeof payload.summary === "string" ? payload.summary : ""
    const description =
      typeof payload.description === "string" ? payload.description : undefined
    const startTime =
      typeof payload.startTime === "string"
        ? payload.startTime
        : typeof payload.start === "string"
          ? payload.start
          : ""
    const endTime =
      typeof payload.endTime === "string"
        ? payload.endTime
        : typeof payload.end === "string"
          ? payload.end
          : ""
    const calendarId =
      typeof payload.calendarId === "string" ? payload.calendarId : undefined

    const result = await manageCalendarEvent(accessToken, {
      summary,
      description,
      startTime,
      endTime,
      calendarId,
    })

    if (!result.ok) {
      return jsonResponse(
        { ok: false, error: result.error, detail: result.detail },
        400,
      )
    }

    return jsonResponse({
      ok: true,
      action,
      message: "Google Calendar 일정이 등록되었습니다.",
      data: result.data,
    })
  }

  const spreadsheetId =
    typeof payload.spreadsheetId === "string" ? payload.spreadsheetId : ""
  const range = typeof payload.range === "string" ? payload.range : "Sheet1!A1"
  const values = Array.isArray(payload.values) ? payload.values : null

  if (!values) {
    return jsonResponse(
      { ok: false, error: "payload.values (배열) 가 필요합니다." },
      400,
    )
  }

  const result = await updateSpreadsheetAppend(accessToken, {
    spreadsheetId,
    range,
    values,
  })

  if (!result.ok) {
    return jsonResponse(
      { ok: false, error: result.error, detail: result.detail },
      400,
    )
  }

  return jsonResponse({
    ok: true,
    action,
    message: "Google Sheets에 행이 추가되었습니다.",
    data: result.data,
  })
})
