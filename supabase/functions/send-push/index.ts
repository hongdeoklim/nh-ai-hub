import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  })
}

type SendPushBody = {
  title?: string
  body?: string
  target_type?: "all" | "department" | "user"
  target_value?: string
  url?: string
}

// ── Google service-account OAuth (for FCM HTTP v1) ──────────────────────────
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "")
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function getAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  )
  const signingInput = `${header}.${claim}`
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput)),
  )
  const jwt = `${signingInput}.${base64url(sig)}`

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  })
  const data = (await res.json()) as { access_token?: string; error_description?: string }
  if (!data.access_token) throw new Error(data.error_description || "OAuth 토큰 발급 실패")
  return data.access_token
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors })

  const url = Deno.env.get("SUPABASE_URL")
  const anon = Deno.env.get("SUPABASE_ANON_KEY")
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const authorization = req.headers.get("Authorization")
  if (!url || !anon || !service) return json({ ok: false, error: "Not configured" }, 500)
  if (!authorization) return json({ ok: false, error: "Unauthorized" }, 401)

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
  const admin = createClient(url, service, { auth: { persistSession: false } })

  const { data: auth } = await userClient.auth.getUser()
  if (!auth.user) return json({ ok: false, error: "Unauthorized" }, 401)

  // Admin gate.
  const { data: actor } = await admin
    .from("users")
    .select("is_admin, role")
    .eq("id", auth.user.id)
    .maybeSingle()
  if (!actor || (!actor.is_admin && actor.role !== "admin")) {
    return json({ ok: false, error: "관리자만 푸시를 보낼 수 있습니다." }, 403)
  }

  let body: SendPushBody
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400)
  }
  const title = body.title?.trim()
  const messageBody = body.body?.trim()
  const targetType = body.target_type ?? "all"
  if (!title || !messageBody) return json({ ok: false, error: "제목과 내용을 입력하세요." }, 400)

  // Resolve concrete recipient user ids for every target (including "all"),
  // so we can create an in-app notification for each recipient regardless of
  // whether they have push enabled.
  let userIds: string[]
  if (targetType === "user" && body.target_value) {
    userIds = [body.target_value]
  } else if (targetType === "department" && body.target_value) {
    const { data: deptUsers } = await admin.from("users").select("id").eq("department", body.target_value)
    userIds = (deptUsers ?? []).map((u) => u.id as string)
  } else {
    const { data: allUsers } = await admin.from("users").select("id")
    userIds = (allUsers ?? []).map((u) => u.id as string)
  }

  if (userIds.length === 0) {
    return json({ ok: true, configured: true, recipients: 0, success: 0, inapp: 0 })
  }

  // In-app notification for every recipient (bell menu + realtime toast).
  // Independent of push consent — this is the fallback for users without push.
  let inapp = 0
  const { error: notifError } = await admin
    .from("nh_user_notifications")
    .insert(userIds.map((uid) => ({ user_id: uid, title, content: messageBody })))
  if (!notifError) inapp = userIds.length
  else console.error("[send-push] nh_user_notifications insert 실패", notifError.message)

  const { data: tokenRows, error: tokenError } = await admin
    .from("user_device_tokens")
    .select("token, user_id")
    .in("user_id", userIds)
  if (tokenError) return json({ ok: false, error: tokenError.message }, 500)
  const tokens = (tokenRows ?? []).map((r) => r.token as string)

  const saRaw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON")?.trim()
  if (!saRaw) {
    return json({
      ok: true,
      configured: false,
      recipients: tokens.length,
      inapp,
      error:
        "인앱 알림은 발송했지만, FCM 웹 푸시 자격증명(FCM_SERVICE_ACCOUNT_JSON)이 아직 설정되지 않아 백그라운드 푸시는 보내지 못했습니다. Supabase Secret 등록 후부터 푸시도 발송됩니다.",
    })
  }

  let sa: { client_email: string; private_key: string; project_id: string }
  try {
    sa = JSON.parse(saRaw)
  } catch {
    return json({ ok: false, error: "FCM_SERVICE_ACCOUNT_JSON 형식이 올바르지 않습니다." }, 500)
  }

  let accessToken: string
  try {
    accessToken = await getAccessToken(sa)
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502)
  }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`
  let success = 0
  const staleTokens: string[] = []

  for (const token of tokens) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body: messageBody },
            data: { url: body.url || "/", title, body: messageBody },
            webpush: { fcmOptions: { link: body.url || "/" } },
          },
        }),
      })
      if (res.ok) {
        success++
      } else if (res.status === 404 || res.status === 400) {
        staleTokens.push(token) // UNREGISTERED / invalid — prune below
      }
    } catch {
      /* transient network error — skip this token */
    }
  }

  if (staleTokens.length > 0) {
    await admin.from("user_device_tokens").delete().in("token", staleTokens)
  }

  await admin.from("push_notification_log").insert({
    sent_by: auth.user.id,
    title,
    body: messageBody,
    target_type: targetType,
    target_value: body.target_value ?? null,
    recipients_count: tokens.length,
    success_count: success,
  })

  return json({ ok: true, configured: true, recipients: tokens.length, success, inapp })
})
