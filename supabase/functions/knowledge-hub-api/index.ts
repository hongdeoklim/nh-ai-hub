/**
 * knowledge-hub-api — 지식 허브(두뇌) 현황·검수 API
 *
 * POST /functions/v1/knowledge-hub-api
 * Body: { action: "stats" | "queue" | "retry" | "search_test", ... }
 *
 * - stats:       저장소별 색인 현황 집계 (company_documents / nh_knowledge_nodes /
 *                nh_ingest_queue / document_chunks / user_long_term_memory)
 * - queue:       nh_ingest_queue 최근 항목 + 파일명 (limit 기본 50)
 * - retry:       failed 큐 항목을 pending 으로 되돌리고 ingest-worker 를 즉시 기동
 * - search_test: 질문을 실제 답변 파이프라인과 동일한 병합 검색으로 조회해
 *                어떤 문서 조각이 근거로 쓰이는지 미리보기
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts"
import { retrieveCompanyDocumentMatches } from "../_shared/company-documents-rag.ts"
import {
  embedTextWithGeminiDim,
  GEMINI_KG_EMBEDDING_DIM,
  GEMINI_KG_EMBEDDING_MODEL_TAG,
} from "../_shared/gemini-embeddings.ts"

/** 표준 임베딩 태그가 아닌(레거시 OpenAI·미임베딩) 노드 필터 */
const LEGACY_NODE_FILTER =
  `embedding_model.is.null,embedding_model.neq.${GEMINI_KG_EMBEDDING_MODEL_TAG}`

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

async function safeCount(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  try {
    const { count, error } = await query
    if (error) return -1
    return count ?? 0
  } catch {
    return -1
  }
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== "POST") return jsonResponse({ error: "POST required" }, 405)

  const supabaseUrl = readEnv("SUPABASE_URL")
  const anonKey = readEnv("SUPABASE_ANON_KEY")
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: "서버 설정 오류" }, 500)
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401)
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, "")

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return jsonResponse({ error: "Invalid session" }, 401)
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400)
  }

  const action = typeof body.action === "string" ? body.action : ""

  // ── stats ──────────────────────────────────────────────────────────────
  if (action === "stats") {
    const [
      kbDocuments,
      companyChunks,
      companyChunksNoEmbedding,
      graphNodes,
      graphNodesEmbedded,
      graphNodesLegacyEmbedding,
      notebookChunks,
      memoryRows,
      queuePending,
      queueProcessing,
      queueDone,
      queueFailed,
    ] = await Promise.all([
      safeCount(
        admin.from("knowledge_base").select("id", { count: "exact", head: true })
          .is("deleted_at", null),
      ),
      safeCount(
        admin.from("company_documents").select("id", { count: "exact", head: true }),
      ),
      safeCount(
        admin.from("company_documents").select("id", { count: "exact", head: true })
          .is("embedding", null),
      ),
      safeCount(
        admin.from("nh_knowledge_nodes").select("id", { count: "exact", head: true }),
      ),
      safeCount(
        admin.from("nh_knowledge_nodes").select("id", { count: "exact", head: true })
          .not("embedding", "is", null),
      ),
      safeCount(
        admin.from("nh_knowledge_nodes").select("id", { count: "exact", head: true })
          .or(LEGACY_NODE_FILTER),
      ),
      safeCount(
        admin.from("document_chunks").select("id", { count: "exact", head: true }),
      ),
      safeCount(
        admin.from("user_long_term_memory").select("id", { count: "exact", head: true }),
      ),
      safeCount(
        admin.from("nh_ingest_queue").select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ),
      safeCount(
        admin.from("nh_ingest_queue").select("id", { count: "exact", head: true })
          .eq("status", "processing"),
      ),
      safeCount(
        admin.from("nh_ingest_queue").select("id", { count: "exact", head: true })
          .eq("status", "done"),
      ),
      safeCount(
        admin.from("nh_ingest_queue").select("id", { count: "exact", head: true })
          .eq("status", "failed"),
      ),
    ])

    return jsonResponse({
      ok: true,
      stats: {
        kbDocuments,
        companyChunks,
        companyChunksNoEmbedding,
        graphNodes,
        graphNodesEmbedded,
        graphNodesNoEmbedding:
          graphNodes >= 0 && graphNodesEmbedded >= 0
            ? graphNodes - graphNodesEmbedded
            : -1,
        graphNodesLegacyEmbedding,
        standardEmbeddingModel: GEMINI_KG_EMBEDDING_MODEL_TAG,
        notebookChunks,
        memoryRows,
        queue: {
          pending: queuePending,
          processing: queueProcessing,
          done: queueDone,
          failed: queueFailed,
        },
      },
    })
  }

  // ── queue ──────────────────────────────────────────────────────────────
  if (action === "queue") {
    const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 200)
    const { data, error } = await admin
      .from("nh_ingest_queue")
      .select(
        "id, status, retry_count, error_message, created_at, processed_at, knowledge_base(file_name, category)",
      )
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) return jsonResponse({ error: error.message }, 500)

    const rows = (data ?? []).map((row: Record<string, unknown>) => {
      const kb = row.knowledge_base as
        | { file_name?: string; category?: string }
        | null
      return {
        id: row.id,
        status: row.status,
        retryCount: row.retry_count,
        errorMessage: row.error_message,
        createdAt: row.created_at,
        processedAt: row.processed_at,
        fileName: kb?.file_name ?? "(삭제된 문서)",
        category: kb?.category ?? null,
      }
    })
    return jsonResponse({ ok: true, rows })
  }

  // ── retry ──────────────────────────────────────────────────────────────
  if (action === "retry") {
    const queueId = typeof body.queueId === "string" ? body.queueId : null

    let resetQuery = admin
      .from("nh_ingest_queue")
      .update({ status: "pending", error_message: null, processed_at: null })
      .eq("status", "failed")
    if (queueId) resetQuery = resetQuery.eq("id", queueId)

    const { error: resetErr, count } = await resetQuery.select("id", {
      count: "exact",
    })
    if (resetErr) return jsonResponse({ error: resetErr.message }, 500)

    // 워커 즉시 기동 (사용자 JWT 그대로 전달)
    let worker: Record<string, unknown> = {}
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/ingest-worker`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 10 }),
      })
      worker = await res.json().catch(() => ({}))
    } catch (e) {
      worker = { error: e instanceof Error ? e.message : String(e) }
    }

    return jsonResponse({ ok: true, resetCount: count ?? 0, worker })
  }

  // ── reembed_nodes ──────────────────────────────────────────────────────
  // 임베딩 일원화 마이그레이션: 레거시(OpenAI·미임베딩) 노드를 표준 Gemini@1536 으로 재임베딩.
  // 호출당 limit 건 처리 후 잔여 건수를 반환 — 지식 허브에서 반복 클릭으로 완료.
  if (action === "reembed_nodes") {
    const geminiKey = readEnv("GEMINI_API_KEY") ??
      readEnv("GOOGLE_GENERATIVE_AI_API_KEY")
    if (!geminiKey) {
      return jsonResponse({ error: "GEMINI_API_KEY 가 설정되지 않았습니다." }, 500)
    }

    const limit = Math.min(Math.max(Number(body.limit ?? 20), 1), 50)
    const { data: rows, error: selErr } = await admin
      .from("nh_knowledge_nodes")
      .select("id, title, content")
      .or(LEGACY_NODE_FILTER)
      .order("created_at", { ascending: true })
      .limit(limit)
    if (selErr) return jsonResponse({ error: selErr.message }, 500)

    let processed = 0
    const failures: Array<{ id: string; message: string }> = []

    for (const row of rows ?? []) {
      const text = `${row.title ?? ""}\n${row.content ?? ""}`.trim()
      try {
        if (text.length < 2) {
          // 내용이 없는 노드 — 구형 벡터를 비우고 태그만 갱신해 무한 재시도 방지
          const { error: upErr } = await admin
            .from("nh_knowledge_nodes")
            .update({
              embedding: null,
              embedding_model: GEMINI_KG_EMBEDDING_MODEL_TAG,
              embedded_at: new Date().toISOString(),
            })
            .eq("id", row.id)
          if (upErr) throw new Error(upErr.message)
          processed++
          continue
        }
        const emb = await embedTextWithGeminiDim(
          geminiKey,
          text,
          GEMINI_KG_EMBEDDING_DIM,
        )
        const { error: upErr } = await admin
          .from("nh_knowledge_nodes")
          .update({
            embedding: `[${emb.join(",")}]`,
            embedding_model: GEMINI_KG_EMBEDDING_MODEL_TAG,
            embedded_at: new Date().toISOString(),
          })
          .eq("id", row.id)
        if (upErr) throw new Error(upErr.message)
        processed++
      } catch (e) {
        failures.push({
          id: String(row.id),
          message: e instanceof Error ? e.message : String(e),
        })
      }
    }

    const remaining = await safeCount(
      admin.from("nh_knowledge_nodes").select("id", { count: "exact", head: true })
        .or(LEGACY_NODE_FILTER),
    )

    return jsonResponse({
      ok: true,
      processed,
      failed: failures.length,
      failures: failures.slice(0, 5),
      remaining,
    })
  }

  // ── search_test ────────────────────────────────────────────────────────
  if (action === "search_test") {
    const query = typeof body.query === "string" ? body.query.trim() : ""
    if (query.length < 2) {
      return jsonResponse({ error: "query 는 2자 이상이어야 합니다." }, 400)
    }

    const matches = await retrieveCompanyDocumentMatches({
      admin,
      userClient,
      geminiKey: readEnv("GEMINI_API_KEY"),
      openaiKey: readEnv("OPENAI_API_KEY"),
      query,
      matchCount: Math.min(Math.max(Number(body.matchCount ?? 8), 1), 20),
      similarityThreshold: 0.2,
    })

    return jsonResponse({
      ok: true,
      matches: matches.map((m) => ({
        fileName: m.fileName,
        chunkIndex: m.chunkIndex,
        similarity: m.similarity,
        snippet: m.content.slice(0, 400),
      })),
    })
  }

  return jsonResponse(
    { error: "action 은 stats | queue | retry | search_test 중 하나여야 합니다." },
    400,
  )
})
