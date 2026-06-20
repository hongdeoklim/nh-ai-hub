import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts"
import { embedTextWithGemini } from "../_shared/gemini-embeddings.ts"
import { embedWorkCaseText } from "../_shared/embeddings.ts"

/** Exact-key Dify HTTP tool bridge to Supabase RAG indexes. */
async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight
  if (req.method !== "POST") return jsonResponse({ error: "POST required." }, 405)

  const bridgeKey = Deno.env.get("DIFY_BRIDGE_API_KEY")
  if (!bridgeKey) return jsonResponse({ error: "DIFY_BRIDGE_API_KEY is not configured." }, 503)
  if (req.headers.get("Authorization") !== `Bearer ${bridgeKey}`) {
    return jsonResponse({ error: "Unauthorized." }, 401)
  }

  try {
    const body = await req.json() as { query?: string; limit?: number; type?: string }
    const query = body.query?.trim()
    const limit = Math.min(Math.max(Number(body.limit ?? 5), 1), 20)
    const type = body.type ?? "documents"
    if (!query) return jsonResponse({ error: "query is required." }, 400)

    const url = Deno.env.get("SUPABASE_URL") ?? ""
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

    let rows: any[] = []
    if (type === "documents") {
      const geminiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY") || ""
      if (!geminiKey) return jsonResponse({ error: "GEMINI_API_KEY is not configured." }, 503)
      const embedding = await embedTextWithGemini(geminiKey, query)
      const result = await admin.rpc("match_documents", {
        query_embedding: embedding,
        match_threshold: 0.7,
        match_count: limit,
      })
      if (result.error) throw result.error
      rows = result.data ?? []
    } else if (type === "cases") {
      const openaiKey = Deno.env.get("OPENAI_API_KEY") || ""
      if (!openaiKey) return jsonResponse({ error: "OPENAI_API_KEY is not configured." }, 503)
      const embedding = await embedWorkCaseText(openaiKey, query)
      const result = await admin.rpc("match_work_cases", {
        query_embedding: embedding,
        match_threshold: 0.7,
        match_count: limit,
      })
      if (result.error) throw result.error
      rows = result.data ?? []
    } else {
      return jsonResponse({ error: "type must be documents or cases." }, 400)
    }

    return jsonResponse({
      success: true,
      query,
      results: rows.map((row) => ({
        content: row.content || row.description,
        metadata: row.metadata || { title: row.title, file_name: row.file_name },
        similarity: row.similarity,
      })),
    })
  } catch (error) {
    console.error("[dify-knowledge-bridge]", error)
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal error" }, 500)
  }
}

Deno.serve(handler)
