import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.8"
import { tool, zodSchema } from "npm:ai@6.0.184"
import { z } from "npm:zod@4.4.3"

export function createWorkCaseKnowledgeTools(deps: {
  admin: SupabaseClient
  embedText: (text: string) => Promise<number[]>
  rerankCases?: (query: string, cases: any[]) => Promise<any[]>
}) {
  const { admin, embedText, rerankCases } = deps

  const search_similar_cases = tool({
    description:
      "현재 상황·질문과 유사한 과거 업무 사례(work_cases)를 하이브리드 검색(키워드+벡터)합니다. 답변 전 관련 사례가 있으면 우선 호출하세요.",
    inputSchema: zodSchema(
      z.object({
        situation: z
          .string()
          .min(1)
          .describe("검색 질의(현장 상황, 문제, 키워드를 포함한 문장)"),
        match_count: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .describe("반환할 최대 사례 수(기본 5)"),
        similarity_threshold: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("코사인 유사도 하한(0~1, 기본 0.25). 높일수록 더 비슷한 것만."),
      }),
    ),
    execute: async ({
      situation,
      match_count = 5,
      similarity_threshold = 0.25,
    }) => {
      try {
        const query_embedding = await embedText(situation)
        // Reranker가 작동할 수 있도록 1차적으로 10개(또는 match_count와 비교해 넉넉하게)를 추출합니다.
        const firstStageLimit = rerankCases ? Math.max(10, match_count) : match_count

        const { data, error } = await admin.rpc("match_work_cases_hybrid", {
          query_embedding,
          query_text: situation,
          match_count: firstStageLimit,
          similarity_threshold,
          fts_weight: 0.5,
          vector_weight: 0.5,
        })
        if (error) {
          return { ok: false as const, error: error.message }
        }

        let cases = data ?? []
        if (rerankCases && cases.length > 0) {
          try {
            cases = await rerankCases(situation, cases)
            cases = cases.slice(0, match_count)
          } catch (rerankErr) {
            console.error(
              "[work-case-tools] LLM Reranking failed, fallback to hybrid ranking:",
              rerankErr,
            )
            cases = cases.slice(0, match_count)
          }
        }

        return { ok: true as const, cases }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false as const, error: msg }
      }
    },
  })

  const accumulate_new_case = tool({
    description:
      "대화에서 확인된 재사용 가능한 노하우·절차·주의사항을 work_cases 에 새로 저장합니다. 개인정보·민감정보는 넣지 마세요.",
    inputSchema: zodSchema(
      z.object({
        title: z.string().min(1).describe("사례 제목(한 줄 요약)"),
        content: z
          .string()
          .min(1)
          .describe("상세 내용(마크다운 가능). 검색에 쓰이므로 구체적으로 작성"),
      }),
    ),
    execute: async ({ title, content }) => {
      try {
        const embedding = await embedText(`${title.trim()}\n\n${content.trim()}`)
        const { data, error } = await admin
          .from("work_cases")
          .insert({
            title: title.trim(),
            content: content.trim(),
            embedding,
          })
          .select("id")
          .single()

        if (error) {
          return { ok: false as const, error: error.message }
        }
        return { ok: true as const, id: data?.id }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false as const, error: msg }
      }
    },
  })

  const update_existing_case = tool({
    description:
      "기존 사례의 제목 또는 본문을 보완·정정합니다. 변경 후 임베딩을 다시 계산합니다.",
    inputSchema: zodSchema(
      z
        .object({
          id: z.string().uuid().describe("갱신할 work_cases 행의 id"),
          title: z.string().min(1).optional().describe("새 제목(선택)"),
          content: z.string().min(1).optional().describe("새 본문(선택)"),
        })
        .refine((v) => v.title !== undefined || v.content !== undefined, {
          message: "title 또는 content 중 하나 이상은 필요합니다.",
        }),
    ),
    execute: async ({ id, title, content }) => {
      try {
        const { data: row, error: fetchErr } = await admin
          .from("work_cases")
          .select("title, content")
          .eq("id", id)
          .maybeSingle()

        if (fetchErr) {
          return { ok: false as const, error: fetchErr.message }
        }
        if (!row) {
          return { ok: false as const, error: "해당 id 의 사례가 없습니다." }
        }

        const newTitle = title !== undefined ? title.trim() : String(row.title)
        const newContent = content !== undefined
          ? content.trim()
          : String(row.content)

        if (!newTitle.length || !newContent.length) {
          return {
            ok: false as const,
            error: "제목과 내용은 비워 둘 수 없습니다.",
          }
        }

        const embedding = await embedText(`${newTitle}\n\n${newContent}`)
        const { error: updErr } = await admin
          .from("work_cases")
          .update({
            title: newTitle,
            content: newContent,
            embedding,
          })
          .eq("id", id)

        if (updErr) {
          return { ok: false as const, error: updErr.message }
        }
        return { ok: true as const, id }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false as const, error: msg }
      }
    },
  })

  return {
    search_similar_cases,
    accumulate_new_case,
    update_existing_case,
  } as const
}
