import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts"
import { getAccessToken, normalizeDriveFolderId } from "../_shared/gdrive.ts"

/**
 * drive-sync-cron
 *
 * pg_cron 또는 수동 호출로 실행됨.
 * Google Drive 공유 폴더 → rag-ingest → company_documents → (DB 트리거) → Dify
 *
 * 인증: DIFY_SYNC_WEBHOOK_SECRET (pg_cron에서 사용하는 내부 secret과 공유)
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3/files"
const EXPORTABLE_MIME: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
}
const TEXT_MIME = new Set(["text/plain", "text/markdown", "text/csv", "text/html"])

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

async function driveGet(accessToken: string, url: string): Promise<Response> {
  return fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
}

async function listFolderFiles(
  accessToken: string,
  folderId: string,
): Promise<Array<{ id: string; name: string; mimeType: string }>> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`)
  const fields = encodeURIComponent("files(id,name,mimeType)")
  const res = await driveGet(
    accessToken,
    `${DRIVE_API}?q=${q}&fields=${fields}&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`,
  )
  if (!res.ok) return []
  const body = await res.json() as { files?: Array<{ id: string; name: string; mimeType: string }> }
  return body.files ?? []
}

async function readFileText(accessToken: string, file: { id: string; name: string; mimeType: string }): Promise<string | null> {
  // Google Docs 계열은 export
  const exportMime = EXPORTABLE_MIME[file.mimeType]
  if (exportMime) {
    const res = await driveGet(
      accessToken,
      `${DRIVE_API}/${file.id}/export?mimeType=${encodeURIComponent(exportMime)}`,
    )
    if (!res.ok) return null
    return await res.text()
  }

  // 일반 텍스트 파일은 download
  if (TEXT_MIME.has(file.mimeType) || file.name.match(/\.(txt|md|csv)$/i)) {
    const res = await driveGet(
      accessToken,
      `${DRIVE_API}/${file.id}?alt=media`,
    )
    if (!res.ok) return null
    return await res.text()
  }

  return null
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== "POST") return jsonResponse({ error: "POST required." }, 405)

  // 인증: DIFY_SYNC_WEBHOOK_SECRET 또는 SUPABASE_SERVICE_ROLE_KEY
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  const webhookSecret = readEnv("DIFY_SYNC_WEBHOOK_SECRET")
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")

  if (bearer !== webhookSecret && bearer !== serviceKey) {
    return jsonResponse({ error: "Unauthorized" }, 403)
  }

  const supabaseUrl = readEnv("SUPABASE_URL")
  if (!supabaseUrl) return jsonResponse({ error: "SUPABASE_URL missing" }, 500)

  const rootFolderId = normalizeDriveFolderId(readEnv("GDRIVE_ROOT_FOLDER_ID"))
  if (!rootFolderId) return jsonResponse({ error: "GDRIVE_ROOT_FOLDER_ID not configured" }, 503)

  let accessToken: string
  try {
    accessToken = await getAccessToken()
  } catch (e) {
    return jsonResponse({ error: `Google OAuth 실패: ${e instanceof Error ? e.message : String(e)}` }, 503)
  }

  const files = await listFolderFiles(accessToken, rootFolderId)
  const ragIngestUrl = `${supabaseUrl}/functions/v1/rag-ingest`

  const results: Array<{ fileName: string; ok: boolean; error?: string }> = []

  for (const file of files) {
    const text = await readFileText(accessToken, file)
    if (!text || text.trim().length < 20) {
      results.push({ fileName: file.name, ok: false, error: "텍스트 추출 불가 또는 너무 짧음" })
      continue
    }

    try {
      const res = await fetch(ragIngestUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileName: file.name, text: text.slice(0, 200000) }),
        signal: AbortSignal.timeout(30_000),
      })
      const payload = await res.json().catch(() => ({})) as Record<string, unknown>
      results.push({ fileName: file.name, ok: res.ok && payload.ok === true, error: payload.ok ? undefined : String(payload.error ?? `HTTP ${res.status}`) })
    } catch (e) {
      results.push({ fileName: file.name, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const succeeded = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length

  console.log(`[drive-sync-cron] 완료: ${succeeded}건 성공, ${failed}건 실패`)
  return jsonResponse({ ok: succeeded > 0 || files.length === 0, total: files.length, succeeded, failed, results })
})
