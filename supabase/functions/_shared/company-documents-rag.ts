import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.8"

import { embedTextWithGemini } from "./gemini-embeddings.ts"
import { embedWorkCaseText } from "./embeddings.ts"

export type CompanyDocumentMatch = {
  index: number
  id: string
  fileName: string
  content: string
  chunkIndex: number
  similarity: number
}

type MatchDocumentsRow = {
  id: string
  file_name: string
  content: string
  chunk_index: number
  similarity: number
}

const DEFAULT_MATCH_COUNT = 5
const DEFAULT_SIMILARITY_THRESHOLD = 0.25
const SNIPPET_MAX = 480

function truncateSnippet(text: string, max = SNIPPET_MAX): string {
  const t = text.replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

function isCompanyRagEnabled(): boolean {
  const raw = (Deno.env.get("NH_AI_COMPANY_RAG_ENABLED") ?? "true").trim()
    .toLowerCase()
  return raw !== "false" && raw !== "0" && raw !== "off"
}

/** 
 * 질의 임베딩 생성 후, 기존 사내문서 및 지식 그래프(RAG)를 통합 병합 검색
 */
export async function retrieveCompanyDocumentMatches(params: {
  admin: SupabaseClient
  userClient?: SupabaseClient
  geminiKey?: string
  openaiKey?: string
  query: string
  matchCount?: number
  similarityThreshold?: number
}): Promise<CompanyDocumentMatch[]> {
  if (!isCompanyRagEnabled()) return []

  const q = params.query.trim()
  if (!q.length) return []

  let combinedRows: MatchDocumentsRow[] = []

  // 1 & 2. Gemini를 이용한 사내 문서 검색 (선택)
  if (params.geminiKey) {
    try {
      const query_embedding = await embedTextWithGemini(params.geminiKey, q)
      const { data, error } = await params.admin.rpc("match_documents_hybrid", {
        query_embedding,
        query_text: q,
        match_count: params.matchCount ?? DEFAULT_MATCH_COUNT,
        similarity_threshold:
          params.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD,
        rrf_k: 60
      })

      if (error) {
        console.warn(`[Hybrid Search] RPC error, falling back to vector-only: ${error.message}`)
        const fallback = await params.admin.rpc("match_documents", {
          query_embedding,
          match_count: params.matchCount ?? DEFAULT_MATCH_COUNT,
          similarity_threshold:
            params.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD,
        })

        if (!fallback.error && fallback.data) {
          combinedRows.push(...(fallback.data as MatchDocumentsRow[]))
        }
      } else if (data) {
        combinedRows.push(...(data as MatchDocumentsRow[]))
      }
    } catch (e) {
      console.warn("[Hybrid Search] Exception:", e)
    }
  }

  // 3. 신규 nh_knowledge_nodes 검색 (RLS 적용을 위해 userClient 사용)
  if (params.userClient && params.openaiKey) {
    try {
      const query_embedding_1536 = await embedWorkCaseText(params.openaiKey, q)
      const { data: kgData, error: kgError } = await params.userClient.rpc("nh_search_similar_nodes", {
        query_embedding: query_embedding_1536,
        match_threshold: params.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD,
        match_count: params.matchCount ?? DEFAULT_MATCH_COUNT
      })
      if (!kgError && kgData) {
        const kgRows: MatchDocumentsRow[] = kgData.map((row: any) => ({
          id: row.id,
          file_name: row.title,
          content: row.content,
          chunk_index: 0,
          similarity: row.similarity
        }))
        combinedRows.push(...kgRows)
      } else if (kgError) {
        console.warn("[KG Search] RPC error:", kgError.message)
      }
    } catch (e) {
      console.warn("[KG Search] Exception:", e)
    }
  }

  // 4. 병합 결과 유사도 기준 정렬 및 Limit
  combinedRows.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
  const limit = params.matchCount ?? DEFAULT_MATCH_COUNT
  combinedRows = combinedRows.slice(0, limit)

  return combinedRows.map((row, i) => ({
    index: i + 1,
    id: String(row.id),
    fileName: String(row.file_name ?? "사내 문서").trim() || "사내 문서",
    content: String(row.content ?? ""),
    chunkIndex: Number(row.chunk_index ?? 0),
    similarity: Number(row.similarity ?? 0),
  }))
}

export function sanitizeRagContent(content: string): string {
  const INJECTION_BLOCK_PATTERNS = [
    /ignore\s+the\s+above\s+instructions/i,
    /ignore\s+previous\s+instructions/i,
    /지시사항?\s*(을\s*)?무시/i,
    /명령어?\s*(을\s*)?무시/i
  ];
  
  const hasInjection = INJECTION_BLOCK_PATTERNS.some(pattern => pattern.test(content));
  if (hasInjection) {
    // 본문을 파괴하지 않고 LLM에게 격리 대상임을 명시하는 프롬프트 가드 체계로 우회
    return `[SYSTEM WARNING: DATA ISOLATION] ${content} [END OF ISOLATION]`;
  }
  return content;
}

function isReadableText(content: string): boolean {
  if (!content || content.length === 0) return false
  // 비가독 문자(제어문자, 고서로게이트 등) 비율이 15% 초과이면 바이너리로 판단
  const nonPrintable = (content.match(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\ud800-\udfff]/g) ?? []).length
  return nonPrintable / content.length < 0.15
}

export function formatCompanyDocumentsForPrompt(matches: CompanyDocumentMatch[]): string {
  const readable = matches.filter((m) => isReadableText(m.content))

  if (readable.length === 0) {
    return "(사내 문서 벡터 검색 결과가 없습니다. 기존 시스템 지식도구 결과로 답하고, 출처 번호는 붙이지 마세요.)";
  }

  return readable
    .map((m, i) => {
      const sanitized = sanitizeRagContent(m.content);
      return `[${i + 1}] 파일: ${m.fileName}  청크 #${m.chunkIndex}  유사도 ${m.similarity.toFixed(3)}\n본문: ${sanitized}`;
    })
    .join("\n\n");
}

const COMPANY_RAG_SYSTEM_BLOCK = `

## 사내 문서 검색 (RAG)
아래 "검색된 사내 문서"는 \`company_documents\` 테이블 벡터 검색 결과입니다.
- 관련 본문을 **우선 근거**로 답변하세요.
- 인용 시 검색 결과 순서와 동일한 **[1], [2], [3]** … 번호를 문장 끝에 붙이세요.
- 검색 결과에 없는 사실은 추측하지 말고, 확인이 필요함을 밝히세요.
- 개인정보·계약 비밀은 인용·재전달하지 마세요.`

/** 기존 NH 시스템 프롬프트 뒤에 RAG 블록을 덧붙입니다. */
export function augmentSystemPromptWithCompanyRag(
  baseSystemPrompt: string,
  matches: CompanyDocumentMatch[],
): string {
  if (!isCompanyRagEnabled()) return baseSystemPrompt

  const contextBlock = formatCompanyDocumentsForPrompt(matches)
  return `${baseSystemPrompt}${COMPANY_RAG_SYSTEM_BLOCK}

### 검색된 사내 문서
${contextBlock}`
}
