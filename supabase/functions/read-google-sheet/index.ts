/**
 * Google Sheets 읽기 (OAuth 사용자 토큰 우선 → 서비스 계정 폴백)
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createClient } from "npm:@supabase/supabase-js@2.49.8"

import { readGoogleSpreadsheetValues } from "../_shared/google-sheets-read.ts"
import { getValidGoogleAgentAccessToken } from "../_shared/google-agent-token.ts"

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "POST only" }, 405)
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ ok: false, error: "인증 필요" }, 401)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) {
    return json({ ok: false, error: "유효하지 않은 세션" }, 401)
  }

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: "JSON 본문 필요" }, 400)
  }

  const spreadsheetId =
    typeof body.spreadsheetId === "string" ? body.spreadsheetId.trim() : ""
  const range = typeof body.range === "string"
    ? body.range.trim()
    : "A1:Z100"

  if (!spreadsheetId) {
    return json({ ok: false, error: "spreadsheetId 필요" }, 400)
  }

  let oauthToken: string | null = null
  if (serviceKey) {
    const admin = createClient(supabaseUrl, serviceKey)
    const tokenResult = await getValidGoogleAgentAccessToken(
      admin,
      userData.user.id,
    )
    if (tokenResult.ok) {
      oauthToken = tokenResult.accessToken
    }
  }

  const result = await readGoogleSpreadsheetValues({
    spreadsheetId,
    range,
    accessToken: oauthToken,
  })

  return json(result, result.ok ? 200 : 502)
})
