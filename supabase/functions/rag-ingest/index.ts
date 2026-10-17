import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts"
import { embedTextWithGemini } from "../_shared/gemini-embeddings.ts"
import { embedWorkCaseText } from "../_shared/embeddings.ts"

/**
 * rag-ingest
 *
 * 1) 기본(company_documents): 텍스트를 받아서 청킹 → Gemini 임베딩 → INSERT
 *    (INSERT 시 DB 트리거가 자동으로 dify-sync-webhook 호출)
 * 2) targetTable=work_cases: title+content → OpenAI 1536차원 임베딩 → work_cases INSERT
 *    (관리자 전용. messageFeedbackId 가 있으면 message_feedbacks RAG 반영 플래그 갱신)
 *
 * 호출: syncGoogleDriveFolderToRag, ingestDocumentToRag, ChatAudit(자가학습 RAG)
 */

const CHUNK_SIZE = 800   // 청크당 글자 수
const CHUNK_OVERLAP = 100

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

/** 동시에 보낼 임베딩 요청 수 (Gemini 분당 한도와 처리 시간의 절충) */
const EMBED_CONCURRENCY = 4
/** 이전 청크를 지울 때 한 번에 넘길 id 수 (요청 URL 길이 제한) */
const DELETE_BATCH = 200

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

  let body: {
    fileName?: string
    text?: string
    targetTable?: string
    title?: string
    content?: string
    messageFeedbackId?: string
  }
  try { body = await req.json() } catch { return jsonResponse({ error: "Invalid JSON" }, 400) }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // ---------------------------------------------------------------------------
  // 분기: work_cases 적재 (자가학습 RAG — OpenAI 1536차원, match_work_cases 와 동일 계열)
  // ---------------------------------------------------------------------------
  if (body.targetTable === "work_cases") {
    // 관리자 전용 (service role 내부 호출은 통과)
    if (uploadedBy !== null) {
      const { data: userRow } = await admin
        .from("users")
        .select("role, is_admin")
        .eq("id", uploadedBy)
        .maybeSingle()
      const row = userRow as { role?: string | null; is_admin?: boolean | null } | null
      const isAdmin =
        row?.is_admin === true ||
        String(row?.role ?? "").trim().toLowerCase() === "admin"
      if (!isAdmin) {
        return jsonResponse({ ok: false, error: "관리자 권한이 없습니다." }, 403)
      }
    }

    const openaiKey = readEnv("OPENAI_API_KEY")
    if (!openaiKey) {
      return jsonResponse({ ok: false, error: "OPENAI_API_KEY is not configured." }, 503)
    }

    const title = body.title?.trim()
    const content = body.content?.trim()
    if (!title || !content || content.length < 20) {
      return jsonResponse(
        { ok: false, error: "title and content (min 20 chars) are required" },
        400,
      )
    }

    try {
      // accumulate_new_case / dify-knowledge-bridge "cases" 검색과 동일한 임베딩 포맷
      const embedding = await embedWorkCaseText(openaiKey, `${title}\n\n${content}`)

      const { data: inserted, error: insertErr } = await admin
        .from("work_cases")
        .insert({ title, content, embedding })
        .select("id")
        .single()

      if (insertErr) {
        return jsonResponse({ ok: false, error: insertErr.message }, 500)
      }

      const workCaseId = (inserted as { id: string }).id
      let feedbackUpdated = false

      const messageFeedbackId = body.messageFeedbackId?.trim()
      if (messageFeedbackId) {
        const { error: fbErr } = await admin
          .from("message_feedbacks")
          .update({
            is_rag_applied: true,
            rag_applied_at: new Date().toISOString(),
            work_case_id: workCaseId,
          })
          .eq("id", messageFeedbackId)
        if (fbErr) {
          console.error("[rag-ingest] message_feedbacks update failed:", fbErr.message)
        } else {
          feedbackUpdated = true
        }
      }

      return jsonResponse({ ok: true, workCaseId, feedbackUpdated })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return jsonResponse({ ok: false, error: msg }, 500)
    }
  }

  // ---------------------------------------------------------------------------
  // 기본: company_documents 청킹 적재 (Gemini 임베딩)
  // ---------------------------------------------------------------------------
  const fileName = body.fileName?.trim()
  const text = body.text?.trim()

  if (!fileName || !text || text.length < 20) {
    return jsonResponse({ error: "fileName and text (min 20 chars) are required" }, 400)
  }

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
  const errors: Array<{ chunk_index: number; message: string }> = []
  const embeddings: Array<number[] | null> = new Array(chunks.length).fill(null)

  // 큰 문서가 드라이브 동기화의 파일당 시간 제한에 걸리지 않도록 청크를 몇 개씩 동시에 임베딩한다
  let cursor = 0
  const worker = async () => {
    while (cursor < chunks.length) {
      const i = cursor++
      try {
        embeddings[i] = await embedTextWithGemini(geminiKey, chunks[i]!)
      } catch (e) {
        errors.push({ chunk_index: i, message: e instanceof Error ? e.message : String(e) })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(EMBED_CONCURRENCY, chunks.length) }, worker))

  // 일부 청크라도 실패하면 해시를 저장하지 않는다. 저장하면 다음 동기화가 "변경 없음"으로
  // 건너뛰어 빠진 청크가 영원히 채워지지 않는다.
  const complete = errors.length === 0
  const rows: Array<Record<string, unknown>> = []
  embeddings.forEach((embedding, i) => {
    if (!embedding) return
    rows.push({
      file_name: fileName,
      content: chunks[i]!,
      chunk_index: i,
      embedding: `[${embedding.join(",")}]`,
      uploaded_by: uploadedBy,
      content_hash: complete ? contentHash : null,
    })
  })

  // 임베딩이 전부 실패하면 기존 청크를 지우지 않고 그대로 둔다.
  if (rows.length === 0) {
    errors.sort((a, b) => a.chunk_index - b.chunk_index)
    return jsonResponse({ ok: false, fileName, chunks_total: chunks.length, inserted: 0, errors }, 500)
  }

  // 기존 청크 id 를 먼저 확보하고, 새 청크 INSERT 가 성공한 뒤에만 지운다.
  // (예전에는 먼저 지우고 넣어서 INSERT 가 실패하면 문서가 통째로 사라졌다)
  const { data: oldRows } = await admin
    .from("company_documents")
    .select("id")
    .eq("file_name", fileName)
  const oldIds = (oldRows ?? []).map((row: { id: string }) => row.id)

  // 일괄 INSERT 1문 — dify-sync 웹훅 트리거(문 단위)가 문서당 1회만 발동된다.
  const { error: insertError } = await admin.from("company_documents").insert(rows)
  if (insertError) {
    errors.push({ chunk_index: -1, message: insertError.message })
    return jsonResponse({ ok: false, fileName, chunks_total: chunks.length, inserted: 0, errors }, 500)
  }

  for (let start = 0; start < oldIds.length; start += DELETE_BATCH) {
    const batch = oldIds.slice(start, start + DELETE_BATCH)
    const { error: deleteError } = await admin.from("company_documents").delete().in("id", batch)
    if (deleteError) errors.push({ chunk_index: -2, message: `이전 청크 정리 실패: ${deleteError.message}` })
  }

  errors.sort((a, b) => a.chunk_index - b.chunk_index)
  return jsonResponse({
    ok: true,
    fileName,
    chunks_total: chunks.length,
    inserted: rows.length,
    // 일부 청크가 빠졌으면 다음 동기화 때 다시 임베딩한다
    partial: !complete,
    errors: errors.length > 0 ? errors : undefined,
  })
})
