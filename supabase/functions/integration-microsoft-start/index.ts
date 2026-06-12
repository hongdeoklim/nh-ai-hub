import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createClient } from "npm:@supabase/supabase-js@2.49.8"

import { signOAuthState } from "../_shared/integration-auth.ts"

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
  if (!supabaseUrl || !anonKey) {
    return new Response(JSON.stringify({ error: "서버 설정 오류" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const jwt = authHeader.replace(/^Bearer\s+/i, "")
  const supabase = createClient(supabaseUrl, anonKey)
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: "세션이 유효하지 않습니다." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const clientId = readEnv("MICROSOFT_OAUTH_CLIENT_ID")
  const redirectUri = readEnv("MICROSOFT_OAUTH_REDIRECT_URI")
  const stateSecret = readEnv("INTEGRATION_OAUTH_STATE_SECRET")
  const tenant = readEnv("MICROSOFT_OAUTH_TENANT") ?? "common"

  if (!clientId || !redirectUri || !stateSecret) {
    return new Response(
      JSON.stringify({
        error:
          "Microsoft 연동 미설정: MICROSOFT_OAUTH_CLIENT_ID, MICROSOFT_OAUTH_REDIRECT_URI, INTEGRATION_OAUTH_STATE_SECRET",
      }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }

  const state = await signOAuthState(userData.user.id, 10 * 60 * 1000, stateSecret)

  const scope = [
    "offline_access",
    "openid",
    "profile",
    "User.Read",
    "Mail.Read",
    "Mail.Send",
    "Calendars.ReadWrite",
    "Files.Read.All",
  ].join(" ")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    state,
    prompt: "consent",
  })

  const authUrl =
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`

  return new Response(JSON.stringify({ authUrl }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
