import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createClient } from "npm:@supabase/supabase-js@2.49.8"

import { getGoogleAccessTokenForUser } from "../_shared/google-user-access-token.ts"

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

async function googleFetch(accessToken: string, url: string, init?: RequestInit) {
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
  if (!res.ok) {
    return {
      ok: false as const,
      status: res.status,
      body: parsed,
    }
  }
  return { ok: true as const, body: parsed }
}

/** Gmail raw 메시지용 UTF-8 Base64URL */
function encodeRfc822Raw(lines: string[]): string {
  const raw = lines.join("\r\n")
  const bytes = new TextEncoder().encode(raw)
  let bin = ""
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  const b64 = btoa(bin)
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
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

  if (!action) return json({ error: "action 이 필요합니다." }, 400)

  const accessToken = await getGoogleAccessTokenForUser(uid)
  if (!accessToken) {
    return json(
      {
        error:
          "Google 계정이 연동되어 있지 않거나 토큰이 만료되었습니다. 설정 → 연동에서 다시 연결하세요.",
      },
      403,
    )
  }

  try {
    switch (action) {
      case "gmail.listMessages": {
        const maxResults = Math.min(
          Number(payload.maxResults ?? 10) || 10,
          50,
        )
        const q = typeof payload.q === "string" ? encodeURIComponent(payload.q) : ""
        const url =
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}` +
          (q ? `&q=${q}` : "")
        const r = await googleFetch(accessToken, url)
        if (!r.ok) return json({ error: "Gmail API 오류", detail: r.body }, r.status)
        return json({ ok: true, data: r.body })
      }

      case "gmail.getMessage": {
        const id = typeof payload.id === "string" ? payload.id : ""
        if (!id) return json({ error: "payload.id 필요" }, 400)
        const fmt =
          typeof payload.format === "string" ? payload.format : "full"
        const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=${fmt}`
        const r = await googleFetch(accessToken, url)
        if (!r.ok) return json({ error: "Gmail API 오류", detail: r.body }, r.status)
        return json({ ok: true, data: r.body })
      }

      case "gmail.send": {
        const to = typeof payload.to === "string" ? payload.to.trim() : ""
        const subject = typeof payload.subject === "string" ? payload.subject.trim() : ""
        const text = typeof payload.text === "string" ? payload.text : ""
        if (!to || !subject) return json({ error: "payload.to, subject 필요" }, 400)
        const raw = encodeRfc822Raw([
          `To: ${to}`,
          `Subject: ${subject}`,
          "MIME-Version: 1.0",
          "Content-Type: text/plain; charset=UTF-8",
          "",
          text,
        ])
        const r = await googleFetch(accessToken, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw }),
        })
        if (!r.ok) return json({ error: "Gmail 전송 실패", detail: r.body }, r.status)
        return json({ ok: true, data: r.body })
      }

      case "calendar.listCalendars": {
        const r = await googleFetch(
          accessToken,
          "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50",
        )
        if (!r.ok) return json({ error: "Calendar API 오류", detail: r.body }, r.status)
        return json({ ok: true, data: r.body })
      }

      case "calendar.listEvents": {
        const calendarId =
          typeof payload.calendarId === "string"
            ? encodeURIComponent(payload.calendarId)
            : "primary"
        const timeMin =
          typeof payload.timeMin === "string"
            ? `&timeMin=${encodeURIComponent(payload.timeMin)}`
            : ""
        const timeMax =
          typeof payload.timeMax === "string"
            ? `&timeMax=${encodeURIComponent(payload.timeMax)}`
            : ""
        const url =
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?singleEvents=true&maxResults=25${timeMin}${timeMax}`
        const r = await googleFetch(accessToken, url)
        if (!r.ok) return json({ error: "Calendar API 오류", detail: r.body }, r.status)
        return json({ ok: true, data: r.body })
      }

      case "calendar.createEvent": {
        const calendarId =
          typeof payload.calendarId === "string"
            ? encodeURIComponent(payload.calendarId)
            : "primary"
        const summary =
          typeof payload.summary === "string" ? payload.summary : "일정"
        const start =
          typeof payload.start === "string" ? payload.start : ""
        const end = typeof payload.end === "string" ? payload.end : ""
        if (!start || !end) {
          return json({ error: "payload.start, end (RFC3339) 필요" }, 400)
        }
        const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`
        const r = await googleFetch(accessToken, url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary,
            description:
              typeof payload.description === "string" ? payload.description : undefined,
            start: { dateTime: start },
            end: { dateTime: end },
          }),
        })
        if (!r.ok) return json({ error: "일정 생성 실패", detail: r.body }, r.status)
        return json({ ok: true, data: r.body })
      }

      case "drive.listFiles": {
        const pageSize = Math.min(Number(payload.pageSize ?? 20) || 20, 50)
        const mime = typeof payload.mimeType === "string" ? payload.mimeType.trim() : ""
        const userQ = typeof payload.q === "string" ? payload.q.trim() : ""

        let query = "trashed=false"
        if (mime.length > 0) {
          const esc = mime.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
          query += ` and mimeType='${esc}'`
        }
        if (userQ.length > 0) {
          query = `${userQ} and (${query})`
        }

        const fields = encodeURIComponent(
          "nextPageToken, files(id,name,mimeType,size,webViewLink,modifiedTime)",
        )
        const url =
          `https://www.googleapis.com/drive/v3/files?pageSize=${pageSize}&fields=${fields}&q=${encodeURIComponent(query)}`
        const r = await googleFetch(accessToken, url)
        if (!r.ok) return json({ error: "Drive API 오류", detail: r.body }, r.status)
        return json({ ok: true, data: r.body })
      }

      /** 특정 폴더(또는 내 드라이브 루트) 직계 자식 — 폴더가 위쪽 정렬 */
      case "drive.listFolderContents": {
        const raw =
          typeof payload.folderId === "string" ? payload.folderId.trim() : ""
        const folderId = raw.length === 0 ? "root" : raw

        if (
          folderId !== "root" &&
          (folderId.includes("'") || folderId.length > 512)
        ) {
          return json({ error: "유효하지 않은 folderId 입니다." }, 400)
        }

        const pageSize = Math.min(Number(payload.pageSize ?? 100) || 100, 150)

        const parentEsc =
          folderId === "root"
            ? "root"
            : folderId.replace(/\\/g, "\\\\").replace(/'/g, "\\'")

        const q =
          folderId === "root"
            ? "'root' in parents and trashed=false"
            : `'${parentEsc}' in parents and trashed=false`

        const fields = encodeURIComponent(
          "files(id,name,mimeType,size,webViewLink,modifiedTime)",
        )
        const url =
          `https://www.googleapis.com/drive/v3/files?pageSize=${pageSize}&fields=${fields}&orderBy=folder,name_natural&q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true`

        const r = await googleFetch(accessToken, url)
        if (!r.ok) return json({ error: "Drive 폴더 목록 오류", detail: r.body }, r.status)

        const body = r.body as {
          files?: Array<{
            id?: string
            name?: string
            mimeType?: string
            size?: string
            webViewLink?: string
            modifiedTime?: string
          }>
        }

        const items = (body.files ?? [])
          .filter((f) => typeof f.id === "string" && typeof f.name === "string")
          .map((f) => ({
            id: f.id as string,
            name: f.name as string,
            mimeType: typeof f.mimeType === "string" ? f.mimeType : "",
            size: typeof f.size === "string" ? f.size : undefined,
            webViewLink:
              typeof f.webViewLink === "string" ? f.webViewLink : undefined,
            modifiedTime:
              typeof f.modifiedTime === "string" ? f.modifiedTime : undefined,
          }))

        return json({ ok: true, folderId, items })
      }

      /** 사내 자료실 → 채팅: 텍스트 추출 또는 이미지 Data URL (사용자 OAuth) */
      case "drive.exportForChat": {
        const fileId = typeof payload.fileId === "string" ? payload.fileId.trim() : ""
        if (!fileId) return json({ error: "payload.fileId 필요" }, 400)

        const TEXT_CAP = 80_000
        const MAX_IMG = 4 * 1024 * 1024

        function bytesToBase64(bytes: Uint8Array): string {
          let binary = ""
          const chunkSize = 0x8000
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
          }
          return btoa(binary)
        }

        const metaUrl =
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink&supportsAllDrives=true`
        const metaR = await googleFetch(accessToken, metaUrl)
        if (!metaR.ok) {
          return json({ error: "Drive 파일 정보를 읽을 수 없습니다.", detail: metaR.body }, metaR.status)
        }

        const meta = metaR.body as {
          id?: string
          name?: string
          mimeType?: string
          webViewLink?: string
        }
        const mimeType = meta.mimeType ?? "application/octet-stream"
        const fileName = meta.name ?? "문서"
        const webViewLink = typeof meta.webViewLink === "string" ? meta.webViewLink : undefined

        async function exportGoogleMime(exportMime: string): Promise<string> {
          const url =
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMime)}&supportsAllDrives=true`
          const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
          const text = await res.text()
          if (!res.ok) {
            throw new Error(text.length > 0 ? text : `export 실패 (${res.status})`)
          }
          return text
        }

        async function downloadMedia(): Promise<Uint8Array> {
          const url =
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`
          const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
          if (!res.ok) {
            const t = await res.text()
            throw new Error(t.length > 0 ? t : `미디어 다운로드 실패 (${res.status})`)
          }
          return new Uint8Array(await res.arrayBuffer())
        }

        try {
          if (mimeType === "application/vnd.google-apps.document") {
            let text = await exportGoogleMime("text/plain")
            if (text.length > TEXT_CAP) {
              text = text.slice(0, TEXT_CAP) + "\n\n[…본문이 길어 일부만 포함했습니다.]"
            }
            return json({
              ok: true,
              kind: "text",
              fileName,
              mimeType,
              text,
              webViewLink,
            })
          }

          if (mimeType === "application/vnd.google-apps.spreadsheet") {
            let text = await exportGoogleMime("text/csv")
            if (text.length > TEXT_CAP) {
              text = text.slice(0, TEXT_CAP) + "\n\n[…CSV가 길어 일부만 포함했습니다.]"
            }
            return json({
              ok: true,
              kind: "text",
              fileName,
              mimeType,
              text,
              webViewLink,
            })
          }

          if (mimeType === "application/vnd.google-apps.presentation") {
            let text = await exportGoogleMime("text/plain")
            if (text.length > TEXT_CAP) {
              text = text.slice(0, TEXT_CAP) + "\n\n[…본문이 길어 일부만 포함했습니다.]"
            }
            return json({
              ok: true,
              kind: "text",
              fileName,
              mimeType,
              text,
              webViewLink,
            })
          }

          if (mimeType.startsWith("image/")) {
            const bytes = await downloadMedia()
            if (bytes.length > MAX_IMG) {
              return json({
                ok: true,
                kind: "binary_link",
                fileName,
                mimeType,
                webViewLink,
                message: "이미지가 4MB를 초과하여 원본 링크로만 안내합니다.",
              })
            }
            const dataUrl = `data:${mimeType};base64,${bytesToBase64(bytes)}`
            return json({
              ok: true,
              kind: "image",
              fileName,
              mimeType,
              dataUrl,
              webViewLink,
            })
          }

          return json({
            ok: true,
            kind: "binary_link",
            fileName,
            mimeType,
            webViewLink,
            message:
              mimeType === "application/pdf"
                ? "PDF는 현재 채팅 이미지 파이프라인과 별도입니다. 원본에서 확인하거나 구글 문서로 변환해 주세요."
                : "이 형식은 자동 텍스트 추출을 지원하지 않습니다. 구글 문서·시트로 변환하거나 원본 링크에서 확인해 주세요.",
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          return json({ error: `Drive 처리 실패: ${msg}` }, 500)
        }
      }

      case "sheets.getSpreadsheet": {
        const spreadsheetId =
          typeof payload.spreadsheetId === "string" ? payload.spreadsheetId : ""
        if (!spreadsheetId) return json({ error: "payload.spreadsheetId 필요" }, 400)
        const url =
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`
        const r = await googleFetch(accessToken, url)
        if (!r.ok) return json({ error: "Sheets API 오류", detail: r.body }, r.status)
        return json({ ok: true, data: r.body })
      }

      case "sheets.getValues": {
        const spreadsheetId =
          typeof payload.spreadsheetId === "string" ? payload.spreadsheetId : ""
        const range = typeof payload.range === "string" ? payload.range : "A1:Z100"
        if (!spreadsheetId) return json({ error: "payload.spreadsheetId 필요" }, 400)
        const url =
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`
        const r = await googleFetch(accessToken, url)
        if (!r.ok) return json({ error: "Sheets API 오류", detail: r.body }, r.status)
        return json({ ok: true, data: r.body })
      }

      case "sheets.appendValues": {
        const spreadsheetId =
          typeof payload.spreadsheetId === "string" ? payload.spreadsheetId : ""
        const range = typeof payload.range === "string" ? payload.range : "Sheet1!A1"
        const values = Array.isArray(payload.values) ? payload.values : null
        if (!spreadsheetId || !values) {
          return json({ error: "payload.spreadsheetId, values(2차원 배열) 필요" }, 400)
        }
        const url =
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`
        const r = await googleFetch(accessToken, url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values }),
        })
        if (!r.ok) return json({ error: "Sheets append 실패", detail: r.body }, r.status)
        return json({ ok: true, data: r.body })
      }

      case "slides.getPresentation": {
        const presentationId =
          typeof payload.presentationId === "string" ? payload.presentationId : ""
        if (!presentationId) return json({ error: "payload.presentationId 필요" }, 400)
        const url =
          `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}`
        const r = await googleFetch(accessToken, url)
        if (!r.ok) return json({ error: "Slides API 오류", detail: r.body }, r.status)
        return json({ ok: true, data: r.body })
      }

      case "docs.getDocument": {
        const documentId =
          typeof payload.documentId === "string" ? payload.documentId : ""
        if (!documentId) return json({ error: "payload.documentId 필요" }, 400)
        const url =
          `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`
        const r = await googleFetch(accessToken, url)
        if (!r.ok) return json({ error: "Docs API 오류", detail: r.body }, r.status)
        return json({ ok: true, data: r.body })
      }

      default:
        return json(
          {
            error: `알 수 없는 action: ${action}`,
            hint:
              "gmail.listMessages | gmail.getMessage | gmail.send | calendar.* | drive.listFiles | drive.listFolderContents | drive.exportForChat | sheets.* | slides.getPresentation | docs.getDocument",
          },
          400,
        )
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[google-workspace-api]", e)
    return json({ error: msg }, 500)
  }
})
