import {
  fetchExaKoreanNewsForContext,
  type WebSearchToolResult,
} from "./web-search-tool.ts"

/** 사용자 질의가 실시간·웹 검색이 필요한지 휴리스틱 판별 */
export function detectNeedsRealtimeWebSearch(query: string): boolean {
  const q = query.trim()
  if (q.length < 4) return false

  const patterns: RegExp[] = [
    /최신|오늘|어제|그제|현재|실시간|지금|요즘|최근|방금|이번\s*주|이번\s*달|올해/,
    /뉴스|기사|속보|헤드라인|보도|언론|이슈|동향|트렌드|시장\s*상황/,
    /환율|주가|시세|코스피|코스닥|나스닥|금리|유가|원\/달러/,
    /날씨|기상|미세먼지|폭우|태풍|지진/,
    /몇\s*월\s*몇\s*일|무슨\s*날|공휴일|연휴/,
    /\b(latest|current|today|yesterday|now|recent|real-?time|live)\b/i,
    /\b(news|headline|trending|breaking)\b/i,
    /\b(search|look up|find out)\b/i,
    /\b20\d{2}\s*년?\b/,
    /검색해|검색\s*해|찾아\s*봐|찾아봐|알아\s*봐|알아봐/,
  ]

  if (patterns.some((re) => re.test(q))) return true

  if (
    /무슨\s*일|무엇이\s*일|what\s+happened/i.test(q) &&
    /최근|recent|today|오늘|어제/i.test(q)
  ) {
    return true
  }

  return false
}

export function resolveWebSearchNeeded(input: {
  query: string
  internetSearchEnabled?: boolean
}): boolean {
  if (input.internetSearchEnabled === true) return true
  return detectNeedsRealtimeWebSearch(input.query)
}

function formatNewsHighlightBlock(
  item: WebSearchToolResult["items"][number],
  index: number,
): string {
  const lines = [
    `[${index}] ${item.title}`,
    `URL: ${item.url}`,
  ]
  if (item.published_at) {
    lines.push(`게시: ${item.published_at}`)
  }
  const highlightText = item.highlights.length > 0
    ? item.highlights.join("\n")
    : item.snippet.trim()
  if (highlightText.length > 0) {
    lines.push(`핵심 요약:\n${highlightText}`)
  }
  return lines.join("\n")
}

/** Claude/GPT 시스템 프롬프트 하단 — [실시간 인터넷 뉴스 참고자료] (성공 시만) */
export function buildWebSearchPrefetchSystemBlock(
  result: WebSearchToolResult,
): string {
  if (!result.ok || result.items.length === 0) {
    return ""
  }

  const body = result.items
    .map((item, i) => formatNewsHighlightBlock(item, i + 1))
    .join("\n\n---\n\n")

  return `

## [실시간 인터넷 뉴스 참고자료]
아래는 요청 직전 \`https://api.exa.ai/search\` 로 가져온 **뉴스 하이라이트**(본문 전체 아님)이다.
이 내용을 **반드시** 최종 답변에 통합·인용하라. 검색 결과만 나열하지 말고 사용자 질문에 맞게 **한국어**로 분석·요약하라.
- 검색어: ${result.query}
- 조회 시각: ${result.searched_at}
- 기사 ${result.items.length}건 (category=news, highlights only)

${body}`
}

/**
 * Exa Free Tier 징검다리 — 실패·한도·429 시 "" 반환(RAG·기본 지식만으로 답변 이어감).
 */
export function resolveWebSearchPrefetchSystemBlock(
  result: WebSearchToolResult,
): string {
  if (result.bridge_skip || !result.ok || result.items.length === 0) {
    return ""
  }
  return buildWebSearchPrefetchSystemBlock(result)
}

export async function prefetchWebSearchContext(
  exaApiKey: string,
  query: string,
): Promise<WebSearchToolResult> {
  try {
    return await fetchExaKoreanNewsForContext(exaApiKey, query)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn("[exa] prefetchWebSearchContext exception (bridge skip)", message)
    return {
      ok: false,
      query: query.trim(),
      searched_at: new Date().toISOString(),
      items: [],
      message,
      bridge_skip: true,
    }
  }
}

export const WEB_SEARCH_PREFETCH_GUIDANCE = `

## [실시간 인터넷 뉴스 참고자료] 활용 (필수)
시스템 프롬프트 하단의 **[실시간 인터넷 뉴스 참고자료]** 블록을 우선 근거로 사용하라.
- 본문에 **출처 제목·URL·날짜(있으면)** 를 포함하라.
- 블록에 없는 사실은 추측하지 말고, 불확실하면 그 한계를 밝혀라.
- NH여행·(주)농협네트웍스 업무 맥락과 연결해 실무적으로 정리하라.`

export const WEB_SEARCH_GEMINI_GROUNDING_GUIDANCE = `

## 인터넷 검색 (Google Search Grounding · 필수)
Google Search Grounding(\`google_search\`)으로 실시간 웹 정보를 조회할 수 있다.
- **반드시** 검색 결과를 최종 답변 본문에 통합·인용하라. "검색 기능이 없다"고 답하지 마라.
- 출처 **제목·URL·날짜(가능하면)** 를 포함하고, 핵심만 3~7개 bullet 로 정리하라.
- 검색 결과가 부족하면 다른 검색어로 다시 시도하거나 한계를 명시하라.
- NH여행·(주)농협네트웍스 업무(연수·MICE·출장·복지여행·시설·차량·미디어) 맥락과 연결해 분석하라.`
