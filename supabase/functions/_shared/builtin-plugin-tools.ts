import { tool, zodSchema, type Tool } from "npm:ai@6.0.184"
import { z } from "npm:zod@4.4.3"

import {
  createSearchWebNewsTool,
  WEB_SEARCH_TOOL_NAME,
} from "./web-search-tool.ts"

/** DB `plugins.tool_function_name` 과 일치해야 하는 내장 도구 이름 */
export const BUILTIN_PLUGIN_TOOL_NAMES = [
  WEB_SEARCH_TOOL_NAME,
  "search_public_data",
] as const

export type BuiltinPluginToolName = (typeof BUILTIN_PLUGIN_TOOL_NAMES)[number]

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
