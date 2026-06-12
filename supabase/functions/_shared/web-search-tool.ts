import { tool, zodSchema } from "npm:ai@6.0.184"
import { z } from "npm:zod@4.4.3"

export const WEB_SEARCH_TOOL_NAME = "search_web_news" as const

/** Exa Free Tier — 월 1,000회·토큰 절감 고정값 */
export const EXA_KOREAN_NEWS_NUM_RESULTS = 3

/** Free Tier 1 req/s — 동일 Edge isolate 내 최소 간격(ms) */
const EXA_MIN_CALL_INTERVAL_MS = 1_100

let lastExaFetchAtMs = 0

export type WebSearchResultItem = {
  title: string
  url: string
  published_at: string | null
  /** highlights 조각을 합친 텍스트(토큰 절감) */
  snippet: string
  source: string
  highlights: string[]
}

export type WebSearchToolResult = {
  ok: boolean
  query: string
  searched_at: string
  items: WebSearchResultItem[]
  message?: string
  /** true면 Exa 오류·한도 — 시스템 프롬프트 주입 생략(징검다리) */
  bridge_skip?: boolean
  http_status?: number
}

type ExaSearchResultRow = {
  title?: string
  url?: string
  publishedDate?: string
  highlights?: string[]
  text?: string
}

type ExaSearchResponse = {
  results?: ExaSearchResultRow[]
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

function normalizeHighlights(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((row): row is string => typeof row === "string")
    .map((row) => row.replace(/\s+/g, " ").trim())
    .filter((row) => row.length > 0)
}

function highlightsToSnippet(highlights: string[], fallbackText?: string): string {
  if (highlights.length > 0) {
    return highlights.join("\n")
  }
  const text = typeof fallbackText === "string" ? fallbackText.replace(/\s+/g, " ").trim() : ""
  if (!text.length) return ""
  const max = 480
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

function mapExaRowsToItems(rows: ExaSearchResultRow[]): WebSearchResultItem[] {
  return rows
    .map((row) => {
      const url = typeof row.url === "string" ? row.url.trim() : ""
      if (!url.length) return null
      const title =
        typeof row.title === "string" && row.title.trim().length > 0
          ? row.title.trim()
          : hostnameFromUrl(url)
      const highlights = normalizeHighlights(row.highlights)
      const snippet = highlightsToSnippet(highlights, row.text)
      return {
        title,
        url,
        published_at:
          typeof row.publishedDate === "string" && row.publishedDate.trim().length > 0
            ? row.publishedDate.trim()
            : null,
        snippet,
        source: hostnameFromUrl(url),
        highlights,
      }
    })
    .filter((row): row is WebSearchResultItem => row !== null)
}

function emptyBridgeResult(
  query: string,
  message: string,
  options?: { http_status?: number },
): WebSearchToolResult {
  return {
    ok: false,
    query,
    searched_at: new Date().toISOString(),
    items: [],
    message,
    bridge_skip: true,
    http_status: options?.http_status,
  }
}

function isExaQuotaOrRateLimit(status: number, detail: string): boolean {
  if (status === 429) return true
  if (status === 402 || status === 403) return true
  const lower = detail.toLowerCase()
  return (
    /rate.?limit|too many requests|quota|credit|exhausted|usage limit|monthly limit/i
      .test(lower)
  )
}

function reserveExaCallSlot(): boolean {
  const now = Date.now()
  if (now - lastExaFetchAtMs < EXA_MIN_CALL_INTERVAL_MS) {
    return false
  }
  lastExaFetchAtMs = now
  return true
}

/**
 * Exa `/search` — 한국 뉴스·하이라이트 전용 (표준 fetch, exa-js 미사용).
 * Free Tier: numResults=3, 429/크레딧 소진 시 bridge_skip 으로 징검다리.
 */
export async function fetchExaKoreanNewsForContext(
  exaApiKey: string,
  query: string,
): Promise<WebSearchToolResult> {
  const trimmedQuery = query.trim()
  if (!trimmedQuery.length) {
    return emptyBridgeResult(trimmedQuery, "검색어가 비어 있습니다.")
  }

  if (!reserveExaCallSlot()) {
    console.warn(
      "[exa] local rate guard: skipped (1 req/s Free Tier)",
      trimmedQuery.slice(0, 80),
    )
    return emptyBridgeResult(
      trimmedQuery,
      "Exa Free Tier 로컬 rate guard — 1초 이내 재호출 생략",
    )
  }

  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": exaApiKey,
      },
      body: JSON.stringify({
        query: trimmedQuery,
        category: "news",
        type: "auto",
        numResults: EXA_KOREAN_NEWS_NUM_RESULTS,
        contents: {
          highlights: true,
        },
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      const status = res.status
      const quotaHit = isExaQuotaOrRateLimit(status, detail)
      const logTag = quotaHit ? "[exa] quota/rate-limit" : "[exa] api error"
      console.warn(
        logTag,
        status,
        trimmedQuery.slice(0, 80),
        detail.slice(0, 240),
      )
      return emptyBridgeResult(
        trimmedQuery,
        quotaHit
          ? `Exa Free Tier 한도 (${status})`
          : `Exa 뉴스 검색 API 오류 (${status})`,
        { http_status: status },
      )
    }

    let payload: ExaSearchResponse
    try {
      payload = (await res.json()) as ExaSearchResponse
    } catch (parseErr) {
      console.warn("[exa] response JSON parse failed", parseErr)
      return emptyBridgeResult(trimmedQuery, "Exa 응답 JSON 파싱 실패")
    }

    const items = mapExaRowsToItems(payload.results ?? [])

    if (items.length === 0) {
      console.warn("[exa] no news results", trimmedQuery.slice(0, 80))
      return emptyBridgeResult(
        trimmedQuery,
        "뉴스 검색 결과가 없습니다.",
      )
    }

    return {
      ok: true,
      query: trimmedQuery,
      searched_at: new Date().toISOString(),
      items,
    }
  } catch (fetchErr) {
    const message = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
    console.warn("[exa] fetch exception (bridge skip)", message)
    return emptyBridgeResult(trimmedQuery, `Exa 네트워크 오류: ${message}`)
  }
}

/** LLM 도구 호출용 — 동일 Exa 뉴스·하이라이트 페이로드 */
export async function executeWebNewsSearch(
  exaApiKey: string,
  query: string,
  numResults = EXA_KOREAN_NEWS_NUM_RESULTS,
): Promise<WebSearchToolResult> {
  const capped = Math.min(Math.max(numResults, 1), EXA_KOREAN_NEWS_NUM_RESULTS)
  const base = await fetchExaKoreanNewsForContext(exaApiKey, query)
  if (!base.ok || capped >= base.items.length) {
    return base
  }
  return {
    ...base,
    items: base.items.slice(0, capped),
  }
}

export function createSearchWebNewsTool(exaApiKey: string) {
  return tool({
    description:
      "최신 한국·글로벌 뉴스를 검색합니다. 오늘/최근 뉴스, 업계 동향, 실시간 이슈, 규제·시장 변화 등 시점이 중요한 질의에 **반드시** 사용하세요.",
    inputSchema: zodSchema(
      z.object({
        query: z
          .string()
          .min(1)
          .describe(
            "검색 질의 (한국어 가능). 예: '2026년 5월 국내 여행업계 뉴스', 'MICE 산업 최근 동향'",
          ),
        num_results: z
          .number()
          .int()
          .min(1)
          .max(EXA_KOREAN_NEWS_NUM_RESULTS)
          .optional()
          .describe(`가져올 결과 수 (기본 ${EXA_KOREAN_NEWS_NUM_RESULTS}, 최대 ${EXA_KOREAN_NEWS_NUM_RESULTS})`),
      }),
    ),
    execute: async ({
      query,
      num_results = EXA_KOREAN_NEWS_NUM_RESULTS,
    }: {
      query: string
      num_results?: number
    }) => {
      return await executeWebNewsSearch(exaApiKey, query, num_results)
    },
  })
}

export const WEB_SEARCH_TOOL_GUIDANCE = `

## 웹·뉴스 검색 (search_web_news)
오늘/최근 뉴스, 업계 동향, 실시간 이슈, 규제·시장 변화 등 **시점이 중요한 질의**에는 search_web_news 를 **먼저** 호출하라.
- "검색 기능이 없다"고만 답하지 말고, 도구를 호출해 실제 기사·출처를 확보한 뒤 요약하라.
- 결과를 NH여행·(주)농협네트웍스 업무(연수·MICE·출장·복지여행·시설·차량·미디어) 맥락과 연결해 분석하라.
- 본문에 **출처 제목·URL·날짜(있으면)** 를 포함하고, 핵심만 3~7개 bullet 로 정리하라.
- 검색 결과가 부족하면 검색어를 바꿔 **한 번 더** 호출할 수 있다.`
