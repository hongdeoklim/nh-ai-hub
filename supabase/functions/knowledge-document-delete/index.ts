import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts"
import { deleteFromGCS, objectPathFromGcsUrl } from "../_shared/gcs.ts"

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight
  if (req.method !== "POST") return jsonResponse({ error: "POST required." }, 405)
  const auth = req.headers.get("Authorization")
  if (!auth?.startsWith("Bearer ")) return jsonResponse({ error: "Authentication required." }, 401)
  const url = Deno.env.get("SUPABASE_URL") ?? ""
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  const { data: authData } = await createClient(url, anon).auth.getUser(auth.slice(7))
  if (!authData.user) return jsonResponse({ error: "Invalid session." }, 401)
  const { id } = await req.json().catch(() => ({ id: "" })) as { id?: string }
  if (!id) return jsonResponse({ error: "id is required." }, 400)
  const admin = createClient(url, service, { auth: { persistSession: false } })
  const { data: row, error } = await admin.from("knowledge_base")
    .select("id,uploader_id,file_url,storage_provider,storage_object_path,legal_hold")
    .eq("id", id).maybeSingle()
  if (error || !row) return jsonResponse({ error: "Document not found." }, 404)
  const { data: profile } = await admin.from("users").select("is_admin").eq("id", authData.user.id).maybeSingle()
  if (row.uploader_id !== authData.user.id && profile?.is_admin !== true) return jsonResponse({ error: "Forbidden." }, 403)
  if (row.legal_hold) return jsonResponse({ error: "Document is under legal hold." }, 409)
  if (row.storage_provider === "gcs" || row.file_url?.includes("storage.googleapis.com")) {
    const path = row.storage_object_path || objectPathFromGcsUrl(row.file_url || "")
    if (path) await deleteFromGCS(path)
  }
  const { error: deleteError } = await admin.from("knowledge_base").delete().eq("id", id)
  if (deleteError) return jsonResponse({ error: deleteError.message }, 500)
  return jsonResponse({ ok: true })
})
