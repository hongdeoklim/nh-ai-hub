import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { Storage } from "npm:@google-cloud/storage@7.11.2"
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts"

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight
  if (req.method !== "POST") return jsonResponse({ error: "POST required." }, 405)
  try {
    const auth = req.headers.get("Authorization")
    if (!auth?.startsWith("Bearer ")) return jsonResponse({ error: "Authentication required." }, 401)
    const url = Deno.env.get("SUPABASE_URL") || ""
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || ""
    const { data } = await createClient(url, anon).auth.getUser(auth.slice(7))
    if (!data.user) return jsonResponse({ error: "Invalid session." }, 401)

    const body = await req.json() as { fileName?: string; contentType?: string; namespace?: string }
    const fileName = body.fileName?.trim()
    if (!fileName || !body.contentType) return jsonResponse({ error: "fileName and contentType are required." }, 400)
    const rawKey = Deno.env.get("GCP_SERVICE_ACCOUNT_JSON") || Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY")
    const bucket = Deno.env.get("GCS_BUCKET_NAME")
    if (!rawKey || !bucket) return jsonResponse({ error: "GCS is not configured." }, 503)
    const credentials = JSON.parse(rawKey)
    const storage = new Storage({ projectId: credentials.project_id, credentials })
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180)
    const namespace = body.namespace === "knowledge_documents" ? "knowledge_documents" : "user_documents"
    const objectPath = `${namespace}/${data.user.id}/${crypto.randomUUID()}-${safeName}`
    const [uploadUrl] = await storage.bucket(bucket).file(objectPath).createResumableUpload({
      metadata: { contentType: body.contentType, metadata: { ownerId: data.user.id } },
      origin: req.headers.get("Origin") || undefined,
      highWaterMark: 1024 * 1024,
    })
    return jsonResponse({ uploadUrl, bucket, objectPath, method: "PUT", resumable: true })
  } catch (error) {
    console.error("[gcs-upload-url]", error)
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal error" }, 500)
  }
})
