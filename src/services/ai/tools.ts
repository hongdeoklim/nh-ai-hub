/**
 * 사내 플러그인용 tool 스켈레톤.
 * DB `plugins.tool_function_name` 과 연동되는 내장 도구 및 Edge 전용 스텁을 포함합니다.
 */

import { tool, zodSchema } from 'ai'
import { z } from 'zod'

import { invokeGoogleAgentClient } from '../integrations/google-agent-client'

/** DB `plugins.tool_function_name` 과 정확히 일치해야 하는 내장 도구 이름 */
export const DB_CONTROLLED_PLUGIN_TOOL_NAMES = [
  'get_weather',
  'get_exchange_rate',
  'search_web_news',
] as const

export type DbControlledPluginToolName =
  (typeof DB_CONTROLLED_PLUGIN_TOOL_NAMES)[number]

export const getWeatherTool = tool({
  description:
    '특정 지역(도시·구역)의 현재 날씨와 기온, 강수·바람 요약을 조회합니다.',
  inputSchema: zodSchema(
    z.object({
      location: z
        .string()
        .min(1)
        .describe('조회할 지역명 (예: 서울, 부산, 수원시 영통구)'),
      units: z
        .enum(['celsius', 'fahrenheit'])
        .optional()
        .describe('기온 단위 (기본 celsius)'),
    }),
  ),
  execute: async ({ location, units = 'celsius' }) => {
    const seed = location
      .split('')
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
    const tempC = 8 + (seed % 18)
    const temp = units === 'fahrenheit' ? Math.round(tempC * 1.8 + 32) : tempC
    const conditions = ['맑음', '구름 많음', '흐림', '약한 비', '소나기'] as const
    const condition = conditions[seed % conditions.length]
    return {
      source: 'builtin_stub',
      location,
      observed_at: new Date().toISOString(),
      condition,
      temperature: temp,
      units: units === 'fahrenheit' ? 'fahrenheit' : 'celsius',
      humidity_pct: 45 + (seed % 40),
      wind_kph: 5 + (seed % 20),
      note: '관리자 테스트용 더미 날씨 데이터입니다.',
    }
  },
})

export const getExchangeRateTool = tool({
  description: '원화(KRW) 대비 외화 환율(또는 역산)을 조회합니다.',
  inputSchema: zodSchema(
    z.object({
      base: z
        .string()
        .min(3)
        .max(3)
        .describe('기준 통화 ISO 코드 (예: USD, EUR, JPY)'),
      quote: z
        .string()
        .min(3)
        .max(3)
        .optional()
        .describe('상대 통화 ISO 코드 (기본 KRW)'),
    }),
  ),
  execute: async ({ base, quote = 'KRW' }) => {
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
    if (quoteU === 'KRW') {
      rate = krwPerBase
    } else if (baseU === 'KRW') {
      const q = table[quoteU] ?? 1000
      rate = Number((1 / q).toFixed(6))
    } else {
      const q = table[quoteU] ?? 1000
      rate = Number((krwPerBase / q).toFixed(6))
    }
    return {
      source: 'builtin_stub',
      pair: `${baseU}/${quoteU}`,
      rate,
      as_of: new Date().toISOString(),
      note: '관리자 테스트용 더미 환율입니다.',
    }
  },
})

export const searchWebNewsTool = tool({
  description:
    '최신 뉴스·웹 정보를 검색합니다. Edge ai-chat + EXA_API_KEY 에서만 실제 검색됩니다.',
  inputSchema: zodSchema(
    z.object({
      query: z.string().min(1).describe('검색 질의'),
      num_results: z.number().int().min(1).max(10).optional(),
    }),
  ),
  execute: async (input) => {
    return {
      status: 'stub' as const,
      tool: 'search_web_news',
      message:
        '웹·뉴스 검색은 Supabase Edge Function ai-chat + EXA_API_KEY Secret 에서만 동작합니다.',
      echo: input,
    }
  },
})

/** DB 플러그인 ON/OFF 와 매칭되는 내장 도구 레지스트리 */
export const dbControlledPluginTools = {
  get_weather: getWeatherTool,
  get_exchange_rate: getExchangeRateTool,
  search_web_news: searchWebNewsTool,
} as const

/** 활성 `tool_function_name` 목록에 해당하는 도구만 반환 (direct/실험 모드용) */
export function pickDbControlledPluginTools(
  activeFunctionNames: readonly string[],
): Record<string, (typeof dbControlledPluginTools)[DbControlledPluginToolName]> {
  const out: Record<
    string,
    (typeof dbControlledPluginTools)[DbControlledPluginToolName]
  > = {}
  for (const name of activeFunctionNames) {
    const key = name.trim() as DbControlledPluginToolName
    if (key in dbControlledPluginTools) {
      out[key] = dbControlledPluginTools[key]
    }
  }
  return out
}

export const analyzeExcelTool = tool({
  description:
    '업로드된 엑셀·CSV 형태의 표 데이터를 읽고 요약·검증·피벗 등 분석을 수행합니다. (플러그인 스텁)',
  inputSchema: zodSchema(
    z.object({
      fileUri: z
        .string()
        .describe('분석 대상 파일 URI (예: Supabase Storage 경로 또는 사내 파일 링크)'),
      sheetName: z
        .string()
        .optional()
        .describe('특정 시트만 분석할 경우 시트 이름'),
      question: z
        .string()
        .optional()
        .describe('표 데이터에 대해 답변해야 할 구체적 질문'),
    }),
  ),
  execute: async (input) => {
    return {
      status: 'stub' as const,
      tool: 'analyze_excel',
      message:
        'analyze_excel 플러그인이 아직 연결되지 않았습니다. 향후 Edge Function 또는 워커에서 파싱 로직을 연동하세요.',
      echo: input,
    }
  },
})

export const detectCrackTool = tool({
  description:
    '공사 현장 등에서 촬영된 균열 이미지를 입력으로 균열 여부·심각도 추정을 지원합니다. (플러그인 스텁)',
  inputSchema: zodSchema(
    z.object({
      imageUri: z
        .string()
        .describe('분석할 현장 사진 URI 또는 Base64 데이터 참조 키'),
      siteId: z.string().optional().describe('현장·프로젝트 식별자'),
      notes: z.string().optional().describe('촬영 조건·추가 메모'),
    }),
  ),
  execute: async (input) => {
    return {
      status: 'stub' as const,
      tool: 'detect_crack',
      message:
        'detect_crack 비전 플러그인이 아직 연결되지 않았습니다. 향후 전용 비전 API와 연동하세요.',
      echo: input,
    }
  },
})

export const searchSimilarCasesTool = tool({
  description:
    '현재 상황과 유사한 과거 업무 사례를 DB에서 벡터 검색합니다. Edge ai-chat 에서만 실제 조회됩니다.',
  inputSchema: zodSchema(
    z.object({
      situation: z.string().min(1).describe('검색할 상황·질문 텍스트'),
      match_count: z.number().int().min(1).max(25).optional(),
      similarity_threshold: z.number().min(0).max(1).optional(),
    }),
  ),
  execute: async (input) => {
    return {
      status: 'stub' as const,
      tool: 'search_similar_cases',
      message:
        '유사 사례 검색은 Supabase Edge Function ai-chat 경로에서만 DB(match_work_cases)와 연결됩니다.',
      echo: input,
    }
  },
})

export const accumulateNewCaseTool = tool({
  description:
    '새 업무 노하우를 work_cases 테이블에 저장합니다. Edge ai-chat 에서만 INSERT 가 실행됩니다.',
  inputSchema: zodSchema(
    z.object({
      title: z.string().min(1),
      content: z.string().min(1),
    }),
  ),
  execute: async (input) => {
    return {
      status: 'stub' as const,
      tool: 'accumulate_new_case',
      message:
        '사례 축적 INSERT 는 Edge Function ai-chat + 서비스 롤에서만 수행됩니다.',
      echo: input,
    }
  },
})

export const updateExistingCaseTool = tool({
  description:
    '기존 work_cases 행의 제목·본문을 갱신합니다. Edge ai-chat 에서만 UPDATE 가 실행됩니다.',
  inputSchema: zodSchema(
    z
      .object({
        id: z.string().uuid(),
        title: z.string().min(1).optional(),
        content: z.string().min(1).optional(),
      })
      .refine((v) => v.title !== undefined || v.content !== undefined, {
        message: 'title 또는 content 중 하나 이상 필요',
      }),
  ),
  execute: async (input) => {
    return {
      status: 'stub' as const,
      tool: 'update_existing_case',
      message:
        '사례 갱신 UPDATE 는 Edge Function ai-chat + 서비스 롤에서만 수행됩니다.',
      echo: input,
    }
  },
})

export const googleAddCalendarTool = tool({
  description:
    'Google Calendar(primary)에 일정을 등록합니다. Google Workspace 연동이 필요합니다. Edge ai-chat 경로에서 google-agent가 실행됩니다.',
  inputSchema: zodSchema(
    z.object({
      summary: z.string().min(1).describe('일정 제목'),
      description: z.string().optional().describe('일정 설명'),
      startTime: z
        .string()
        .min(1)
        .describe('시작 시각 ISO8601 (예: 2026-05-20T14:00:00+09:00)'),
      endTime: z
        .string()
        .min(1)
        .describe('종료 시각 ISO8601 (예: 2026-05-20T15:00:00+09:00)'),
    }),
  ),
  execute: async ({ summary, description, startTime, endTime }) => {
    return invokeGoogleAgentClient('manage_calendar', {
      summary,
      description,
      startTime,
      endTime,
    })
  },
})

export const googleAppendSheetsTool = tool({
  description:
    'Google Sheets에 한 행 데이터를 append 합니다. spreadsheetId는 URL /d/{id}/ 구간입니다.',
  inputSchema: zodSchema(
    z.object({
      spreadsheetId: z.string().min(1).describe('스프레드시트 ID'),
      range: z.string().min(1).describe('시트 범위 (예: Sheet1!A1)'),
      values: z
        .array(z.union([z.string(), z.number(), z.boolean()]))
        .min(1)
        .describe('한 행의 셀 값 배열'),
    }),
  ),
  execute: async ({ spreadsheetId, range, values }) => {
    return invokeGoogleAgentClient('update_spreadsheet', {
      spreadsheetId,
      range,
      values,
    })
  },
})

/** 메인 라우터에서 streamText 의 tools 로 전달할 맵 */
export const nhPortalPluginTools = {
  analyze_excel: analyzeExcelTool,
  detect_crack: detectCrackTool,
  search_similar_cases: searchSimilarCasesTool,
  accumulate_new_case: accumulateNewCaseTool,
  update_existing_case: updateExistingCaseTool,
  google_add_calendar: googleAddCalendarTool,
  google_append_sheets: googleAppendSheetsTool,
} as const
