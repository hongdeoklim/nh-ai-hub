import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts"

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== "POST") {
    return jsonResponse({ error: "POST 만 허용됩니다." }, 405)
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "인증이 필요합니다." }, 401)
  }

  const supabaseUrl = readEnv("SUPABASE_URL")
  const anonKey = readEnv("SUPABASE_ANON_KEY")
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: "서버 설정이 누락되었습니다." }, 500)
  }

  const jwt = authHeader.replace(/^Bearer\s+/i, "")
  const supabaseUser = createClient(supabaseUrl, anonKey)
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser(jwt)
  
  if (userErr || !userData.user) {
    return jsonResponse({ error: "세션이 유효하지 않습니다." }, 401)
  }

  let body: { email?: string; password?: string; imapHost?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: "JSON 본문이 필요합니다." }, 400)
  }

  const email = (body.email || "").trim()
  const password = (body.password || "").trim()
  const imapHost = (body.imapHost || "").trim()

  if (!email || !password || !imapHost) {
    return jsonResponse({ error: "email, password, imapHost가 모두 필요합니다." }, 400)
  }

  const adminClient = createClient(supabaseUrl, serviceKey)

  const { error: upsertErr } = await adminClient
    .from("nh_user_integrations")
    .upsert({
      user_id: userData.user.id,
      provider: "email",
      access_token: email,
      refresh_token: password,
      metadata: { imapHost }
    }, { onConflict: "user_id,provider" })

  if (upsertErr) {
    console.error("[save-email-credentials] Upsert Error:", upsertErr)
    return jsonResponse({ error: "이메일 연동 정보 저장에 실패했습니다." }, 500)
  }

  return jsonResponse({ ok: true })
})
