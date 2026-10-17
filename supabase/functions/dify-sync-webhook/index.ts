import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts"
import { downloadFromGCS } from "../_shared/gcs.ts"

type SyncJob = {
  id: string
  knowledge_base_id: string
  operation: "upsert" | "delete"
  attempts: number
  snapshot: Record<string, any>
}

async function authorize(req: Request, admin: any, anon: string, service: string): Promise<boolean> {
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || ""
  // 서비스 롤 키 직접 매칭
  if (bearer === service) return true
  // pg_net 트리거 등 내부 호출용 shared webhook secret
  const webhookSecret = Deno.env.get("DIFY_SYNC_WEBHOOK_SECRET")
  if (webhookSecret && bearer === webhookSecret) return true
  // 관리자 JWT 허용
  const { data } = await createClient(Deno.env.get("SUPABASE_URL") || "", anon).auth.getUser(bearer)
  if (!data.user) return false
  const { data: profile } = await admin.from("users").select("is_admin").eq("id", data.user.id).maybeSingle()
  return profile?.is_admin === true
}

/** 처리 중 임대 시간. 이 시간이 지나도 "processing" 이면 중단된 작업으로 보고 되돌린다 */
const LEASE_MS = 15 * 60 * 1000
/** 이 횟수만큼 실패하면 더 시도하지 않는다 */
const MAX_ATTEMPTS = 5

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight
  if (req.method !== "POST") return jsonResponse({ error: "POST required." }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || ""
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  const difyUrl = Deno.env.get("DIFY_API_URL")?.replace(/\/$/, "")
  const difyKey = Deno.env.get("DIFY_DATASET_API_KEY") || Deno.env.get("DIFY_API_KEY")
  const datasetId = Deno.env.get("DIFY_DATASET_ID")
  const admin = createClient(supabaseUrl, service, { auth: { persistSession: false } })
  if (!(await authorize(req, admin, anon, service))) return jsonResponse({ error: "Forbidden." }, 403)
  if (!difyUrl || !difyKey || !datasetId) {
    return jsonResponse({
      error: "Dify dataset sync is not configured.",
      missing: [!difyUrl && "DIFY_API_URL", !difyKey && "DIFY_DATASET_API_KEY", !datasetId && "DIFY_DATASET_ID"].filter(Boolean),
    }, 503)
  }

  const body = await req.json().catch(() => ({})) as { limit?: number }
  const limit = Math.min(Math.max(Number(body.limit || 10), 1), 50)

  // 멈춘 작업 회수: 함수 시간 초과·중단으로 임대 시간이 지나도 "processing" 에 남은 작업
  const nowIso = new Date().toISOString()
  const { data: stuck } = await admin.from("knowledge_sync_jobs")
    .select("id,knowledge_base_id,operation,attempts")
    .eq("status", "processing").lt("available_at", nowIso).limit(50)
  for (const s of (stuck || []) as Array<Pick<SyncJob, "id" | "knowledge_base_id" | "operation" | "attempts">>) {
    const attempts = s.attempts + 1
    const giveUp = attempts >= MAX_ATTEMPTS
    await admin.from("knowledge_sync_jobs").update({
      status: giveUp ? "failed" : "pending",
      attempts,
      available_at: nowIso,
      last_error: "처리 도중 중단되어 다시 시도합니다 (임대 시간 초과)",
    }).eq("id", s.id).eq("status", "processing")
    if (s.operation === "upsert") {
      await admin.from("knowledge_base").update({ dify_sync_status: giveUp ? "failed" : "pending" }).eq("id", s.knowledge_base_id)
    }
  }

  const { data: jobs, error } = await admin.from("knowledge_sync_jobs")
    .select("id,knowledge_base_id,operation,attempts,snapshot")
    .eq("status", "pending").lte("available_at", new Date().toISOString())
    .order("created_at").limit(limit)
  if (error) return jsonResponse({ error: error.message }, 500)

  const results: Array<Record<string, unknown>> = []
  for (const job of (jobs || []) as SyncJob[]) {
    // 원자적 선점: pending 일 때만 processing 으로 바꾼다. 바뀐 행이 없으면 다른 실행(5분 cron 과
    // 문서 INSERT 트리거가 겹친 경우 등)이 이미 가져간 것이므로 건너뛴다 — 중복 업로드·고아 문서 방지.
    const { data: claimed, error: claimError } = await admin.from("knowledge_sync_jobs")
      .update({ status: "processing", available_at: new Date(Date.now() + LEASE_MS).toISOString() })
      .eq("id", job.id).eq("status", "pending")
      .select("id")
    if (claimError) {
      results.push({ id: job.id, ok: false, error: `선점 실패: ${claimError.message}` })
      continue
    }
    if (!claimed || claimed.length === 0) {
      results.push({ id: job.id, ok: true, skipped: "claimed_by_another_run" })
      continue
    }
    if (job.operation === "upsert") {
      await admin.from("knowledge_base").update({ dify_sync_status: "processing" }).eq("id", job.knowledge_base_id)
    }
    try {
      const snapshot = job.snapshot || {}
      const existingDifyId = snapshot.dify_document_id as string | undefined
      if (job.operation === "delete") {
        if (existingDifyId) {
          const response = await fetch(`${difyUrl}/v1/datasets/${datasetId}/documents/${existingDifyId}`, {
            method: "DELETE", headers: { Authorization: `Bearer ${difyKey}` },
          })
          if (!response.ok && response.status !== 404) throw new Error(`Dify delete HTTP ${response.status}: ${await response.text()}`)
        }
      } else {
        const { data: row } = await admin.from("knowledge_base").select("*").eq("id", job.knowledge_base_id).maybeSingle()
        if (!row || row.deleted_at) throw new Error("Knowledge document is missing or deleted.")
        const previousDifyId = row.dify_document_id as string | null
        const bytes = await downloadFromGCS(row.storage_object_path || row.file_url)
        const form = new FormData()
        form.append("data", JSON.stringify({
          indexing_technique: "high_quality",
          process_rule: { mode: "custom", rules: {
            pre_processing_rules: [
              { id: "remove_extra_spaces", enabled: true },
              { id: "remove_urls_emails", enabled: false },
            ],
            segmentation: { separator: "\\n", max_tokens: 500 },
          } },
        }))
        form.append("file", new Blob([bytes], { type: row.mime_type || "application/octet-stream" }), row.file_name)
        const response = await fetch(`${difyUrl}/v1/datasets/${datasetId}/document/create_by_file`, {
          method: "POST", headers: { Authorization: `Bearer ${difyKey}` }, body: form,
        })
        if (!response.ok) throw new Error(`Dify upload HTTP ${response.status}: ${await response.text()}`)
        const payload = await response.json()
        const newDifyId = (payload.document?.id as string | undefined) || null
        await admin.from("knowledge_base").update({
          dify_document_id: newDifyId,
          dify_sync_status: "synced",
          dify_synced_at: new Date().toISOString(),
        }).eq("id", row.id)
        // 새 문서가 올라간 뒤에만 예전 Dify 문서를 지운다 (업로드 실패 시 기존 문서가 사라지지 않게).
        // 지우기에 실패해도 동기화 자체는 성공으로 두고 기록만 남긴다.
        if (previousDifyId && previousDifyId !== newDifyId) {
          const removed = await fetch(`${difyUrl}/v1/datasets/${datasetId}/documents/${previousDifyId}`, {
            method: "DELETE", headers: { Authorization: `Bearer ${difyKey}` },
          }).catch((e) => e as Error)
          if (removed instanceof Error || (!removed.ok && removed.status !== 404)) {
            const detail = removed instanceof Error ? removed.message : `HTTP ${removed.status}`
            console.warn("[dify-sync-webhook] 예전 Dify 문서 삭제 실패", previousDifyId, detail)
            results.push({ id: job.id, warning: `예전 Dify 문서(${previousDifyId}) 삭제 실패: ${detail}` })
          }
        }
      }
      await admin.from("knowledge_sync_jobs").update({ status: "done", processed_at: new Date().toISOString(), last_error: null }).eq("id", job.id)
      results.push({ id: job.id, ok: true, operation: job.operation })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      const attempts = job.attempts + 1
      const failed = attempts >= MAX_ATTEMPTS
      await admin.from("knowledge_sync_jobs").update({
        status: failed ? "failed" : "pending",
        attempts,
        available_at: new Date(Date.now() + Math.min(3600, 2 ** attempts * 60) * 1000).toISOString(),
        last_error: message,
      }).eq("id", job.id)
      // 재시도가 남아 있으면 "대기", 더 시도하지 않을 때만 "실패"로 표시한다
      if (job.operation === "upsert") {
        await admin.from("knowledge_base").update({ dify_sync_status: failed ? "failed" : "pending" }).eq("id", job.knowledge_base_id)
      }
      results.push({ id: job.id, ok: false, error: message })
    }
  }
  return jsonResponse({ ok: true, processed: results.length, results })
})
