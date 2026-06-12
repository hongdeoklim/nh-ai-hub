/**
 * ingest-worker — 지식 그래프 백그라운드 적재 워커
 *
 * POST /functions/v1/ingest-worker
 * Body: { limit?: number }   (처리할 최대 큐 항목 수, 기본 10)
 *
 * 흐름:
 *   nh_ingest_queue WHERE status='pending'
 *     → knowledge_base row 조회
 *     → 메타데이터 텍스트 구성
 *     → knowledge-ingest 호출 (nh_knowledge_nodes INSERT + 임베딩)
 *     → 큐 status 갱신 (done / failed)
 *
 * PDF 본문 전체는 로컬 backfill 스크립트(scratch/backfill-knowledge-graph.mjs)로 처리.
 * 워커는 "빠른 노드 생성(메타+요약)"을 보장하는 역할.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts"

const DEFAULT_LIMIT = 10
const MIN_TEXT_LENGTH = 20

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

type QueueRow = {
  id: string
  kb_document_id: string
  retry_count: number
}

type KbRow = {
  id: string
  file_name: string
  file_url: string | null
  category: string | null
  target_department: string | null
}

type IngestResult =
  | { ok: true; chunks_created: number; chunks_embedded: number }
  | { ok: false; error: string }

async function callKnowledgeIngest(
  params: {
    title: string
    content: string
    sourceFileName: string
    jwt: string
    supabaseUrl: string
    anonKey: string
  },
): Promise<IngestResult> {
  const res = await fetch(`${params.supabaseUrl}/functions/v1/knowledge-ingest`, {
    method: "POST",
    headers: {
      apikey: params.anonKey,
      Authorization: `Bearer ${params.jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "INSERT",
      title: params.title,
      content: params.content,
      source_file_name: params.sourceFileName,
      visibility: "public",
      metadata: { source: "knowledge_base_worker" },
    }),
  })
  const payload = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok) {
    return { ok: false, error: String(payload.error ?? `HTTP ${res.status}`) }
  }
  return {
    ok: true,
    chunks_created: Number(payload.chunks_created ?? 0),
    chunks_embedded: Number(payload.chunks_embedded ?? 0),
  }
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== "POST") {
    return jsonResponse({ error: "POST 만 허용" }, 405)
  }

  const supabaseUrl = readEnv("SUPABASE_URL")
  const anonKey    = readEnv("SUPABASE_ANON_KEY")
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: "서버 설정 오류" }, 500)
  }

  // 인증 검증
  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "인증 필요" }, 401)
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, "")

  const userClient = createClient(supabaseUrl, anonKey)
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return jsonResponse({ error: "세션 무효" }, 401)
  }

  // 요청 바디 파싱
  let limit = DEFAULT_LIMIT
  try {
    const body = await req.json() as Record<string, unknown>
    if (typeof body.limit === "number" && body.limit > 0) {
      limit = Math.min(body.limit, 50)
    }
  } catch { /* body 없으면 기본값 사용 */ }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // pending 큐 항목 조회 — 처리 중 중복 방지를 위해 status = 'processing' 으로 먼저 업데이트
  const { data: pendingRows, error: qErr } = await admin
    .from("nh_ingest_queue")
    .select("id, kb_document_id, retry_count")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit)

  if (qErr) {
    return jsonResponse({ error: `큐 조회 실패: ${qErr.message}` }, 500)
  }
  if (!pendingRows || pendingRows.length === 0) {
    return jsonResponse({ ok: true, processed: 0, message: "처리할 항목이 없습니다." })
  }

  const queueIds = (pendingRows as QueueRow[]).map((r) => r.id)

  // 처리 중 마킹 (중복 실행 방지)
  await admin
    .from("nh_ingest_queue")
    .update({ status: "processing" })
    .in("id", queueIds)

  const results: Array<{
    kb_id: string
    file_name: string
    ok: boolean
    chunks?: number
    error?: string
  }> = []

  for (const qRow of pendingRows as QueueRow[]) {
    // knowledge_base row 조회
    const { data: kb, error: kbErr } = await admin
      .from("knowledge_base")
      .select("id, file_name, file_url, category, target_department")
      .eq("id", qRow.kb_document_id)
      .maybeSingle()

    if (kbErr || !kb) {
      await admin
        .from("nh_ingest_queue")
        .update({ status: "failed", error_message: "knowledge_base row 없음", processed_at: new Date().toISOString() })
        .eq("id", qRow.id)
      results.push({ kb_id: qRow.kb_document_id, file_name: "?", ok: false, error: "row 없음" })
      continue
    }

    const kbRow = kb as KbRow

    // ── 인덱싱 텍스트 구성 ──────────────────────────────────────────────────
    // 대용량 PDF는 엣지 함수 메모리 한도로 인해 직접 파싱 불가.
    // 여기서는 파일명·카테고리·부서 메타데이터로 기본 노드를 즉시 생성하고,
    // 전체 본문 인덱싱은 backfill 스크립트(scratch/backfill-knowledge-graph.mjs)로 처리한다.
    const category = kbRow.category ?? "미분류"
    const department = kbRow.target_department ?? ""
    const fileUrl = kbRow.file_url ?? ""
    const ext = kbRow.file_name.split(".").pop()?.toUpperCase() ?? ""

    const ingestText = [
      `파일명: ${kbRow.file_name}`,
      `형식: ${ext} 문서`,
      `카테고리: ${category}`,
      department ? `담당 부서: ${department}` : null,
      `출처: ${fileUrl.slice(0, 120)}`,
    ].filter(Boolean).join("\n")

    if (ingestText.length < MIN_TEXT_LENGTH) {
      await admin
        .from("nh_ingest_queue")
        .update({ status: "failed", error_message: "텍스트 너무 짧음", processed_at: new Date().toISOString() })
        .eq("id", qRow.id)
      results.push({ kb_id: kbRow.id, file_name: kbRow.file_name, ok: false, error: "텍스트 너무 짧음" })
      continue
    }

    // 중복 방지: 같은 파일명으로 이미 노드가 2개 이상 있으면(backfill 등으로 이미 적재된 경우)
    // 덮어쓰지 않고 done 으로 마킹만 한다.
    const { data: existingDoc } = await admin
      .from("nh_knowledge_documents")
      .select("id")
      .eq("title", kbRow.file_name)
      .limit(1)
      .maybeSingle()

    if (existingDoc?.id) {
      const { count: existingNodeCount } = await admin
        .from("nh_knowledge_nodes")
        .select("*", { count: "exact", head: true })
        .eq("doc_id", existingDoc.id)

      if ((existingNodeCount ?? 0) >= 2) {
        // 이미 실제 내용으로 채워진 노드가 있음 → 덮어쓰지 않음
        await admin
          .from("nh_ingest_queue")
          .update({ status: "done", error_message: null, processed_at: new Date().toISOString() })
          .eq("id", qRow.id)
        results.push({ kb_id: kbRow.id, file_name: kbRow.file_name, ok: true, chunks: existingNodeCount ?? 0 })
        console.log(`[ingest-worker] 이미 ${existingNodeCount}개 노드 존재 — 스킵 (doc_id: ${existingDoc.id.slice(0, 8)}...)`)
        continue
      }

      // 노드가 0~1개(메타데이터만)이면 기존 노드 삭제 후 재적재
      if ((existingNodeCount ?? 0) === 1) {
        await admin.from("nh_knowledge_nodes").delete().eq("doc_id", existingDoc.id)
        console.log(`[ingest-worker] 메타데이터 노드 교체 (doc_id: ${existingDoc.id.slice(0, 8)}...)`)
      }
    }

    // knowledge-ingest 호출
    const ingestRes = await callKnowledgeIngest({
      title: kbRow.file_name,
      content: ingestText,
      sourceFileName: kbRow.file_name,
      jwt,
      supabaseUrl,
      anonKey,
    })

    if (ingestRes.ok) {
      await admin
        .from("nh_ingest_queue")
        .update({ status: "done", error_message: null, processed_at: new Date().toISOString() })
        .eq("id", qRow.id)
      results.push({ kb_id: kbRow.id, file_name: kbRow.file_name, ok: true, chunks: ingestRes.chunks_created })
    } else {
      // 3회 이상 실패 시 failed 로 마킹
      const retries = qRow.retry_count ?? 0
      const newStatus = retries >= 2 ? "failed" : "pending"
      await admin
        .from("nh_ingest_queue")
        .update({
          status: newStatus,
          retry_count: retries + 1,
          error_message: ingestRes.error,
          processed_at: newStatus === "failed" ? new Date().toISOString() : null,
        })
        .eq("id", qRow.id)
      results.push({ kb_id: kbRow.id, file_name: kbRow.file_name, ok: false, error: ingestRes.error })
    }
  }

  const succeeded = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok).length

  return jsonResponse({
    ok: true,
    processed: results.length,
    succeeded,
    failed,
    results,
  })
})
