import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"
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

type DriveFile = { id: string; name: string; mimeType: string }

const FOLDER_MIME = "application/vnd.google-apps.folder"
const MAX_SYNC_FILES = 1000
const MAX_SYNC_FOLDERS = 200

/**
 * 하위 폴더 재귀 + 페이지네이션 파일 열거 (기획안 E3).
 * complete=false 면 목록이 불완전(API 오류/상한 도달)하므로 tombstone 을 건너뛴다.
 */
async function listFolderFilesRecursive(
  accessToken: string,
  rootFolderId: string,
): Promise<{ files: DriveFile[]; complete: boolean }> {
  const files: DriveFile[] = []
  const queue: string[] = [rootFolderId]
  const visited = new Set<string>()
  let complete = true

  while (queue.length > 0) {
    if (files.length >= MAX_SYNC_FILES || visited.size >= MAX_SYNC_FOLDERS) {
      console.warn(`[drive-sync-cron] 상한 도달 (files=${files.length}, folders=${visited.size}) — 나머지는 다음 회차`)
      complete = false
      break
    }
    const folderId = queue.shift()!
    if (visited.has(folderId)) continue
    visited.add(folderId)

    let pageToken: string | undefined
    do {
      const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`)
      const fields = encodeURIComponent("nextPageToken,files(id,name,mimeType)")
      const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""
      const res = await driveGet(
        accessToken,
        `${DRIVE_API}?q=${q}&fields=${fields}&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true${pageParam}`,
      )
      if (!res.ok) {
        console.error(`[drive-sync-cron] 폴더 목록 실패 (${folderId}): HTTP ${res.status}`)
        complete = false
        break
      }
      const body = await res.json() as { nextPageToken?: string; files?: DriveFile[] }
      for (const f of body.files ?? []) {
        if (f.mimeType === FOLDER_MIME) queue.push(f.id)
        else files.push(f)
      }
      pageToken = body.nextPageToken
    } while (pageToken && files.length < MAX_SYNC_FILES)
  }

  return { files, complete }
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

  const { files, complete } = await listFolderFilesRecursive(accessToken, rootFolderId)
  const ragIngestUrl = `${supabaseUrl}/functions/v1/rag-ingest`

  const results: Array<{ fileName: string; ok: boolean; skipped?: boolean; error?: string }> = []

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
        body: JSON.stringify({
          fileName: file.name,
          driveFileId: file.id,
          text: text.slice(0, 200000),
        }),
        signal: AbortSignal.timeout(30_000),
      })
      const payload = await res.json().catch(() => ({})) as Record<string, unknown>
      results.push({
        fileName: file.name,
        ok: res.ok && payload.ok === true,
        // 내용 미변경으로 임베딩을 건너뛴 경우 (rag-ingest content_hash 비교)
        skipped: payload.skipped === true || undefined,
        error: payload.ok ? undefined : String(payload.error ?? `HTTP ${res.status}`),
      })
    } catch (e) {
      results.push({ fileName: file.name, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  // Tombstone: 이번 회차 목록에 없는 drive_file_id 청크 정리 (기획안 E2 — 삭제/이동된 파일)
  // 안전장치: 목록이 완전할 때만, 그리고 고아 수가 비정상적으로 많으면 건너뛴다.
  let tombstoned = 0
  if (complete && files.length > 0 && serviceKey) {
    try {
      const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
      const { data: dbRows } = await admin
        .from("company_documents")
        .select("drive_file_id")
        .not("drive_file_id", "is", null)
        .limit(10000)
      const seen = new Set(files.map((f) => f.id))
      const orphanIds = [...new Set((dbRows ?? []).map((r) => String(r.drive_file_id)))]
        .filter((id) => !seen.has(id))
      const MAX_TOMBSTONE = 200
      if (orphanIds.length > MAX_TOMBSTONE) {
        console.warn(`[drive-sync-cron] 고아 파일 ${orphanIds.length}건 — 대량 삭제 안전장치로 건너뜀 (수동 확인 필요)`)
      } else if (orphanIds.length > 0) {
        const { error: tombErr } = await admin
          .from("company_documents")
          .delete()
          .in("drive_file_id", orphanIds)
        if (tombErr) {
          console.error("[drive-sync-cron] tombstone 실패:", tombErr.message)
        } else {
          tombstoned = orphanIds.length
        }
      }
    } catch (e) {
      console.error("[drive-sync-cron] tombstone 예외:", e)
    }
  }

  const succeeded = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length
  const skipped = results.filter(r => r.skipped).length

  console.log(`[drive-sync-cron] 완료: ${succeeded}건 성공(변경 없음 스킵 ${skipped}건), ${failed}건 실패, 고아 정리 ${tombstoned}건(목록 완전성 ${complete})`)
  return jsonResponse({
    ok: succeeded > 0 || files.length === 0,
    total: files.length,
    succeeded,
    skipped,
    failed,
    tombstoned,
    listing_complete: complete,
    results,
  })
})
