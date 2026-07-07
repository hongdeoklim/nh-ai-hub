import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { verifyInternalBridgeSecret } from "../_shared/plugin-bridge-auth.ts"

/**
 * Slack Web API 브릿지 — `nh.plugin.slack` 플러그인의 endpoint_url.
 * 인증: 사용자가 /marketplace 에서 연결한 Slack Bot User OAuth 토큰(xoxb-...)이
 * `Authorization: Bearer <token>` 헤더로 전달된다(auth_type='bearer').
 * Slack Web API 는 Bearer 토큰을 그대로 받아들이므로 별도 변환이 필요 없다.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type, x-nh-internal-secret",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    })
  }

  const unauthorized = verifyInternalBridgeSecret(req)
  if (unauthorized) return unauthorized

  let body: { arguments?: { channel?: string; text?: string } }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400)
  }

  const botToken = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim()
  if (!botToken) return json({ ok: false, error: "Slack Bot 토큰이 연결되지 않았습니다. /marketplace 에서 먼저 연결하세요." }, 400)

  const channel = body.arguments?.channel?.trim()
  const text = body.arguments?.text?.trim()
  if (!channel || !text) return json({ ok: false, error: "channel 과 text 인자가 모두 필요합니다." }, 400)

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel, text }),
      signal: AbortSignal.timeout(15_000),
    })
    const payload = await res.json() as { ok: boolean; error?: string; ts?: string; channel?: string }
    if (!payload.ok) {
      return json({ ok: false, error: `Slack API 오류: ${payload.error ?? "unknown_error"}` }, 502)
    }
    return json({ ok: true, channel: payload.channel, ts: payload.ts })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ ok: false, error: msg }, 502)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  })
}
