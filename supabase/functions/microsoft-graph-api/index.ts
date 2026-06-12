import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createClient } from "npm:@supabase/supabase-js@2.49.8"

import { getMicrosoftAccessTokenForUser } from "../_shared/microsoft-user-access-token.ts"

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

async function graphFetch(accessToken: string, url: string, init?: RequestInit) {
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
    /* raw */
  }
  if (!res.ok) return { ok: false as const, status: res.status, body: parsed }
  return { ok: true as const, body: parsed }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return json({ error: "POST 만 허용됩니다." }, 405)
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "인증이 필요합니다." }, 401)
  }

  const supabaseUrl = readEnv("SUPABASE_URL")
  const anonKey = readEnv("SUPABASE_ANON_KEY")
  if (!supabaseUrl || !anonKey) {
    return json({ error: "서버 설정 오류" }, 500)
  }

  const jwt = authHeader.replace(/^Bearer\s+/i, "")
  const supabaseUser = createClient(supabaseUrl, anonKey)
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return json({ error: "세션이 유효하지 않습니다." }, 401)
  }

  const uid = userData.user.id

  let body: { action?: string; payload?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return json({ error: "JSON 본문이 필요합니다." }, 400)
  }

  const action = typeof body.action === "string" ? body.action.trim() : ""
  const payload = body.payload ?? {}
  if (!action) return json({ error: "action 필요" }, 400)

  const accessToken = await getMicrosoftAccessTokenForUser(uid)
  if (!accessToken) {
    return json(
      {
        error:
          "Microsoft 계정이 연동되어 있지 않습니다. 워크스페이스 도구에서 Microsoft 연결 후 다시 시도하세요.",
      },
      403,
    )
  }

  try {
    switch (action) {
      case "mail.listMessages": {
        const top = Math.min(Number(payload.top ?? 10) || 10, 50)
        const url = `https://graph.microsoft.com/v1.0/me/messages?$top=${top}&$select=id,subject,receivedDateTime,from`
        const r = await graphFetch(accessToken, url)
        if (!r.ok) return json({ error: "Graph Mail 오류", detail: r.body }, r.status)
        return json({ ok: true, data: r.body })
      }

      case "mail.send": {
        const to = typeof payload.to === "string" ? payload.to.trim() : ""
        const subject = typeof payload.subject === "string" ? payload.subject.trim() : ""
        const text = typeof payload.text === "string" ? payload.text : ""
        if (!to || !subject) return json({ error: "payload.to, subject 필요" }, 400)
        const r = await graphFetch(accessToken, "https://graph.microsoft.com/v1.0/me/sendMail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              subject,
              body: { contentType: "Text", content: text },
              toRecipients: [{ emailAddress: { address: to } }],
            },
          }),
        })
        if (!r.ok) return json({ error: "메일 전송 실패", detail: r.body }, r.status)
        return json({ ok: true, data: r.body ?? {} })
      }

      case "calendar.listEvents": {
        const top = Math.min(Number(payload.top ?? 15) || 15, 50)
        const url =
          `https://graph.microsoft.com/v1.0/me/events?$top=${top}&$orderby=start/dateTime`
        const r = await graphFetch(accessToken, url)
        if (!r.ok) return json({ error: "Graph Calendar 오류", detail: r.body }, r.status)
        return json({ ok: true, data: r.body })
      }

      case "calendar.createEvent": {
        const subject =
          typeof payload.subject === "string" ? payload.subject : "일정"
        const start =
          typeof payload.start === "string" ? payload.start : ""
        const end = typeof payload.end === "string" ? payload.end : ""
        const timeZone =
          typeof payload.timeZone === "string" ? payload.timeZone : "Asia/Seoul"
        if (!start || !end) return json({ error: "payload.start, end (ISO) 필요" }, 400)
        const r = await graphFetch(accessToken, "https://graph.microsoft.com/v1.0/me/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject,
            start: { dateTime: start, timeZone },
            end: { dateTime: end, timeZone },
            body: {
              contentType: "Text",
              content:
                typeof payload.body === "string" ? payload.body : "",
            },
          }),
        })
        if (!r.ok) return json({ error: "일정 생성 실패", detail: r.body }, r.status)
        return json({ ok: true, data: r.body })
      }

      case "drive.listRootChildren": {
        const top = Math.min(Number(payload.top ?? 20) || 20, 50)
        const url =
          `https://graph.microsoft.com/v1.0/me/drive/root/children?$top=${top}&$select=id,name,size,webUrl,file,folder`
        const r = await graphFetch(accessToken, url)
        if (!r.ok) return json({ error: "Graph Drive 오류", detail: r.body }, r.status)
        return json({ ok: true, data: r.body })
      }

      default:
        return json(
          {
            error: `알 수 없는 action: ${action}`,
            hint: "mail.listMessages | mail.send | calendar.listEvents | calendar.createEvent | drive.listRootChildren",
          },
          400,
        )
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[microsoft-graph-api]", e)
    return json({ error: msg }, 500)
  }
})
