import { tool, zodSchema, type Tool } from "npm:ai@6.0.184"
import { z } from "npm:zod@4.4.3"

import {
  createSearchWebNewsTool,
  WEB_SEARCH_TOOL_NAME,
} from "./web-search-tool.ts"

/** DB `plugins.tool_function_name` 과 일치해야 하는 내장 도구 이름 */
export const BUILTIN_PLUGIN_TOOL_NAMES = [
  "get_weather",
  "get_exchange_rate",
  WEB_SEARCH_TOOL_NAME,
  "search_public_data",
] as const

export type BuiltinPluginToolName = (typeof BUILTIN_PLUGIN_TOOL_NAMES)[number]

const getWeatherTool = tool({
  description:
    "특정 지역(도시·구역)의 현재 날씨와 기온, 강수·바람 요약을 조회합니다.",
  inputSchema: zodSchema(
    z.object({
      location: z
        .string()
        .min(1)
        .describe("조회할 지역명 (예: 서울, 부산, 수원시 영통구)"),
      units: z
        .enum(["celsius", "fahrenheit"])
        .optional()
        .describe("기온 단위 (기본 celsius)"),
    }),
  ),
  execute: async ({ location, units = "celsius" }) => {
    const seed = location
      .split("")
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
    const tempC = 8 + (seed % 18)
    const temp = units === "fahrenheit" ? Math.round(tempC * 1.8 + 32) : tempC
    const conditions = ["맑음", "구름 많음", "흐림", "약한 비", "소나기"] as const
    const condition = conditions[seed % conditions.length]
    return {
      source: "builtin_stub",
      location,
      observed_at: new Date().toISOString(),
      condition,
      temperature: temp,
      units: units === "fahrenheit" ? "fahrenheit" : "celsius",
      humidity_pct: 45 + (seed % 40),
      wind_kph: 5 + (seed % 20),
      note: "관리자 테스트용 더미 날씨 데이터입니다. 실제 기상 API 연동 전까지 참고용으로만 사용하세요.",
    }
  },
})

const getExchangeRateTool = tool({
  description: "원화(KRW) 대비 외화 환율(또는 역산)을 조회합니다.",
  inputSchema: zodSchema(
    z.object({
      base: z
        .string()
        .min(3)
        .max(3)
        .describe("기준 통화 ISO 코드 (예: USD, EUR, JPY)"),
      quote: z
        .string()
        .min(3)
        .max(3)
        .optional()
        .describe("상대 통화 ISO 코드 (기본 KRW)"),
    }),
  ),
  execute: async ({ base, quote = "KRW" }) => {
    const baseU = base.toUpperCase()
    const quoteU = quote.toUpperCase()
    const table: Record<string, number> = {
      USD: 1382.5,
      EUR: 1498.2,
      JPY: 9.21,
      CNY: 190.4,
      GBP: 1745.0,
    }
    const krwPerBase = table[baseU] ?? 1200 + (baseU.charCodeAt(0) % 200)
    let rate: number
    if (quoteU === "KRW") {
      rate = krwPerBase
    } else if (baseU === "KRW") {
      const q = table[quoteU] ?? 1000
      rate = Number((1 / q).toFixed(6))
    } else {
      const q = table[quoteU] ?? 1000
      rate = Number((krwPerBase / q).toFixed(6))
    }
    return {
      source: "builtin_stub",
      pair: `${baseU}/${quoteU}`,
      rate,
      as_of: new Date().toISOString(),
      note: "관리자 테스트용 더미 환율입니다. 실제 FX API 연동 전까지 참고용으로만 사용하세요.",
    }
  },
})

const searchPublicDataTool = tool({
  description: '공공데이터포털의 조달청 나라장터 시설공사 입찰공고를 조회합니다.',
  inputSchema: zodSchema(
    z.object({
      keyword: z.string().max(100).optional().describe('입찰공고명 검색어'),
      rows: z.number().int().min(1).max(10).optional().describe('조회 건수(기본 5)'),
    }),
  ),
  execute: async ({ keyword, rows = 5 }) => {
    const serviceKey =
      Deno.env.get('CORP_DATA_PORTAL_API_KEY')?.trim() ||
      Deno.env.get('DATA_PORTAL_API_KEY')?.trim()
    if (!serviceKey) {
      return { ok: false, error: '공공데이터포털 API key가 설정되지 않았습니다.' }
    }
    const params = new URLSearchParams({
      serviceKey,
      numOfRows: String(rows),
      pageNo: '1',
      inqryDiv: '1',
      type: 'json',
    })
    if (keyword?.trim()) params.set('bidNtceNm', keyword.trim())
    const endpoint =
      'https://apis.data.go.kr/1230000/BidPublicInfoService04/' +
      `getBidPblancListInfoCnstcPPSSrch01?${params.toString()}`
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' } })
    if (!response.ok) {
      return { ok: false, error: `공공데이터 조회 실패 (${response.status})` }
    }
    const payload = await response.json() as {
      response?: { body?: { items?: unknown[]; totalCount?: number } }
    }
    const items = Array.isArray(payload.response?.body?.items)
      ? payload.response?.body?.items
      : []
    return {
      ok: true,
      source: 'data.go.kr/조달청 나라장터',
      retrieved_at: new Date().toISOString(),
      total_count: payload.response?.body?.totalCount ?? items.length,
      items,
    }
  },
})

const registry: Record<
  Exclude<BuiltinPluginToolName, typeof WEB_SEARCH_TOOL_NAME>,
  Tool<any, any>
> = {
  get_weather: getWeatherTool,
  get_exchange_rate: getExchangeRateTool,
  search_public_data: searchPublicDataTool,
}

export function resolveBuiltinPluginTool(
  toolFunctionName: string,
  exaApiKey?: string,
): Tool<any, any> | null {
  const key = toolFunctionName.trim()
  if (key === WEB_SEARCH_TOOL_NAME) {
    const apiKey = exaApiKey?.trim()
    return apiKey ? createSearchWebNewsTool(apiKey) : null
  }
  return registry[key as Exclude<BuiltinPluginToolName, typeof WEB_SEARCH_TOOL_NAME>] ?? null
}
