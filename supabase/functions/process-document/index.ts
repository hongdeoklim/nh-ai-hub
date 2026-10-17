import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.8"

import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts"
import { embedWorkCaseText } from "../_shared/embeddings.ts"
import { downloadFromGCS } from "../_shared/gcs.ts"
import { parseDocumentBytes, type ParsedDocument } from "../_shared/notebook-document-parser.ts"
import {
  extractEntitiesAndRelations,
  type PeerDocSummary,
} from "../_shared/notebook-llm-extract.ts"

/**
 * process-document — 업로드된 문서를 RAG·지식 그래프용으로 처리한다.
 *
 * 호출: 노트북 업로드(user_upload)·사내 자료실 업로드(knowledge_base) 직후 클라이언트가 호출
 *   (src/services/notebook/processDocumentClient.ts). 마이그레이션 20260524100000·20260525100000 이
 *   설계해 둔 함수인데 본체가 저장소에 없어, 바이너리 문서의 본문이 어디에도 색인되지 않았다.
 *
 * 처리
 *   1) 원본을 GCS 에서 내려받아 본문 추출 (PDF·HWPX·엑셀·CSV·텍스트 — _shared/notebook-document-parser.ts)
 *   2) document_chunks 에 청크 저장 + OpenAI text-embedding-3-small(1536) 임베딩 (키가 없으면 키워드 검색만)
 *   3) document_entities · document_relations 에 핵심 개체와 다른 문서와의 관계 저장
 *
 * 권한: user_upload 는 본인 문서만, knowledge_base 는 업로더 또는 관리자만 처리할 수 있다.
 */

type SourceKind = "knowledge_base" | "user_upload"

/** 한 문서에서 처리할 최대 청크 수 (Edge 시간 제한·임베딩 비용 상한) */
const MAX_CHUNKS = 120
/** 동시에 보낼 임베딩 요청 수 */
const EMBED_CONCURRENCY = 4
/** 관계 비교에 쓰는 같은 종류의 최근 문서 수 */
const PEER_LIMIT = 15

type LoadedDocument = {
  id: string
  fileName: string
  fileUrl: string
  kind: string
  ownerId: string | null
}

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)?.trim()
  return v && v.length > 0 ? v : undefined
}

function extOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".")
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : ""
}

async function loadDocument(
  admin: SupabaseClient,
  documentId: string,
  sourceKind: SourceKind,
): Promise<LoadedDocument | null> {
  if (sourceKind === "user_upload") {
    const { data } = await admin
      .from("user_uploaded_documents")
      .select("id, user_id, kind, original_name, storage_object_path")
      .eq("id", documentId)
      .maybeSingle()
    if (!data) return null
    return {
      id: data.id,
      fileName: data.original_name ?? "upload.bin",
      fileUrl: data.storage_object_path ?? "",
      kind: data.kind ?? extOf(data.original_name ?? ""),
      ownerId: data.user_id ?? null,
    }
  }

  const { data } = await admin
    .from("knowledge_base")
    .select("id, uploader_id, file_name, file_url, deleted_at")
    .eq("id", documentId)
    .maybeSingle()
  if (!data || data.deleted_at) return null
  return {
    id: data.id,
    fileName: data.file_name ?? "document",
    fileUrl: data.file_url ?? "",
    kind: extOf(data.file_name ?? ""),
    ownerId: data.uploader_id ?? null,
  }
}

async function isAdmin(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.from("users").select("is_admin").eq("id", userId).maybeSingle()
  return data?.is_admin === true
}

/** 같은 종류의 최근 문서 — LLM 이 관계를 찾을 비교 대상 */
async function loadPeers(
  admin: SupabaseClient,
  doc: LoadedDocument,
  sourceKind: SourceKind,
): Promise<PeerDocSummary[]> {
  const peerRows = sourceKind === "user_upload"
    ? (await admin
      .from("user_uploaded_documents")
      .select("id, original_name")
      .eq("user_id", doc.ownerId ?? "")
      .neq("id", doc.id)
      .order("created_at", { ascending: false })
      .limit(PEER_LIMIT)).data?.map((r) => ({ id: r.id as string, fileName: (r.original_name ?? "") as string }))
    : (await admin
      .from("knowledge_base")
      .select("id, file_name")
      .is("deleted_at", null)
      .neq("id", doc.id)
      .order("created_at", { ascending: false })
      .limit(PEER_LIMIT)).data?.map((r) => ({ id: r.id as string, fileName: (r.file_name ?? "") as string }))

  const peers = peerRows ?? []
  if (peers.length === 0) return []
  const ids = peers.map((p) => p.id)

  const [{ data: firstChunks }, { data: entities }] = await Promise.all([
    admin.from("document_chunks").select("document_id, content").in("document_id", ids).eq("chunk_index", 0),
    admin.from("document_entities").select("document_id, entity_value").in("document_id", ids),
  ])
  const snippetById = new Map((firstChunks ?? []).map((c) => [c.document_id as string, (c.content ?? "") as string]))
  const entitiesById = new Map<string, string[]>()
  for (const e of entities ?? []) {
    const list = entitiesById.get(e.document_id as string) ?? []
    if (list.length < 12) list.push(String(e.entity_value))
    entitiesById.set(e.document_id as string, list)
  }

  return peers.map((p) => ({
    id: p.id,
    fileName: p.fileName,
    snippet: snippetById.get(p.id) ?? "",
    existingEntities: entitiesById.get(p.id) ?? [],
  }))
}

async function embedAll(texts: string[], openaiKey: string | undefined): Promise<Array<number[] | null>> {
  const out: Array<number[] | null> = new Array(texts.length).fill(null)
  if (!openaiKey) return out
  let cursor = 0
  const worker = async () => {
    while (cursor < texts.length) {
      const i = cursor++
      try {
        out[i] = await embedWorkCaseText(openaiKey, texts[i]!)
      } catch (e) {
        console.warn("[process-document] 임베딩 실패", i, e instanceof Error ? e.message : e)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(EMBED_CONCURRENCY, texts.length) }, worker))
  return out
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "POST required." }, 405)

  const supabaseUrl = readEnv("SUPABASE_URL")
  const anonKey = readEnv("SUPABASE_ANON_KEY")
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ ok: false, error: "서버 설정 오류" }, 500)
  }

  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  const { data: userData } = await createClient(supabaseUrl, anonKey).auth.getUser(jwt)
  const user = userData?.user
  if (!user) return jsonResponse({ ok: false, error: "세션이 유효하지 않습니다." }, 401)

  let body: { document_id?: unknown; source_kind?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, 400)
  }
  const documentId = typeof body.document_id === "string" ? body.document_id.trim() : ""
  const sourceKind: SourceKind = body.source_kind === "knowledge_base" ? "knowledge_base" : "user_upload"
  if (!documentId) return jsonResponse({ ok: false, error: "document_id 가 필요합니다." }, 400)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const doc = await loadDocument(admin, documentId, sourceKind)
  if (!doc) return jsonResponse({ ok: false, error: "문서를 찾을 수 없습니다." }, 404)

  const allowed = doc.ownerId === user.id || (sourceKind === "knowledge_base" && await isAdmin(admin, user.id))
  if (!allowed) return jsonResponse({ ok: false, error: "이 문서를 처리할 권한이 없습니다." }, 403)
  if (!doc.fileUrl) return jsonResponse({ ok: false, error: "원본 파일 위치가 없습니다." }, 422)

  // 1) 본문 추출
  let parsed: ParsedDocument
  try {
    const bytes = await downloadFromGCS(doc.fileUrl)
    parsed = await parseDocumentBytes(bytes, doc.fileName, doc.kind)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error("[process-document] 다운로드·추출 실패", documentId, message)
    return jsonResponse({ ok: false, error: `문서를 읽지 못했습니다: ${message}` }, 502)
  }

  const truncated = parsed.sections.length > MAX_CHUNKS
  const sections = parsed.sections.slice(0, MAX_CHUNKS)

  // 2) 청크 + 임베딩. (document_id, page_number, chunk_index) 고유 인덱스라 upsert 로 덮어쓰고,
  //    이번에 없는 이전 청크만 지운다 — 실패해도 기존 청크가 통째로 사라지지 않는다.
  const embeddings = await embedAll(sections.map((s) => s.content), readEnv("OPENAI_API_KEY"))
  const chunkRows = sections.map((s, i) => ({
    document_id: doc.id,
    source_kind: sourceKind,
    filename: doc.fileName,
    content: s.content,
    page_number: s.pageNumber,
    chunk_index: s.chunkIndex,
    embedding: embeddings[i] ? `[${embeddings[i]!.join(",")}]` : null,
  }))
  let keptIds: string[] = []
  if (chunkRows.length > 0) {
    const { data: saved, error: upsertError } = await admin
      .from("document_chunks")
      .upsert(chunkRows, { onConflict: "document_id,page_number,chunk_index" })
      .select("id")
    if (upsertError) {
      console.error("[process-document] 청크 저장 실패", upsertError.message)
      return jsonResponse({ ok: false, error: `청크 저장 실패: ${upsertError.message}` }, 500)
    }
    keptIds = (saved ?? []).map((row: { id: string }) => row.id)
  }
  // 이번 결과에 없는 예전 청크(이전 처리·다른 파이프라인이 남긴 것) 정리
  const cleanup = admin.from("document_chunks").delete().eq("document_id", doc.id)
  const { error: cleanupError } = keptIds.length > 0
    ? await cleanup.not("id", "in", `(${keptIds.join(",")})`)
    : await cleanup
  if (cleanupError) console.warn("[process-document] 이전 청크 정리 실패", cleanupError.message)

  // 3) 개체·관계 (실패해도 청크 처리 결과는 유지)
  let entityCount = 0
  let relationCount = 0
  try {
    const peers = await loadPeers(admin, doc, sourceKind)
    const extraction = await extractEntitiesAndRelations(doc.fileName, parsed.fullText, doc.id, peers)

    const seenEntities = new Set<string>()
    const entityRows = extraction.entities
      .filter((e) => {
        const key = `${e.entity_type}|${e.entity_value.toLowerCase()}`
        if (seenEntities.has(key)) return false
        seenEntities.add(key)
        return true
      })
      .map((e) => ({
        document_id: doc.id,
        source_kind: sourceKind,
        entity_type: e.entity_type,
        entity_value: e.entity_value,
        confidence: e.confidence,
      }))
    await admin.from("document_entities").delete().eq("document_id", doc.id)
    if (entityRows.length > 0) {
      const { error } = await admin.from("document_entities").insert(entityRows)
      if (error) console.warn("[process-document] 개체 저장 실패", error.message)
      else entityCount = entityRows.length
    }

    // 비교 대상 목록에 있는 문서로만 관계를 만든다 (모델이 지어낸 id 차단)
    const peerIds = new Set(peers.map((p) => p.id))
    const seenRelations = new Set<string>()
    const relationRows = extraction.relations
      .filter((r) => peerIds.has(r.target_document_id) && r.target_document_id !== doc.id)
      .filter((r) => {
        const key = `${r.target_document_id}|${r.relation_type}`
        if (seenRelations.has(key)) return false
        seenRelations.add(key)
        return true
      })
      .map((r) => ({
        source_doc_id: doc.id,
        target_doc_id: r.target_document_id,
        source_kind: sourceKind,
        target_kind: sourceKind,
        relation_type: r.relation_type,
        description: r.description,
        weight: r.weight,
      }))
    await admin.from("document_relations").delete().eq("source_doc_id", doc.id)
    if (relationRows.length > 0) {
      const { error } = await admin.from("document_relations").insert(relationRows)
      if (error) console.warn("[process-document] 관계 저장 실패", error.message)
      else relationCount = relationRows.length
    }
  } catch (e) {
    console.warn("[process-document] 개체·관계 추출 실패", e instanceof Error ? e.message : e)
  }

  return jsonResponse({
    ok: true,
    chunks: chunkRows.length,
    embedded: embeddings.filter(Boolean).length,
    entities: entityCount,
    relations: relationCount,
    parse_method: parsed.parseMethod,
    truncated,
  })
})
