import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google@3.0.75"
import { generateText } from "npm:ai@6.0.184"
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts"
import {
  embedTextWithGeminiDim,
  GEMINI_KG_EMBEDDING_DIM,
  GEMINI_KG_EMBEDDING_MODEL_TAG,
} from "../_shared/gemini-embeddings.ts"

/**
 * conversation-archiver
 *
 * 대화 종료 후 fire-and-forget으로 호출됨.
 * 1. Gemini Flash로 대화 핵심 Q&A 요약 + 개념 추출
 * 2. Dify knowledge base에 create_by_text 로 아카이브
 * 3. nh_knowledge_nodes 에 faq/concept 노드 생성
 * 4. 같은 대화에서 나온 노드끼리 related 엣지 연결
 */

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80)
    + '-' + Date.now().toString(36)
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401)

  const supabaseUrl = readEnv("SUPABASE_URL")
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")
  const geminiKey = readEnv("GEMINI_API_KEY")

  if (!supabaseUrl || !serviceKey || !geminiKey) {
    return jsonResponse({ error: "Server config missing" }, 500)
  }

  let body: { userId?: string; messages?: unknown[]; provider?: string; threadId?: string }
  try { body = await req.json() } catch { return jsonResponse({ error: "Invalid JSON" }, 400) }

  const { userId, messages, provider = "unknown", threadId } = body
  if (!userId || !Array.isArray(messages) || messages.length < 4) {
    // 메시지가 2턴(4개) 미만이면 아카이브할 내용 없음
    return jsonResponse({ ok: true, skipped: true, reason: "too_short" })
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // 이미 이 threadId로 아카이브된 기록이 있으면 중복 실행 방지
  if (threadId) {
    const { count } = await admin
      .from("nh_knowledge_nodes")
      .select("id", { count: "exact", head: true })
      .eq("metadata->>thread_id", threadId)
      .eq("node_type", "faq")
    if ((count ?? 0) > 0) {
      return jsonResponse({ ok: true, skipped: true, reason: "already_archived" })
    }
  }

  // 대화 로그 포맷팅
  const chatLog = (messages as Array<{ role: string; content: unknown }>)
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => `${m.role === "user" ? "Q" : "A"}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
    .join("\n\n")
    .slice(0, 12000) // Gemini 컨텍스트 제한 고려

  const google = createGoogleGenerativeAI({ apiKey: geminiKey })
  const model = google("gemini-2.5-flash")

  const extractionPrompt = `다음은 사용자와 AI의 대화 내역입니다. (사용 모델: ${provider})

아래 JSON 형식으로만 응답하십시오. 다른 텍스트는 일절 포함하지 마십시오.

{
  "title": "이 대화를 한 문장으로 요약한 제목 (20자 이내)",
  "summary": "이 대화에서 다룬 핵심 내용을 2~4문장으로 요약",
  "qa_pairs": [
    { "question": "핵심 질문 1", "answer": "핵심 답변 1" }
  ],
  "concepts": [
    { "name": "핵심 개념·키워드", "description": "한 줄 설명" }
  ]
}

규칙:
- qa_pairs: 대화에서 가장 중요한 Q&A 최대 3개
- concepts: 재사용 가능한 핵심 개념·용어·업무 키워드 최대 5개
- 일상적 인사말, 단순 확인 대화는 포함하지 말 것
- 추출할 내용이 없으면 qa_pairs와 concepts를 빈 배열로 반환

대화 내역:
${chatLog}`

  let extracted: {
    title: string
    summary: string
    qa_pairs: Array<{ question: string; answer: string }>
    concepts: Array<{ name: string; description: string }>
  }

  try {
    const { text } = await generateText({ model, prompt: extractionPrompt })
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim()
    extracted = JSON.parse(cleaned)
  } catch (e) {
    console.error("[conversation-archiver] Gemini extraction failed:", e)
    return jsonResponse({ error: "extraction_failed" }, 500)
  }

  if (!extracted.title || (!extracted.qa_pairs?.length && !extracted.concepts?.length)) {
    return jsonResponse({ ok: true, skipped: true, reason: "no_content" })
  }

  const results: Record<string, unknown> = { dify: null, nodes: [] }

  // 1. Dify에 대화 요약 아카이브 — 기본 차단.
  // 답변 파이프라인은 Dify 를 조회하지 않으므로(수동 dify-ax 채팅만 사용) 대화까지
  // Dify 데이터셋에 쌓는 것은 비용·노이즈만 유발한다. 필요 시 NH_ARCHIVE_TO_DIFY=true 로 재활성.
  const archiveToDify = ["true", "1", "on", "yes"].includes(
    (readEnv("NH_ARCHIVE_TO_DIFY") ?? "false").trim().toLowerCase(),
  )
  const difyUrl = readEnv("DIFY_API_URL")?.replace(/\/$/, "")
  const difyKey = readEnv("DIFY_DATASET_API_KEY") || readEnv("DIFY_API_KEY")
  const datasetId = readEnv("DIFY_DATASET_ID")

  if (!archiveToDify) {
    results.dify = { ok: true, skipped: true, reason: "disabled_by_default" }
  }

  if (archiveToDify && difyUrl && difyKey && datasetId) {
    const difyContent = [
      `# ${extracted.title}`,
      `> 출처: AI 대화 아카이브 | 모델: ${provider} | 날짜: ${new Date().toLocaleDateString("ko-KR")}`,
      "",
      `## 요약`,
      extracted.summary,
      "",
      ...(extracted.qa_pairs?.length
        ? ["## 주요 Q&A", ...extracted.qa_pairs.map(p => `**Q:** ${p.question}\n**A:** ${p.answer}`)]
        : []),
      "",
      ...(extracted.concepts?.length
        ? ["## 핵심 개념", ...extracted.concepts.map(c => `- **${c.name}**: ${c.description}`)]
        : []),
    ].join("\n")

    try {
      const difyRes = await fetch(`${difyUrl}/v1/datasets/${datasetId}/document/create_by_text`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${difyKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `[대화] ${extracted.title}`,
          text: difyContent,
          indexing_technique: "high_quality",
          process_rule: { mode: "automatic" },
        }),
      })
      if (difyRes.ok) {
        const payload = await difyRes.json()
        results.dify = { ok: true, document_id: payload.document?.id }
      } else {
        results.dify = { ok: false, status: difyRes.status }
      }
    } catch (e) {
      results.dify = { ok: false, error: String(e) }
    }
  }

  // 2. nh_knowledge_nodes — FAQ 노드 (대화 요약)
  const createdNodeIds: string[] = []
  const baseMetadata = { provider, thread_id: threadId ?? null, auto_archived: true }

  // 생성 시점에 표준 임베딩(Gemini@1536)을 바로 계산 — 임베딩 누락 노드 재발 방지 (실패 시 null 로 진행)
  const tryEmbedFields = async (text: string) => {
    try {
      const values = await embedTextWithGeminiDim(
        geminiKey,
        text,
        GEMINI_KG_EMBEDDING_DIM,
      )
      return {
        embedding: `[${values.join(",")}]`,
        embedding_model: GEMINI_KG_EMBEDDING_MODEL_TAG,
        embedded_at: new Date().toISOString(),
      }
    } catch (e) {
      console.warn("[conversation-archiver] 노드 임베딩 실패(무시):", e)
      return {}
    }
  }

  if (extracted.qa_pairs?.length) {
    const faqContent = extracted.qa_pairs
      .map(p => `Q: ${p.question}\nA: ${p.answer}`)
      .join("\n\n")

    const { data: faqNode, error: faqErr } = await admin
      .from("nh_knowledge_nodes")
      .insert({
        title: extracted.title,
        slug: slugify(extracted.title),
        node_type: "faq",
        visibility: "public",
        content: faqContent,
        owner_id: userId,
        metadata: { ...baseMetadata, summary: extracted.summary },
        ...(await tryEmbedFields(`${extracted.title}\n${faqContent}`)),
      })
      .select("id")
      .single()

    if (!faqErr && faqNode) {
      createdNodeIds.push(faqNode.id)
      ;(results.nodes as unknown[]).push({ type: "faq", id: faqNode.id })
    }
  }

  // 3. nh_knowledge_nodes — Concept 노드
  for (const concept of (extracted.concepts ?? [])) {
    if (!concept.name?.trim()) continue
    const { data: conceptNode, error: cErr } = await admin
      .from("nh_knowledge_nodes")
      .insert({
        title: concept.name,
        slug: slugify(concept.name),
        node_type: "concept",
        visibility: "public",
        content: concept.description ?? "",
        owner_id: userId,
        metadata: baseMetadata,
        ...(await tryEmbedFields(
          `${concept.name}\n${concept.description ?? ""}`,
        )),
      })
      .select("id")
      .single()

    if (!cErr && conceptNode) {
      createdNodeIds.push(conceptNode.id)
      ;(results.nodes as unknown[]).push({ type: "concept", id: conceptNode.id })
    }
  }

  // 4. 같은 대화에서 나온 노드끼리 related 엣지 연결
  if (createdNodeIds.length >= 2) {
    const sourceId = createdNodeIds[0]
    const edges = createdNodeIds.slice(1).map(targetId => ({
      source_node_id: sourceId,
      target_node_id: targetId,
      edge_type: "related",
      weight: 0.8,
      is_auto: true,
      metadata: baseMetadata,
    }))
    await admin.from("nh_knowledge_edges").insert(edges)
    results.edges_created = edges.length
  }

  return jsonResponse({ ok: true, title: extracted.title, results })
})
