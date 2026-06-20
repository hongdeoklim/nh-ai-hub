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
  if (bearer === service) return true
  const { data } = await createClient(Deno.env.get("SUPABASE_URL") || "", anon).auth.getUser(bearer)
  if (!data.user) return false
  const { data: profile } = await admin.from("users").select("is_admin").eq("id", data.user.id).maybeSingle()
  return profile?.is_admin === true
}

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
  const { data: jobs, error } = await admin.from("knowledge_sync_jobs")
    .select("id,knowledge_base_id,operation,attempts,snapshot")
    .eq("status", "pending").lte("available_at", new Date().toISOString())
    .order("created_at").limit(limit)
  if (error) return jsonResponse({ error: error.message }, 500)

  const results: Array<Record<string, unknown>> = []
  for (const job of (jobs || []) as SyncJob[]) {
    await admin.from("knowledge_sync_jobs").update({ status: "processing" }).eq("id", job.id).eq("status", "pending")
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
        if (row.dify_document_id) {
          await fetch(`${difyUrl}/v1/datasets/${datasetId}/documents/${row.dify_document_id}`, {
            method: "DELETE", headers: { Authorization: `Bearer ${difyKey}` },
          })
        }
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
        await admin.from("knowledge_base").update({
          dify_document_id: payload.document?.id || null,
          dify_sync_status: "synced",
          dify_synced_at: new Date().toISOString(),
        }).eq("id", row.id)
      }
      await admin.from("knowledge_sync_jobs").update({ status: "done", processed_at: new Date().toISOString(), last_error: null }).eq("id", job.id)
      results.push({ id: job.id, ok: true, operation: job.operation })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      const attempts = job.attempts + 1
      const failed = attempts >= 5
      await admin.from("knowledge_sync_jobs").update({
        status: failed ? "failed" : "pending",
        attempts,
        available_at: new Date(Date.now() + Math.min(3600, 2 ** attempts * 60) * 1000).toISOString(),
        last_error: message,
      }).eq("id", job.id)
      if (job.operation === "upsert") await admin.from("knowledge_base").update({ dify_sync_status: "failed" }).eq("id", job.knowledge_base_id)
      results.push({ id: job.id, ok: false, error: message })
    }
  }
  return jsonResponse({ ok: true, processed: results.length, results })
})
