import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.8"

/**
 * RAG 검색 계측 로그 (rag_retrieval_logs)
 *
 * 검색 경로에 심는 fire-and-forget 로거. 실패해도 검색 자체에는 영향을 주지 않고,
 * 응답 종료 직후 워커 회수로 유실되지 않도록 EdgeRuntime.waitUntil 에 등록한다.
 */

export type RagRetrievalLogEntry = {
  source:
    | "company_documents"
    | "work_cases"
    | "dify_bridge_documents"
    | "dify_bridge_cases"
    | "rag_eval"
  query: string
  results: Array<{ id: string; label: string; similarity: number }>
  latencyMs: number
  userId?: string | null
  extra?: Record<string, unknown>
}

export function logRagRetrieval(
  admin: SupabaseClient,
  entry: RagRetrievalLogEntry,
): void {
  try {
    const insert = admin
      .from("rag_retrieval_logs")
      .insert({
        source: entry.source,
        query_text: entry.query.slice(0, 200),
        result_count: entry.results.length,
        top_similarity: entry.results[0]?.similarity ?? null,
        results: entry.results.slice(0, 10),
        latency_ms: Math.round(entry.latencyMs),
        user_id: entry.userId ?? null,
        extra: entry.extra ?? null,
      })
      .then(({ error }) => {
        if (error) console.warn("[rag-logging] insert 실패:", error.message)
      })
    ;(globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
      .EdgeRuntime?.waitUntil?.(Promise.resolve(insert))
  } catch (e) {
    console.warn("[rag-logging] 예외:", e)
  }
}
