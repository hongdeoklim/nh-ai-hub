import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createClient } from "npm:@supabase/supabase-js@2.49.8"

import {
  encryptCredential,
  verifyOAuthState,
} from "../_shared/integration-auth.ts"

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST 만 허용됩니다." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "인증이 필요합니다." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabaseUrl = readEnv("SUPABASE_URL")
  const anonKey = readEnv("SUPABASE_ANON_KEY")
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")
  const credSecret = readEnv("INTEGRATION_CREDENTIALS_SECRET")
  const stateSecret = readEnv("INTEGRATION_OAUTH_STATE_SECRET")

  if (!supabaseUrl || !anonKey || !serviceKey || !credSecret || !stateSecret) {
    return new Response(
      JSON.stringify({ error: "서버 연동 시크릿이 설정되지 않았습니다." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }

  const jwt = authHeader.replace(/^Bearer\s+/i, "")
  const supabaseUser = createClient(supabaseUrl, anonKey)
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: "세션이 유효하지 않습니다." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  let body: { code?: string; state?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "JSON 본문이 필요합니다." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const code = typeof body.code === "string" ? body.code.trim() : ""
  const state = typeof body.state === "string" ? body.state.trim() : ""
  if (!code || !state) {
    return new Response(
      JSON.stringify({ error: "code 및 state 가 필요합니다." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }

  const verified = await verifyOAuthState(state, stateSecret)
  if (!verified || verified.uid !== userData.user.id) {
    return new Response(JSON.stringify({ error: "state 검증에 실패했습니다." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const clientId =
    readEnv("GOOGLE_OAUTH_CLIENT_ID") ?? readEnv("GDRIVE_CLIENT_ID")
  const clientSecret =
    readEnv("GOOGLE_OAUTH_CLIENT_SECRET") ?? readEnv("GDRIVE_CLIENT_SECRET")
  const redirectUri = readEnv("GOOGLE_OAUTH_REDIRECT_URI")

  if (!clientId || !clientSecret || !redirectUri) {
    return new Response(
      JSON.stringify({ error: "Google OAuth 클라이언트 설정이 없습니다." }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    const t = await tokenRes.text()
    console.error("[integration-google-exchange] token 오류", t)
    return new Response(
      JSON.stringify({
        error: `Google 토큰 교환 실패(${tokenRes.status}). 리다이렉트 URI가 GCP 콘솔과 일치하는지 확인하세요.`,
      }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }

  const tokens = (await tokenRes.json()) as {
    access_token?: string
    refresh_token?: string
    scope?: string
  }

  if (!tokens.refresh_token) {
    return new Response(
      JSON.stringify({
        error:
          "refresh_token 을 받지 못했습니다. 연결 해제 후 다시 시도하고, 동의 화면에서 prompt=consent 가 적용되는지 확인하세요.",
      }),
      {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }

  let providerEmail: string | null = null
  if (tokens.access_token) {
    const uiRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      },
    )
    if (uiRes.ok) {
      const ui = (await uiRes.json()) as { email?: string }
      providerEmail = ui.email ?? null
    }
  }

  let encIvCipher
  try {
    encIvCipher = await encryptCredential(tokens.refresh_token, credSecret)
  } catch (e) {
    console.error("[integration-google-exchange] 암호화 실패", e)
    return new Response(JSON.stringify({ error: "자격 증명 저장 준비 실패" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const admin = createClient(supabaseUrl, serviceKey)
  const uid = userData.user.id

  const { error: credErr } = await admin.from("user_integration_credentials").upsert(
    {
      user_id: uid,
      provider: "google",
      ciphertext: encIvCipher.ciphertext,
      iv: encIvCipher.iv,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  )

  if (credErr) {
    console.error("[integration-google-exchange] credentials upsert", credErr)
    return new Response(JSON.stringify({ error: "자격 증명 저장에 실패했습니다." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { error: accErr } = await admin.from("user_integration_accounts").upsert(
    {
      user_id: uid,
      provider: "google",
      connected_at: new Date().toISOString(),
      provider_account_email: providerEmail,
      scopes: tokens.scope ?? null,
    },
    { onConflict: "user_id,provider" },
  )

  if (accErr) {
    console.error("[integration-google-exchange] accounts upsert", accErr)
    return new Response(JSON.stringify({ error: "연동 상태 저장에 실패했습니다." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
