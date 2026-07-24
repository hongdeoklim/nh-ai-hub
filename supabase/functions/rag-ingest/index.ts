import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts"
import { embedTextWithGemini } from "../_shared/gemini-embeddings.ts"

/**
 * rag-ingest
 *
 * 텍스트를 받아서 청킹 → Gemini 임베딩 → company_documents INSERT
 * company_documents INSERT 시 DB 트리거가 자동으로 dify-sync-webhook 호출
 *
 * 호출: syncGoogleDriveFolderToRag, ingestDocumentToRag
 */

const CHUNK_SIZE = 800   // 청크당 글자 수
const CHUNK_OVERLAP = 100

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

function chunkText(text: string): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length)
    const chunk = text.slice(start, end).trim()
    if (chunk.length > 20) chunks.push(chunk)
    start += CHUNK_SIZE - CHUNK_OVERLAP
  }
  return chunks
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== "POST") return jsonResponse({ error: "POST required." }, 405)

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401)

  const supabaseUrl = readEnv("SUPABASE_URL")
  const anonKey = readEnv("SUPABASE_ANON_KEY")
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")
  const geminiKey = readEnv("GEMINI_API_KEY")

  if (!supabaseUrl || !anonKey || !serviceKey || !geminiKey) {
    return jsonResponse({ error: "Server config missing" }, 500)
  }

  // 인증: JWT 또는 service role key
  const bearer = authHeader.replace(/^Bearer\s+/i, "")
  let uploadedBy: string | null = null

  if (bearer === serviceKey) {
    uploadedBy = null // 내부 호출 (Drive 동기화 등)
  } else {
    const userClient = createClient(supabaseUrl, anonKey)
    const { data } = await userClient.auth.getUser(bearer)
    if (!data.user) return jsonResponse({ error: "Unauthorized" }, 401)
    uploadedBy = data.user.id
  }

  let body: { fileName?: string; text?: string }
  try { body = await req.json() } catch { return jsonResponse({ error: "Invalid JSON" }, 400) }

  const fileName = body.fileName?.trim()
  const text = body.text?.trim()

  if (!fileName || !text || text.length < 20) {
    return jsonResponse({ error: "fileName and text (min 20 chars) are required" }, 400)
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // AI 사용료 절감: 원문 해시가 기존과 같으면 임베딩 호출 없이 스킵.
  // (야간 Drive 동기화가 변경 없는 문서를 매일 재임베딩하던 과금 누수 차단)
  const contentHash = await sha256Hex(text)
  const { data: existing } = await admin
    .from("company_documents")
    .select("content_hash")
    .eq("file_name", fileName)
    .limit(1)
    .maybeSingle()
  if (existing?.content_hash === contentHash) {
    return jsonResponse({ ok: true, skipped: true, fileName, reason: "unchanged content" })
  }

  const chunks = chunkText(text)
  const rows: Array<Record<string, unknown>> = []
  const errors: Array<{ chunk_index: number; message: string }> = []

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!
    try {
      const embedding = await embedTextWithGemini(geminiKey, chunk)
      rows.push({
        file_name: fileName,
        content: chunk,
        chunk_index: i,
        embedding: `[${embedding.join(",")}]`,
        uploaded_by: uploadedBy,
        content_hash: contentHash,
      })
    } catch (e) {
      errors.push({ chunk_index: i, message: e instanceof Error ? e.message : String(e) })
    }
  }

  // 임베딩이 전부 실패하면 기존 청크를 지우지 않고 그대로 둔다.
  if (rows.length === 0) {
    return jsonResponse({ ok: false, fileName, chunks_total: chunks.length, inserted: 0, errors }, 500)
  }

  // 같은 파일명의 기존 청크 삭제 (upsert 효과)
  await admin.from("company_documents").delete().eq("file_name", fileName)

  // 일괄 INSERT 1문 — dify-sync 웹훅 트리거(문 단위)가 문서당 1회만 발동된다.
  let inserted = 0
  const { error: insertError } = await admin.from("company_documents").insert(rows)
  if (insertError) {
    errors.push({ chunk_index: -1, message: insertError.message })
  } else {
    inserted = rows.length
  }

  return jsonResponse({
    ok: inserted > 0,
    fileName,
    chunks_total: chunks.length,
    inserted,
    errors: errors.length > 0 ? errors : undefined,
  })
})
