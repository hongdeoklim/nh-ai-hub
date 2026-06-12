/**
 * NH AI Hub — MCP(Model Context Protocol) 호환 코어 도구 레지스트리
 *
 * Anthropic MCP Tools Definition 규격(name, description, inputSchema)으로
 * [인터넷 검색(Exa)], [사내 문서 조회(RAG)], [업무 지식 저장·검색(징검다리)] 를 선언하고,
 * AI SDK `tool()` 실행기와 중앙 라우터로 연결합니다.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.8"
import { tool, zodSchema } from "npm:ai@6.0.184"
import { z } from "npm:zod@4.4.3"

import {
  retrieveCompanyDocumentMatches,
  type CompanyDocumentMatch,
} from "../_shared/company-documents-rag.ts"
import {
  isGoogleSpreadsheetReadConfigured,
  readGoogleSpreadsheetValues,
  type GoogleSpreadsheetReadResult,
} from "../_shared/google-sheets-read.ts"
import {
  EXA_KOREAN_NEWS_NUM_RESULTS,
  executeWebNewsSearch,
  WEB_SEARCH_TOOL_GUIDANCE,
  WEB_SEARCH_TOOL_NAME,
  type WebSearchToolResult,
} from "../_shared/web-search-tool.ts"
import { createWorkCaseKnowledgeTools } from "../_shared/work-case-tools.ts"
import {
  createInjectUniverOfficeDataTool,
  executeInjectUniverOfficeData,
  INJECT_UNIVER_OFFICE_DATA_MCP_DEFINITION,
  INJECT_UNIVER_OFFICE_DATA_TOOL_NAME,
  UNIVER_OFFICE_TOOL_GUIDANCE,
} from "../_shared/univer-office-tool.ts"
import {
  executeDbQuery,
  getAllowedViewsDescription,
  type DbQueryResult,
} from "../_shared/db-query-tool.ts"
import {
  searchGoogleDrive,
  readGoogleDriveFile,
  isGoogleDriveConfigured,
  type DriveSearchResult,
  type DriveReadResult,
} from "../_shared/gdrive-search-tool.ts"

type WorkCaseTools = ReturnType<typeof createWorkCaseKnowledgeTools>

// ---------------------------------------------------------------------------
// Anthropic MCP Tools Definition (JSON Schema)
// ---------------------------------------------------------------------------

export type McpJsonSchema = {
  type: "object"
  properties: Record<string, unknown>
  required?: string[]
}

/** Anthropic MCP / Claude tools[] 규격과 동일한 선언 형태 */
export type McpToolDefinition = {
  name: string
  description: string
  inputSchema: McpJsonSchema
}

/** 코어 NH 포털 도구 이름 — 라우팅·활성화 기준점 */
export const MCP_CORE_TOOL_NAMES = {
  /** Exa 한국 뉴스·하이라이트 검색 */
  SEARCH_WEB_NEWS: WEB_SEARCH_TOOL_NAME,
  /** company_documents 벡터 검색 (사내 RAG) */
  SEARCH_COMPANY_DOCUMENTS: "search_company_documents",
  /** work_cases 유사 사례 검색 */
  SEARCH_SIMILAR_CASES: "search_similar_cases",
  /** work_cases 신규 저장 (징검다리 — 지식 축적) */
  ACCUMULATE_NEW_CASE: "accumulate_new_case",
  /** work_cases 기존 사례 갱신 */
  UPDATE_EXISTING_CASE: "update_existing_case",
  /** 서비스 계정 기반 Google Sheets 실시간 조회 */
  READ_GOOGLE_SPREADSHEET: "read_google_spreadsheet",
  /** Univer 통합 오피스 aiDataSignal 실시간 주입 */
  INJECT_UNIVER_OFFICE_DATA: INJECT_UNIVER_OFFICE_DATA_TOOL_NAME,
  /** 사내 Supabase DB 뷰 조회 (화이트리스트 기반) */
  QUERY_COMPANY_DATABASE: "query_company_database",
  /** Google Drive 파일 전문 텍스트 검색 */
  SEARCH_GOOGLE_DRIVE: "search_google_drive",
  /** Google Drive 특정 파일 내용 읽기 */
  READ_GOOGLE_DRIVE_FILE: "read_google_drive_file",
  /** 개인 이메일 편지함 읽기 */
  READ_MY_EMAIL: "read_my_email",
  /** 지능형 웹페이지 스크래퍼 (Jina Reader) */
  READ_WEB_PAGE: "read_web_page",
} as const

export type McpCoreToolName =
  typeof MCP_CORE_TOOL_NAMES[keyof typeof MCP_CORE_TOOL_NAMES]

/**
 * 코어 MCP 도구 선언부 — name / description / inputSchema (JSON Schema)
 * Claude·GPT `tools` 파라미터 및 향후 MCP 서버 등록의 단일 소스.
 */
export const NH_CORE_MCP_TOOL_DEFINITIONS: Record<
  McpCoreToolName,
  McpToolDefinition
> = {
  [MCP_CORE_TOOL_NAMES.SEARCH_WEB_NEWS]: {
    name: MCP_CORE_TOOL_NAMES.SEARCH_WEB_NEWS,
    description:
      "최신 한국·글로벌 뉴스를 검색합니다. 오늘/최근 뉴스, 업계 동향, 실시간 이슈, 규제·시장 변화 등 시점이 중요한 질의에 **반드시** 사용하세요.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "검색 질의 (한국어 가능). 예: '2026년 5월 국내 여행업계 뉴스', 'MICE 산업 최근 동향'",
        },
        num_results: {
          type: "integer",
          description:
            `가져올 결과 수 (기본 ${EXA_KOREAN_NEWS_NUM_RESULTS}, 최대 ${EXA_KOREAN_NEWS_NUM_RESULTS})`,
          minimum: 1,
          maximum: EXA_KOREAN_NEWS_NUM_RESULTS,
        },
      },
      required: ["query"],
    },
  },

  [MCP_CORE_TOOL_NAMES.SEARCH_COMPANY_DOCUMENTS]: {
    name: MCP_CORE_TOOL_NAMES.SEARCH_COMPANY_DOCUMENTS,
    description:
      "사내 문서(company_documents)를 벡터 검색합니다. 규정·매뉴얼·내부 자료·업무 절차 등 **회사 내부 지식**이 필요할 때 호출하세요.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "검색 질의 (한국어). 키워드·상황·부서·업무 맥락을 포함하세요.",
        },
        match_count: {
          type: "integer",
          description: "반환할 최대 청크 수 (기본 5, 최대 25)",
          minimum: 1,
          maximum: 25,
        },
        similarity_threshold: {
          type: "number",
          description: "코사인 유사도 하한 (0~1, 기본 0.25). 높일수록 더 비슷한 것만.",
          minimum: 0,
          maximum: 1,
        },
      },
      required: ["query"],
    },
  },

  [MCP_CORE_TOOL_NAMES.SEARCH_SIMILAR_CASES]: {
    name: MCP_CORE_TOOL_NAMES.SEARCH_SIMILAR_CASES,
    description:
      "현재 상황·질문과 유사한 과거 업무 사례(work_cases)를 벡터 검색합니다. 답변 전 관련 사례가 있으면 우선 호출하세요.",
    inputSchema: {
      type: "object",
      properties: {
        situation: {
          type: "string",
          description: "검색 질의(현장 상황, 문제, 키워드를 포함한 문장)",
        },
        match_count: {
          type: "integer",
          description: "반환할 최대 사례 수(기본 5)",
          minimum: 1,
          maximum: 25,
        },
        similarity_threshold: {
          type: "number",
          description: "코사인 유사도 하한(0~1, 기본 0.25)",
          minimum: 0,
          maximum: 1,
        },
      },
      required: ["situation"],
    },
  },

  [MCP_CORE_TOOL_NAMES.ACCUMULATE_NEW_CASE]: {
    name: MCP_CORE_TOOL_NAMES.ACCUMULATE_NEW_CASE,
    description:
      "대화에서 확인된 재사용 가능한 노하우·절차·주의사항을 work_cases 에 새로 저장합니다. 개인정보·민감정보는 넣지 마세요.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "사례 제목(한 줄 요약)",
        },
        content: {
          type: "string",
          description:
            "상세 내용(마크다운 가능). 검색에 쓰이므로 구체적으로 작성",
        },
      },
      required: ["title", "content"],
    },
  },

  [MCP_CORE_TOOL_NAMES.UPDATE_EXISTING_CASE]: {
    name: MCP_CORE_TOOL_NAMES.UPDATE_EXISTING_CASE,
    description:
      "기존 사례의 제목 또는 본문을 보완·정정합니다. 변경 후 임베딩을 다시 계산합니다.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "갱신할 work_cases 행의 id (UUID)",
        },
        title: {
          type: "string",
          description: "새 제목(선택)",
        },
        content: {
          type: "string",
          description: "새 본문(선택)",
        },
      },
      required: ["id"],
    },
  },

  [MCP_CORE_TOOL_NAMES.READ_GOOGLE_SPREADSHEET]: {
    name: MCP_CORE_TOOL_NAMES.READ_GOOGLE_SPREADSHEET,
    description:
      "Google Sheets 스프레드시트의 지정 범위를 **실시간 조회**합니다. 업무 대장·KPI·재고·일정표 등 시트 데이터가 답변 근거일 때 호출하세요. spreadsheetId는 URL `/d/{id}/` 구간입니다.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheetId: {
          type: "string",
          description:
            "스프레드시트 ID (URL 예: https://docs.google.com/spreadsheets/d/{spreadsheetId}/edit)",
        },
        range: {
          type: "string",
          description:
            "시트 탭 및 A1 범위 (예: Sheet1!A1:Z100, 업무대장!A:C, 데이터!B2:F50)",
        },
      },
      required: ["spreadsheetId", "range"],
    },
  },

  [MCP_CORE_TOOL_NAMES.INJECT_UNIVER_OFFICE_DATA]:
    INJECT_UNIVER_OFFICE_DATA_MCP_DEFINITION as McpToolDefinition,

  [MCP_CORE_TOOL_NAMES.QUERY_COMPANY_DATABASE]: {
    name: MCP_CORE_TOOL_NAMES.QUERY_COMPANY_DATABASE,
    description:
      "사내 Supabase DB의 허용된 뷰(View)를 조회합니다. 매출·실적·예산·재고·프로젝트 현황 등 DB 수치 데이터가 필요할 때 호출하세요.",
    inputSchema: {
      type: "object",
      properties: {
        view_name: {
          type: "string",
          description:
            "조회할 허용된 뷰/테이블 이름. 허용 목록을 먼저 확인하세요.",
        },
        filter_column: {
          type: "string",
          description: "필터링할 컬럼 이름 (선택, 영문/숫자/언더바만 허용)",
        },
        filter_value: {
          type: "string",
          description: "filter_column 의 일치 값 (선택)",
        },
        limit: {
          type: "integer",
          description: "최대 반환 행 수 (기본 30, 최대 100)",
          minimum: 1,
          maximum: 100,
        },
      },
      required: ["view_name"],
    },
  },

  [MCP_CORE_TOOL_NAMES.SEARCH_GOOGLE_DRIVE]: {
    name: MCP_CORE_TOOL_NAMES.SEARCH_GOOGLE_DRIVE,
    description:
      "Google Drive 에서 키워드로 사내 문서를 검색합니다. 회의록·기획서·보고서·규정 등 Drive 파일을 찾을 때 호출하세요.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "검색 키워드 (한국어 가능). 예: '2분기 마케팅 OKR', '출장 규정', '프로젝트 A 회의록'",
        },
        max_results: {
          type: "integer",
          description: "반환할 최대 파일 수 (기본 8, 최대 10)",
          minimum: 1,
          maximum: 10,
        },
      },
      required: ["query"],
    },
  },

  [MCP_CORE_TOOL_NAMES.READ_GOOGLE_DRIVE_FILE]: {
    name: MCP_CORE_TOOL_NAMES.READ_GOOGLE_DRIVE_FILE,
    description:
      "Google Drive 파일의 전체 내용을 텍스트로 읽어옵니다. search_google_drive 로 찾은 파일 ID 를 사용하세요. Google Docs/Sheets/Slides 및 일반 텍스트 파일을 지원합니다.",
    inputSchema: {
      type: "object",
      properties: {
        file_id: {
          type: "string",
          description: "Drive 파일 ID (search_google_drive 결과의 id 필드)",
        },
      },
      required: ["file_id"],
    },
  },

  [MCP_CORE_TOOL_NAMES.READ_MY_EMAIL]: {
    name: MCP_CORE_TOOL_NAMES.READ_MY_EMAIL,
    description:
      "현재 사용자의 개인 이메일 편지함을 읽어온다. 'nh_user_integrations' 금고에 영구 저장된 사용자 이메일 계정 및 앱 비밀번호를 사용하여 IMAP을 통해 메일을 스캔한다.",
    inputSchema: {
      type: "object",
      properties: {
        max_results: { type: "number", description: "가져올 메일 수 (기본 3)" },
      },
    },
  },

  [MCP_CORE_TOOL_NAMES.READ_WEB_PAGE]: {
    name: MCP_CORE_TOOL_NAMES.READ_WEB_PAGE,
    description:
      "URL이 주어지면 해당 웹페이지에 직접 접속하여 광고와 잡티를 제거하고 핵심 본문만 마크다운 형태로 추출하여 읽어옵니다. 최신 정보가 필요하거나, 뉴스/블로그 기사 URL을 요약해야 할 때 반드시 호출하세요.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "읽어올 웹페이지의 전체 URL (예: https://news.naver.com/...)",
        },
      },
      required: ["url"],
    },
  },
}

// ---------------------------------------------------------------------------
// 시스템 프롬프트 가이던스 (도구 선언과 1:1 대응)
// ---------------------------------------------------------------------------

export const MCP_COMPANY_RAG_TOOL_GUIDANCE = `

## 사내 문서 검색 (search_company_documents)
규정·매뉴얼·내부 자료·업무 절차 등 **회사 내부 지식**이 필요하면 search_company_documents 를 호출하라.
- 시스템 프롬프트에 이미 주입된 RAG 블록과 도구 결과를 **함께** 근거로 사용하라.
- 인용 시 **[1], [2], [3]** … 번호를 문장 끝에 붙이고, 검색 결과에 없는 사실은 추측하지 마라.
- 개인정보·계약 비밀은 인용·재전달하지 마라.`

export const MCP_KNOWLEDGE_AGENT_TOOL_GUIDANCE = `

## 업무 지식 에이전트 (징검다리 · DB 도구)
당신은 Supabase의 업무 사례 테이블(work_cases)을 **검색·축적·갱신**할 수 있는 권한이 있다.
- 사용자 질의와 관련된 과거 사례가 있을 수 있으면 **적극적으로** search_similar_cases 로 유사 사례를 찾아 답변에 반영하라.
- search_similar_cases 결과를 본문에 인용할 때는 **검색 결과 순서와 동일한** [1], [2], [3] … 번호 마커를 문장 끝에 붙여라.
- 대화에서 재사용 가치가 있는 노하우·절차·주의사항이 명확해지면 accumulate_new_case 로 **저장**하라.
- 기존 사례가 부실하거나 변경되었다면 update_existing_case 로 **고도화**하라.
개인정보·민감·비밀 계약 정보는 DB에 저장하지 마라.`

export const MCP_GOOGLE_SPREADSHEET_TOOL_GUIDANCE = `

## Google Sheets 실시간 조회 (read_google_spreadsheet)
업무 시트·대장·KPI 표 등 **스프레드시트 원본 데이터**가 필요하면 read_google_spreadsheet 를 호출하라.
- spreadsheetId 와 range(탭!셀범위)를 정확히 지정하라.
- 도구가 반환한 rows(JSON 객체 배열)와 markdownTable 을 **1차 근거**로 사용하라.
- 시트에 없는 수치·행은 추측하지 마라. 범위가 부족하면 더 넓은 range 로 재조회하라.
- 서비스 계정이 해당 시트에 **뷰어 이상** 공유되어 있어야 한다.`

export const MCP_DATABASE_QUERY_TOOL_GUIDANCE = `

## 사내 DB 조회 (query_company_database)
사내 실적·매출·예산·프로젝트·재고 등 **DB 수치 데이터**가 필요하면 query_company_database 를 호출하라.
- 허용된 뷰(view) 이름만 사용할 수 있다. 허용 목록에 없는 이름으로 요청하면 오류를 반환한다.
- filter_column·filter_value 로 특정 부서·기간·항목을 좁혀 조회하라.
- 도구가 반환한 rows(JSON)와 markdownTable 을 **1차 근거**로 사용하라.
- DB에 없는 수치는 추측하지 마라. 질문 범위를 좁히거나 사용자에게 추가 정보를 요청하라.`

export const MCP_GOOGLE_DRIVE_TOOL_GUIDANCE = `

## Google Drive 문서 검색 및 조회
사내 규정·회의록·기획서·보고서 등 **Drive 문서**가 필요할 때:
1. 먼저 **search_google_drive** 로 관련 파일을 검색한다. (키워드 → 파일 목록 반환)
2. 내용이 필요한 파일은 **read_google_drive_file** 로 전문을 읽는다. (search 결과의 id 사용)
- 읽어온 content 를 **근거**로 요약·분석·답변한다.
- Drive 에 없는 정보는 추측하지 말고, 관련 파일을 찾을 수 없다고 밝혀라.
- Google Docs·Sheets·Slides·텍스트 파일을 지원한다. PDF·이미지는 지원하지 않는다.`

export const MCP_WEB_SCRAPER_TOOL_GUIDANCE = `

## 지능형 웹페이지 스크래퍼 (read_web_page)
사용자가 특정 인터넷 링크(URL)의 요약이나 분석을 요청했거나, 최신 정보를 찾기 위해 search_web_news 를 실행한 후 상세 내용을 확인하고 싶을 때 read_web_page 를 호출하라.
- 반환된 마크다운 텍스트를 철저히 분석하여 사용자의 질문에 답하라.
- 웹사이트 구조에 따라 텍스트가 부분적으로 잘릴 수 있으므로, 문맥을 통해 합리적으로 추론하되 없는 내용을 지어내지 마라.`

export { WEB_SEARCH_TOOL_GUIDANCE, WEB_SEARCH_TOOL_NAME, UNIVER_OFFICE_TOOL_GUIDANCE }

// ---------------------------------------------------------------------------
// 도구 실행 컨텍스트 · 중앙 라우터
// ---------------------------------------------------------------------------

export type McpToolExecutionContext = {
  exaApiKey?: string
  admin?: SupabaseClient
  geminiKey?: string
  openaiKey?: string
  embedText?: (text: string) => Promise<number[]>
  /** 요청 단위 work_cases 도구 인스턴스 (라우터·AI SDK 공유) */
  workCaseTools?: WorkCaseTools | null
  rerankCases?: (query: string, cases: any[]) => Promise<any[]>
  /** 사용자 Google OAuth refresh token (개인 Drive 접근용) */
  userRefreshToken?: string
  supabaseUser?: SupabaseClient
}

export type McpToolEnableFlags = {
  webSearch?: boolean
  companyRag?: boolean
  workCaseKnowledge?: boolean
  googleSpreadsheetRead?: boolean
  univerOffice?: boolean
  databaseQuery?: boolean
  googleDriveSearch?: boolean
  readMyEmail?: boolean
  readWebPage?: boolean
}

export { isGoogleSpreadsheetReadConfigured, isGoogleDriveConfigured, type GoogleSpreadsheetReadResult }

async function executeReadGoogleSpreadsheet(input: {
  spreadsheetId: string
  range: string
}): Promise<GoogleSpreadsheetReadResult> {
  const result = await readGoogleSpreadsheetValues(input)
  if (!result.ok) return result
  return {
    ...result,
    message: result.message
      ? `${result.message}. rows(JSON)와 markdownTable을 근거로 답변하라.`
      : "rows(JSON)와 markdownTable을 근거로 답변하라.",
  }
}

/** MCP inputSchema → AI SDK zod 스키마 (코어 5종) */
function zodFromMcpDefinition(def: McpToolDefinition) {
  switch (def.name) {
    case MCP_CORE_TOOL_NAMES.SEARCH_WEB_NEWS:
      return z.object({
        query: z.string().min(1),
        num_results: z
          .number()
          .int()
          .min(1)
          .max(EXA_KOREAN_NEWS_NUM_RESULTS)
          .optional(),
      })
    case MCP_CORE_TOOL_NAMES.SEARCH_COMPANY_DOCUMENTS:
      return z.object({
        query: z.string().min(1),
        match_count: z.number().int().min(1).max(25).optional(),
        similarity_threshold: z.number().min(0).max(1).optional(),
      })
    case MCP_CORE_TOOL_NAMES.SEARCH_SIMILAR_CASES:
      return z.object({
        situation: z.string().min(1),
        match_count: z.number().int().min(1).max(25).optional(),
        similarity_threshold: z.number().min(0).max(1).optional(),
      })
    case MCP_CORE_TOOL_NAMES.ACCUMULATE_NEW_CASE:
      return z.object({
        title: z.string().min(1),
        content: z.string().min(1),
      })
    case MCP_CORE_TOOL_NAMES.UPDATE_EXISTING_CASE:
      return z
        .object({
          id: z.string().uuid(),
          title: z.string().min(1).optional(),
          content: z.string().min(1).optional(),
        })
        .refine((v) => v.title !== undefined || v.content !== undefined, {
          message: "title 또는 content 중 하나 이상은 필요합니다.",
        })
    case MCP_CORE_TOOL_NAMES.READ_GOOGLE_SPREADSHEET:
      return z.object({
        spreadsheetId: z.string().min(1),
        range: z.string().min(1),
      })
    case MCP_CORE_TOOL_NAMES.QUERY_COMPANY_DATABASE:
      return z.object({
        view_name: z.string().min(1),
        filter_column: z.string().optional(),
        filter_value: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
    case MCP_CORE_TOOL_NAMES.SEARCH_GOOGLE_DRIVE:
      return z.object({
        query: z.string().min(1),
        max_results: z.number().int().min(1).max(10).optional(),
      })
    case MCP_CORE_TOOL_NAMES.READ_GOOGLE_DRIVE_FILE:
      return z.object({
        file_id: z.string().min(1),
      })
    case MCP_CORE_TOOL_NAMES.READ_MY_EMAIL:
      return z.object({
        max_results: z.number().int().min(1).max(50).optional(),
      })
    case MCP_CORE_TOOL_NAMES.READ_WEB_PAGE:
      return z.object({
        url: z.string().url(),
      })
    case MCP_CORE_TOOL_NAMES.INJECT_UNIVER_OFFICE_DATA:
      return z.object({
        user_request: z.string().min(1),
        activeTab: z.enum(["sheets", "docs", "slides"]).optional(),
        text: z.string().optional(),
        range: z.string().min(1).optional(),
        value: z
          .union([z.string(), z.number(), z.boolean(), z.null()])
          .optional(),
        sheetName: z.string().min(1).optional(),
        updates: z
          .array(
            z
              .object({
                range: z.string().min(1).optional(),
                a1Notation: z.string().min(1).optional(),
                value: z.union([
                  z.string(),
                  z.number(),
                  z.boolean(),
                  z.null(),
                ]),
                sheetName: z.string().min(1).optional(),
                sheet: z.string().min(1).optional(),
              })
              .refine(
                (row) => Boolean(row.range ?? row.a1Notation),
                {
                  message:
                    "updates 각 항목에는 range 또는 a1Notation 이 필요합니다.",
                },
              ),
          )
          .optional(),
        map: z
          .record(
            z.string(),
            z.union([z.string(), z.number(), z.boolean(), z.null()]),
          )
          .optional(),
      })
    default:
      return z.object({}).passthrough()
  }
}

/** Exa 검색 — bridge_skip 징검다리 패턴 유지 */
async function executeSearchWebNews(
  ctx: McpToolExecutionContext,
  input: { query: string; num_results?: number },
): Promise<WebSearchToolResult> {
  const exaApiKey = ctx.exaApiKey?.trim()
  if (!exaApiKey) {
    return {
      ok: false,
      query: input.query,
      searched_at: new Date().toISOString(),
      items: [],
      message: "EXA_API_KEY 미설정",
      bridge_skip: true,
    }
  }
  return await executeWebNewsSearch(
    exaApiKey,
    input.query,
    input.num_results ?? EXA_KOREAN_NEWS_NUM_RESULTS,
  )
}

async function executeSearchCompanyDocuments(
  ctx: McpToolExecutionContext,
  input: {
    query: string
    match_count?: number
    similarity_threshold?: number
  },
): Promise<
  | { ok: true; matches: CompanyDocumentMatch[] }
  | { ok: false; error: string }
> {
  if (!ctx.admin || !ctx.geminiKey) {
    return {
      ok: false,
      error: "사내 문서 검색(RAG)을 사용할 수 없습니다. (admin/geminiKey)",
    }
  }
  try {
    const matches = await retrieveCompanyDocumentMatches({
      admin: ctx.admin,
      userClient: ctx.supabaseUser,
      geminiKey: ctx.geminiKey,
      openaiKey: ctx.openaiKey,
      query: input.query,
      matchCount: input.match_count,
      similarityThreshold: input.similarity_threshold,
    })
    return { ok: true, matches }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

type AiSdkToolWithExecute = {
  execute?: (input: unknown, options?: unknown) => Promise<unknown>
}

async function invokeAiSdkToolExecute(
  aiTool: ReturnType<typeof tool>,
  input: unknown,
): Promise<unknown> {
  const execute = (aiTool as AiSdkToolWithExecute).execute
  if (typeof execute !== "function") {
    return { ok: false, error: "도구 execute 핸들러가 없습니다." }
  }
  return await execute(input)
}

async function executeReadWebPage(input: { url: string }): Promise<{ ok: boolean; content?: string; error?: string }> {
  try {
    const jinaUrl = `https://r.jina.ai/${input.url}`;
    const res = await fetch(jinaUrl, {
      method: "GET",
      headers: {
        "Accept": "text/plain",
        "X-Return-Format": "markdown"
      }
    });
    if (!res.ok) {
      return { ok: false, error: `웹페이지 접속 실패: HTTP ${res.status}` };
    }
    const content = await res.text();
    return { ok: true, content };
  } catch (err) {
    return { ok: false, error: `웹페이지 스크래핑 오류: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * tool_use / tool_calls 중앙 라우터
 * — AI SDK execute 콜백과 향후 수동 에이전트 루프 모두 이 함수로 분기합니다.
 */
export async function routeMcpToolInvocation(
  toolName: string,
  input: unknown,
  ctx: McpToolExecutionContext,
): Promise<unknown> {
  switch (toolName) {
    case MCP_CORE_TOOL_NAMES.SEARCH_WEB_NEWS: {
      const parsed = input as { query: string; num_results?: number }
      return await executeSearchWebNews(ctx, parsed)
    }

    case MCP_CORE_TOOL_NAMES.SEARCH_COMPANY_DOCUMENTS: {
      const parsed = input as {
        query: string
        match_count?: number
        similarity_threshold?: number
      }
      return await executeSearchCompanyDocuments(ctx, parsed)
    }

    case MCP_CORE_TOOL_NAMES.SEARCH_SIMILAR_CASES: {
      const workCaseTools = ctx.workCaseTools
      if (!workCaseTools) {
        return { ok: false, error: "work_cases 검색을 사용할 수 없습니다." }
      }
      const parsed = input as {
        situation: string
        match_count?: number
        similarity_threshold?: number
      }
      return await invokeAiSdkToolExecute(
        workCaseTools.search_similar_cases,
        parsed,
      )
    }

    case MCP_CORE_TOOL_NAMES.ACCUMULATE_NEW_CASE: {
      const workCaseTools = ctx.workCaseTools
      if (!workCaseTools) {
        return { ok: false, error: "work_cases 저장을 사용할 수 없습니다." }
      }
      const parsed = input as { title: string; content: string }
      return await invokeAiSdkToolExecute(
        workCaseTools.accumulate_new_case,
        parsed,
      )
    }

    case MCP_CORE_TOOL_NAMES.UPDATE_EXISTING_CASE: {
      const workCaseTools = ctx.workCaseTools
      if (!workCaseTools) {
        return { ok: false, error: "work_cases 갱신을 사용할 수 없습니다." }
      }
      const parsed = input as {
        id: string
        title?: string
        content?: string
      }
      return await invokeAiSdkToolExecute(
        workCaseTools.update_existing_case,
        parsed,
      )
    }

    case MCP_CORE_TOOL_NAMES.READ_GOOGLE_SPREADSHEET: {
      const parsed = input as { spreadsheetId: string; range: string }
      return await executeReadGoogleSpreadsheet(parsed)
    }

    case MCP_CORE_TOOL_NAMES.QUERY_COMPANY_DATABASE: {
      if (!ctx.admin) {
        return { ok: false, error: "DB 조회에 admin 클라이언트가 필요합니다." }
      }
      const parsed = input as {
        view_name: string
        filter_column?: string
        filter_value?: string
        limit?: number
      }
      return await executeDbQuery(ctx.admin, parsed)
    }

    case MCP_CORE_TOOL_NAMES.SEARCH_GOOGLE_DRIVE: {
      const parsed = input as { query: string; max_results?: number }
      return await searchGoogleDrive({
        query: parsed.query,
        max_results: parsed.max_results,
        userRefreshToken: ctx.userRefreshToken,
      })
    }

    case MCP_CORE_TOOL_NAMES.READ_GOOGLE_DRIVE_FILE: {
      const parsed = input as { file_id: string }
      return await readGoogleDriveFile({
        fileId: parsed.file_id,
        userRefreshToken: ctx.userRefreshToken,
      })
    }

    case MCP_CORE_TOOL_NAMES.INJECT_UNIVER_OFFICE_DATA:
      return executeInjectUniverOfficeData(input)

    case MCP_CORE_TOOL_NAMES.READ_MY_EMAIL: {
      const parsed = input as { max_results?: number }
      if (!ctx.supabaseUser || !ctx.admin) {
        return { ok: false, error: "사용자 세션 또는 관리자 권한이 없습니다." }
      }
      
      const { data: authData, error: authErr } = await ctx.supabaseUser.auth.getUser()
      if (authErr || !authData?.user) {
        return { ok: false, error: "인증 정보를 가져오지 못했습니다." }
      }
      const userId = authData.user.id

      const { data: integ, error: integErr } = await ctx.admin
        .from("nh_user_integrations")
        .select("access_token")
        .eq("user_id", userId)
        .eq("provider", "google")
        .maybeSingle()

      if (integErr || !integ?.access_token) {
        return { ok: false, error: "Google 계정 연동(access_token)이 필요합니다." }
      }

      const accessToken = integ.access_token
      const maxResults = parsed.max_results ?? 3

      try {
        const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        if (!listRes.ok) {
          return { ok: false, error: `Gmail 목록을 가져오지 못했습니다. HTTP ${listRes.status}` }
        }
        const listData = await listRes.json()
        const messages = listData.messages || []
        
        if (messages.length === 0) {
          return { ok: true, result: "최근 수신된 메일이 없습니다." }
        }

        let resultText = "최근 이메일 목록:\n\n"
        for (const msg of messages) {
          const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          })
          if (msgRes.ok) {
            const msgData = await msgRes.json()
            const snippet = msgData.snippet || "본문 없음"
            resultText += `- ID: ${msg.id}\n  요약: ${snippet}\n\n`
          }
        }
        return { ok: true, result: resultText }
      } catch (e) {
        return { ok: false, error: `Gmail API 호출 중 오류: ${e instanceof Error ? e.message : String(e)}` }
      }
    }

    case MCP_CORE_TOOL_NAMES.READ_WEB_PAGE: {
      const parsed = input as { url: string };
      return await executeReadWebPage(parsed);
    }

    default:
      return { ok: false, error: `알 수 없는 MCP 코어 도구: ${toolName}` }
  }
}

/** MCP 정의 1건 → AI SDK tool (execute → routeMcpToolInvocation 위임) */
function mcpDefinitionToAiSdkTool(
  def: McpToolDefinition,
  ctx: McpToolExecutionContext,
): ReturnType<typeof tool> {
  return tool({
    description: def.description,
    inputSchema: zodSchema(zodFromMcpDefinition(def)),
    execute: async (input) => {
      return await routeMcpToolInvocation(def.name, input, ctx)
    },
  })
}

/**
 * 활성화 플래그에 따라 코어 MCP 도구를 AI SDK `tools` 맵으로 조립합니다.
 * Exa prefetch·시스템 RAG 주입과 병행 가능 — 기존 스트리밍 경로를 대체하지 않습니다.
 */
export function buildMcpCoreAiSdkTools(
  ctx: McpToolExecutionContext,
  flags: McpToolEnableFlags,
): Record<string, ReturnType<typeof tool>> {
  const out: Record<string, ReturnType<typeof tool>> = {}

  if (flags.webSearch && ctx.exaApiKey) {
    const def = NH_CORE_MCP_TOOL_DEFINITIONS[MCP_CORE_TOOL_NAMES.SEARCH_WEB_NEWS]
    out[MCP_CORE_TOOL_NAMES.SEARCH_WEB_NEWS] = mcpDefinitionToAiSdkTool(def, ctx)
  }

  if (flags.companyRag && ctx.admin && ctx.geminiKey) {
    const def = NH_CORE_MCP_TOOL_DEFINITIONS[
      MCP_CORE_TOOL_NAMES.SEARCH_COMPANY_DOCUMENTS
    ]
    out[MCP_CORE_TOOL_NAMES.SEARCH_COMPANY_DOCUMENTS] =
      mcpDefinitionToAiSdkTool(def, ctx)
  }

  if (flags.workCaseKnowledge && ctx.admin && ctx.embedText) {
    ctx.workCaseTools = ctx.workCaseTools ??
      createWorkCaseKnowledgeTools({
        admin: ctx.admin,
        embedText: ctx.embedText,
        rerankCases: ctx.rerankCases,
      })

    for (const name of [
      MCP_CORE_TOOL_NAMES.SEARCH_SIMILAR_CASES,
      MCP_CORE_TOOL_NAMES.ACCUMULATE_NEW_CASE,
      MCP_CORE_TOOL_NAMES.UPDATE_EXISTING_CASE,
    ] as const) {
      out[name] = mcpDefinitionToAiSdkTool(
        NH_CORE_MCP_TOOL_DEFINITIONS[name],
        ctx,
      )
    }
  }

  if (flags.googleSpreadsheetRead && isGoogleSpreadsheetReadConfigured()) {
    const def = NH_CORE_MCP_TOOL_DEFINITIONS[
      MCP_CORE_TOOL_NAMES.READ_GOOGLE_SPREADSHEET
    ]
    out[MCP_CORE_TOOL_NAMES.READ_GOOGLE_SPREADSHEET] =
      mcpDefinitionToAiSdkTool(def, ctx)
  }

  if (flags.univerOffice) {
    out[MCP_CORE_TOOL_NAMES.INJECT_UNIVER_OFFICE_DATA] =
      createInjectUniverOfficeDataTool()
  }

  if (flags.databaseQuery && ctx.admin) {
    for (const name of [
      MCP_CORE_TOOL_NAMES.QUERY_COMPANY_DATABASE,
    ] as const) {
      out[name] = mcpDefinitionToAiSdkTool(
        NH_CORE_MCP_TOOL_DEFINITIONS[name],
        ctx,
      )
    }
  }

  if (flags.googleDriveSearch) {
    for (const name of [
      MCP_CORE_TOOL_NAMES.SEARCH_GOOGLE_DRIVE,
      MCP_CORE_TOOL_NAMES.READ_GOOGLE_DRIVE_FILE,
    ] as const) {
      out[name] = mcpDefinitionToAiSdkTool(
        NH_CORE_MCP_TOOL_DEFINITIONS[name],
        ctx,
      )
    }
  }

  if (flags.readMyEmail) {
    const def = NH_CORE_MCP_TOOL_DEFINITIONS[MCP_CORE_TOOL_NAMES.READ_MY_EMAIL]
    out[MCP_CORE_TOOL_NAMES.READ_MY_EMAIL] = mcpDefinitionToAiSdkTool(def, ctx)
  }

  if (flags.readWebPage) {
    const def = NH_CORE_MCP_TOOL_DEFINITIONS[MCP_CORE_TOOL_NAMES.READ_WEB_PAGE]
    out[MCP_CORE_TOOL_NAMES.READ_WEB_PAGE] = mcpDefinitionToAiSdkTool(def, ctx)
  }

  return out
}

/** Claude/GPT API `tools` 파라미터용 — 활성 코어 도구의 MCP 정의 배열 */
export function listActiveMcpToolDefinitions(
  flags: McpToolEnableFlags,
): McpToolDefinition[] {
  const names: McpCoreToolName[] = []
  if (flags.webSearch) names.push(MCP_CORE_TOOL_NAMES.SEARCH_WEB_NEWS)
  if (flags.companyRag) {
    names.push(MCP_CORE_TOOL_NAMES.SEARCH_COMPANY_DOCUMENTS)
  }
  if (flags.workCaseKnowledge) {
    names.push(
      MCP_CORE_TOOL_NAMES.SEARCH_SIMILAR_CASES,
      MCP_CORE_TOOL_NAMES.ACCUMULATE_NEW_CASE,
      MCP_CORE_TOOL_NAMES.UPDATE_EXISTING_CASE,
    )
  }
  if (flags.googleSpreadsheetRead && isGoogleSpreadsheetReadConfigured()) {
    names.push(MCP_CORE_TOOL_NAMES.READ_GOOGLE_SPREADSHEET)
  }
  if (flags.univerOffice) {
    names.push(MCP_CORE_TOOL_NAMES.INJECT_UNIVER_OFFICE_DATA)
  }
  if (flags.databaseQuery) {
    names.push(MCP_CORE_TOOL_NAMES.QUERY_COMPANY_DATABASE)
  }
  if (flags.googleDriveSearch && isGoogleDriveConfigured()) {
    names.push(
      MCP_CORE_TOOL_NAMES.SEARCH_GOOGLE_DRIVE,
      MCP_CORE_TOOL_NAMES.READ_GOOGLE_DRIVE_FILE,
    )
  }
  if (flags.readMyEmail) {
    names.push(MCP_CORE_TOOL_NAMES.READ_MY_EMAIL)
  }
  if (flags.readWebPage) {
    names.push(MCP_CORE_TOOL_NAMES.READ_WEB_PAGE)
  }
  return names.map((name) => NH_CORE_MCP_TOOL_DEFINITIONS[name])
}

/** 시스템 프롬프트에 붙일 코어 MCP 가이던스 블록 */
export function buildMcpCoreToolGuidance(flags: McpToolEnableFlags): string {
  let block = ""
  if (flags.webSearch) block += WEB_SEARCH_TOOL_GUIDANCE
  if (flags.companyRag) block += MCP_COMPANY_RAG_TOOL_GUIDANCE
  if (flags.workCaseKnowledge) block += MCP_KNOWLEDGE_AGENT_TOOL_GUIDANCE
  if (flags.googleSpreadsheetRead && isGoogleSpreadsheetReadConfigured()) {
    block += MCP_GOOGLE_SPREADSHEET_TOOL_GUIDANCE
  }
  if (flags.univerOffice) {
    block += UNIVER_OFFICE_TOOL_GUIDANCE
  }
  if (flags.databaseQuery) {
    block += MCP_DATABASE_QUERY_TOOL_GUIDANCE
  }
  if (flags.googleDriveSearch && isGoogleDriveConfigured()) {
    block += MCP_GOOGLE_DRIVE_TOOL_GUIDANCE
  }
  if (flags.readWebPage) {
    block += MCP_WEB_SCRAPER_TOOL_GUIDANCE
  }
  return block
}

/** 에이전트 루프 메타 — 활성 도구 이름 목록 (NDJSON meta / done 이벤트용) */
export function listActiveMcpToolNames(
  flags: McpToolEnableFlags,
): string[] {
  return listActiveMcpToolDefinitions(flags).map((d) => d.name)
}
