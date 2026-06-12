import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function handleCorsPreflight(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  return null
}

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  })
}

function readEnv(name: string): string {
  const val = Deno.env.get(name)
  if (!val) {
    throw new Error(`Missing environment variable: ${name}`)
  }
  return val
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== "POST") {
    return jsonResponse({ error: "Only POST is allowed" }, 405)
  }

  try {
    const supabaseUrl = readEnv("SUPABASE_URL")
    const anonKey = readEnv("SUPABASE_ANON_KEY")

    // 1. Auth Verify
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Authentication required" }, 401)
    }
    const jwt = authHeader.replace(/^Bearer\s+/i, "")

    const supabase = createClient(supabaseUrl, anonKey)
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
    if (userErr || !userData.user) {
      return jsonResponse({ error: "Invalid session" }, 401)
    }

    // 2. Parse request body
    const body = await req.json().catch(() => ({}))
    const title = body.title?.trim()
    const content = body.content?.trim()
    
    if (!title || !content) {
      return jsonResponse({ error: "Title and content are required" }, 400)
    }

    // 3. Get Dify API keys
    // In production, these should be set in Supabase Edge Function Secrets
    const difyApiUrl = Deno.env.get("DIFY_DATASET_API_URL") || "http://dify.nhnetworks.co.kr/v1/datasets"
    const difyDatasetId = Deno.env.get("DIFY_DATASET_ID")
    const difyApiKey = Deno.env.get("DIFY_DATASET_API_KEY")

    if (!difyDatasetId || !difyApiKey) {
      console.warn("[dify-dataset-sync] Missing DIFY_DATASET_ID or DIFY_DATASET_API_KEY. Skipping Dify sync.")
      return jsonResponse({ ok: true, skipped: true, message: "Dify credentials missing" })
    }

    const endpoint = `${difyApiUrl}/${difyDatasetId}/document/create_by_text`

    // 4. Send to Dify
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${difyApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: title,
        text: content,
        indexing_technique: "high_quality",
        process_rule: {
          mode: "automatic"
        }
      })
    })

    const payload = await res.json().catch(() => ({}))

    if (!res.ok) {
      console.error("[dify-dataset-sync] Dify API Error:", payload)
      return jsonResponse({ ok: false, error: payload.message || "Dify API error" }, res.status)
    }

    return jsonResponse({ ok: true, document: payload.document })
  } catch (err: any) {
    console.error("[dify-dataset-sync] Exception:", err)
    return jsonResponse({ ok: false, error: err.message }, 500)
  }
})
