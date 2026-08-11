import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts"
import { retrieveCompanyDocumentMatches } from "../_shared/company-documents-rag.ts"
import { embedWorkCaseText } from "../_shared/embeddings.ts"
import { logRagRetrieval } from "../_shared/rag-logging.ts"

/**
 * rag-eval — RAG 골든 질의 회귀 평가 (기획안 Phase 2-1)
 *
 * 검색 튜닝 전후로 실행해 적중률(hit@k)을 비교한다.
 * 호출: 관리자 JWT 또는 서비스 롤 키. 본문에 cases 를 주면 골든셋 대신 사용.
 *
 *   POST { cases?: [{type:"documents"|"cases", query, expect?: string[]}], matchCount?: number }
 */

type GoldenCase = {
  type: "documents" | "cases"
  query: string
  expect?: string[]
  note?: string
}

// 기본 골든셋 — 편집용 원본은 ./golden-set.json (배포 번들 이슈를 피해 인라인 유지).
// 실제 지식베이스 문서 기준으로 20~30건을 채우고 여기와 JSON 을 함께 갱신할 것.
const DEFAULT_GOLDEN_CASES: GoldenCase[] = [
  { type: "documents", query: "휴가 신청 절차", expect: [], note: "예시 — 실제 인사 규정 문서명으로 expect 를 채우세요" },
  { type: "documents", query: "법인카드 사용 규정", expect: [], note: "예시" },
  { type: "cases", query: "고객사 견적 오류 대응", expect: [], note: "예시 — work_cases 제목 키워드로 채우세요" },
]

async function authorize(req: Request, admin: ReturnType<typeof createClient>, anon: string, service: string): Promise<boolean> {
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || ""
  if (bearer === service) return true
  const { data } = await createClient(Deno.env.get("SUPABASE_URL") || "", anon).auth.getUser(bearer)
  if (!data.user) return false
  const { data: profile } = await admin.from("users").select("is_admin").eq("id", data.user.id).maybeSingle()
  return profile?.is_admin === true
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight
  if (req.method !== "POST") return jsonResponse({ error: "POST required." }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || ""
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  const geminiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY") || ""
  const openaiKey = Deno.env.get("OPENAI_API_KEY") || ""
  const admin = createClient(supabaseUrl, service, { auth: { persistSession: false } })

  if (!(await authorize(req, admin, anon, service))) {
    return jsonResponse({ error: "Forbidden." }, 403)
  }

  const body = await req.json().catch(() => ({})) as {
    cases?: GoldenCase[]
    matchCount?: number
  }
  const cases: GoldenCase[] = Array.isArray(body.cases) && body.cases.length > 0
    ? body.cases
    : DEFAULT_GOLDEN_CASES
  const rawMatchCount = Number(body.matchCount)
  const matchCount = Number.isFinite(rawMatchCount)
    ? Math.min(Math.max(Math.round(rawMatchCount), 1), 20)
    : 5

  const results: Array<Record<string, unknown>> = []
  let scored = 0
  let hits = 0

  for (const c of cases) {
    const query = c.query?.trim()
    if (!query) continue
    const startedAt = Date.now()
    let top: Array<{ id: string; label: string; similarity: number }> = []
    let error: string | null = null

    try {
      if (c.type === "cases") {
        if (!openaiKey) throw new Error("OPENAI_API_KEY missing")
        const query_embedding = await embedWorkCaseText(openaiKey, query)
        const { data, error: rpcErr } = await admin.rpc("match_work_cases_hybrid", {
          query_embedding,
          query_text: query,
          match_count: matchCount,
          similarity_threshold: 0.25,
          fts_weight: 0.5,
          vector_weight: 0.5,
        })
        if (rpcErr) throw rpcErr
        top = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
          id: String(r.id ?? ""),
          label: String(r.title ?? ""),
          similarity: Number(r.similarity ?? 0),
        }))
      } else {
        if (!geminiKey) throw new Error("GEMINI_API_KEY missing")
        // 주의: 서비스 롤 실행이라 KG(nh_knowledge_nodes) arm 은 제외됨 —
        // 채팅 경로와 동일 조건 비교를 위해 문서 하이브리드 검색만 평가한다.
        const matches = await retrieveCompanyDocumentMatches({
          admin,
          geminiKey,
          query,
          matchCount,
          logSource: "rag_eval", // 실트래픽 지표(company_documents) 오염 방지
        })
        top = matches.map((m) => ({ id: m.id, label: m.fileName, similarity: m.similarity }))
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }

    const expect = (c.expect ?? []).filter((s) => typeof s === "string" && s.trim().length > 0)
    let hit: boolean | null = null
    let missing: string[] = []
    if (expect.length > 0 && !error) {
      const labels = top.map((t) => t.label.toLowerCase())
      missing = expect.filter((e) => !labels.some((l) => l.includes(e.toLowerCase())))
      hit = missing.length === 0
      scored++
      if (hit) hits++
    }

    results.push({
      type: c.type,
      query,
      hit,
      missing: missing.length > 0 ? missing : undefined,
      top: top.map((t) => ({ label: t.label, similarity: Number(t.similarity.toFixed(4)) })),
      latency_ms: Date.now() - startedAt,
      error: error ?? undefined,
      note: c.note,
    })
  }

  const summary = {
    total_cases: results.length,
    scored_cases: scored,
    hits,
    hit_rate: scored > 0 ? Number((hits / scored).toFixed(3)) : null,
    match_count: matchCount,
  }

  logRagRetrieval(admin, {
    source: "rag_eval",
    query: `[eval] ${results.length} cases`,
    results: [],
    latencyMs: 0,
    extra: summary,
  })

  return jsonResponse({ ok: true, summary, results })
})
