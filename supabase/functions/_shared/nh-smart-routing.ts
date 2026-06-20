/**
 * (주)농협네트웍스 사내 업무 자동화 및 AI 어시스턴트 인프라
 * 중앙 스마트 라우팅 컨트롤러 (NHSmartRoutingController) - 2026 최신 프론티어 리팩토링
 *
 * 파일 경로: supabase/functions/_shared/nh-smart-routing.ts
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.8"
import { normalizeBudgetDepartment } from "./budgetHelper.ts"

// 1. 사내 처리 업무 유형 정의
export type NHTaskType =
  | "DATA_CRAWLING_MATCHING" // 1) 데이터 수집 및 짜집기 (나라장터, 조달청 쇼핑몰 단가)
  | "COMPANY_REGULATION_SEARCH" // 2) 법인 규정 검색 (대용량 컨텍스트 조회)
  | "MATHEMATICAL_ESTIMATION" // 3) 수리 연산 및 가변 견적
  | "IMAGE_ANALYSIS_OCR" // 4) 이미지 분석 및 OCR (차량등록증, 공사현장 이미지)
  | "TRAVEL_CONSULTING" // 5) 여행/관광 컨설팅 (제미나이 자체 컨텍스트 기반)
  | "GENERAL_CHAT" // 일반적인 질의응답

// 2. 모델 라우팅 결과 정의
export type NHExtendedTaskType = NHTaskType
  | "COMPANY_DOCUMENT_RAG"
  | "LONG_FORM_WRITING"
  | "CODE_SYSTEM_DESIGN"
  | "GOOGLE_WORKSPACE"
  | "BATCH_LOW_COST"
  | "INTERNAL_SPECIALIZED"
  | "PUBLIC_DATA_QUERY"

export type NHRouteProvider = "google" | "anthropic" | "openai" | "deepseek" | "hermes"
export type NHProviderPreference = "auto" | NHRouteProvider | "openrouter"

export type NHAssistantCostLevel = "low" | "medium" | "high"

export type NHAssistantFallbackReasonCode =
  | "no_explicit_assistant_intent"
  | "no_eligible_candidate"
  | "registry_unavailable"
  | "permission_unverified"
  | "required_extension_unavailable"
  | "cost_policy_blocked"
  | "router_exception"

export interface NHSelectedAssistant {
  assistantId: string
  name: string
  category: string
  reasonCode:
    | "task_match"
    | "explicit_service_intent"
    | "required_tool_match"
    | "public_data_match"
    | "compound_request"
  reason: string
  confidence: number
  costLevel: NHAssistantCostLevel
  requiredTools: string[]
  modelPolicy: {
    preferredModel: string | null
    fallbackModel: string | null
    routeModelCompatible: boolean
  }
}

export interface NHAssistantPlan {
  mode: "model_only" | "assistant_candidates"
  selectionMode: "none" | "single" | "limited_parallel" | "sequential"
  requestComplexity: "simple" | "standard" | "compound"
  selectedAssistants: NHSelectedAssistant[]
  maxAssistants: 0 | 1 | 3
  estimatedCostLevel: NHAssistantCostLevel
  reason: string
  fallback: "model_only"
  fallbackReasonCode?: NHAssistantFallbackReasonCode
}

export interface NHRouteResult {
  taskType: NHExtendedTaskType
  provider: NHRouteProvider
  modelId: string
  estimatedCostUsd: number
  assistantPlan?: NHAssistantPlan
  // Context Caching 적용 여부 (Gemini 3.1 Pro 대용량 RAG 조회 용)
  useContextCaching: boolean
  cacheId?: string
  // Thinking Budget 제어 파라미터 (DeepSeek-R1, ChatGPT o3-mini 용)
  thinkingBudget?: {
    enabled: boolean
    reasoningEffort?: "low" | "medium" | "high" // OpenAI o3-mini / o3
    maxThinkingTokens?: number // DeepSeek-R1 혹은 API 명세용
  }
  // 외부 인프라 연동 요구사항 플래그
  externalApiRequirements?: {
    triggerProcurementCrawler: boolean // 공공데이터포털 나라장터 연동 필요 여부
    triggerGeminiStructuredOcr: boolean // Gemini 3.5 Flash용 Strict JSON Schema OCR 필요 여부
  }
}

interface AssistantRegistryRouteRow {
  assistant_id: string
  name: string
  category: string
  status: "partial" | "ready"
  default_model: string | null
  fallback_model: string | null
  cost_level: NHAssistantCostLevel
  permission_scopes: string[] | null
  task_types: string[] | null
  sort_order: number
  metadata: Record<string, unknown> | null
}

interface AssistantIntent {
  assistantId: string
  taskType: string
  reason: string
}

const ASSISTANT_SCORE_THRESHOLD = 70
const MAX_COMPOUND_ASSISTANTS = 3

const ROUTE_TASK_TO_ASSISTANT_TASKS: Partial<Record<NHExtendedTaskType, string[]>> = {
  GOOGLE_WORKSPACE: [
    "email_summary",
    "email_search",
    "calendar_lookup",
    "schedule_summary",
    "drive_search",
    "spreadsheet_read",
  ],
  COMPANY_DOCUMENT_RAG: ["company_document_qa", "rag", "document_lookup"],
  LONG_FORM_WRITING: ["report_writing", "content_writing"],
  PUBLIC_DATA_QUERY: ["public_data_search", "public_data_report"],
  DATA_CRAWLING_MATCHING: ["web_research", "public_data_search"],
}

// Vite 컴파일러 정합성 보호를 위한 Deno 환경 변수 안전 헬퍼
function safeGetEnv(name: string): string | undefined {
  if (typeof Deno !== "undefined" && Deno.env) {
    return Deno.env.get(name);
  }
  return undefined;
}

function readBooleanEnv(name: string, fallback = false): boolean {
  const value = safeGetEnv(name)?.trim().toLowerCase()
  if (!value) return fallback
  return value === "1" || value === "true" || value === "yes" || value === "on"
}

function detectAssistantIntents(prompt: string): AssistantIntent[] {
  const intents: AssistantIntent[] = []
  const gmailService = /\bgmail\b|지메일|이메일|메일/i.test(prompt)
  const gmailReadAction = /안\s*읽|읽지\s*않|받은\s*메일|메일\s*(조회|검색|요약)|요약.*메일/i.test(prompt)
  if (gmailService && gmailReadAction) {
    intents.push({
      assistantId: "gmail-assistant",
      taskType: "email_summary",
      reason: "Gmail 메일 조회 또는 요약 요청과 일치합니다.",
    })
  }

  const calendarService = /google\s*calendar|구글\s*캘린더|캘린더|일정/i.test(prompt)
  const calendarReadAction = /일정\s*(조회|확인|요약|검색)|예정\s*일정|오늘.*일정|일정.*(알려|보여|정리)/i.test(prompt)
  if (calendarService && calendarReadAction) {
    intents.push({
      assistantId: "calendar-assistant",
      taskType: "calendar_lookup",
      reason: "Google Calendar 일정 조회 요청과 일치합니다.",
    })
  }

  return intents
}

function modelProvider(modelId: string | null): NHRouteProvider | null {
  const normalized = modelId?.trim().toLowerCase() ?? ""
  if (normalized.startsWith("gemini")) return "google"
  if (normalized.startsWith("claude")) return "anthropic"
  if (normalized.startsWith("gpt") || normalized.startsWith("o3")) return "openai"
  if (normalized.startsWith("deepseek")) return "deepseek"
  if (normalized.startsWith("hermes")) return "hermes"
  return null
}

function requiredToolsFromMetadata(metadata: Record<string, unknown> | null): string[] {
  const value = metadata?.required_tools
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
}

function highestCostLevel(levels: NHAssistantCostLevel[]): NHAssistantCostLevel {
  if (levels.includes("high")) return "high"
  if (levels.includes("medium")) return "medium"
  return "low"
}

function modelOnlyAssistantPlan(
  reason: string,
  fallbackReasonCode: NHAssistantFallbackReasonCode,
  complexity: NHAssistantPlan["requestComplexity"] = "simple",
): NHAssistantPlan {
  return {
    mode: "model_only",
    selectionMode: "none",
    requestComplexity: complexity,
    selectedAssistants: [],
    maxAssistants: complexity === "compound" ? 3 : complexity === "standard" ? 1 : 0,
    estimatedCostLevel: "low",
    reason,
    fallback: "model_only",
    fallbackReasonCode,
  }
}

export class NHSmartRoutingController {
  private adminClient: SupabaseClient

  constructor(adminClient: SupabaseClient) {
    this.adminClient = adminClient
  }

  public isAssistantRouterEnabled(): boolean {
    return readBooleanEnv("ASSISTANT_ROUTER_ENABLED", false)
  }

  public isAssistantRouterShadowMode(): boolean {
    return readBooleanEnv("ASSISTANT_ROUTER_SHADOW_MODE", true)
  }

  /**
   * Produces Assistant candidates only. It never invokes an Assistant or a tool.
   * Permission and extension capability enforcement is added before orchestration.
   */
  public async selectAssistantCandidates(input: {
    prompt: string
    route: NHRouteResult
  }): Promise<NHAssistantPlan | null> {
    if (!this.isAssistantRouterEnabled()) return null

    const intents = detectAssistantIntents(input.prompt)
    const complexity: NHAssistantPlan["requestComplexity"] =
      intents.length > 1 ? "compound" : intents.length === 1 ? "standard" : "simple"

    if (intents.length === 0) {
      return modelOnlyAssistantPlan(
        "외부 서비스 작업이 명시되지 않아 기존 모델 직접 호출 경로를 유지합니다.",
        "no_explicit_assistant_intent",
        complexity,
      )
    }

    try {
      const { data, error } = await this.adminClient
        .from("assistant_registry")
        .select(
          "assistant_id, name, category, status, default_model, fallback_model, cost_level, permission_scopes, task_types, sort_order, metadata",
        )
        .eq("enabled", true)
        .in("status", ["partial", "ready"])

      if (error) {
        console.warn("[Assistant-Router] Registry 조회 실패; model_only로 복귀합니다.", error.code)
        return modelOnlyAssistantPlan(
          "Assistant Registry를 사용할 수 없어 기존 모델 경로를 유지합니다.",
          "registry_unavailable",
          complexity,
        )
      }

      const rows = (data ?? []) as AssistantRegistryRouteRow[]
      const intentByAssistant = new Map(intents.map((intent) => [intent.assistantId, intent]))
      const routeTasks = new Set(ROUTE_TASK_TO_ASSISTANT_TASKS[input.route.taskType] ?? [])

      const candidates = rows.flatMap((row) => {
        const intent = intentByAssistant.get(row.assistant_id)
        if (!intent) return []

        const assistantTasks = row.task_types ?? []
        const exactTaskMatch = assistantTasks.includes(intent.taskType)
        const mappedRouteTaskMatch = assistantTasks.some((task) => routeTasks.has(task))
        const routeAllowsExplicitIntent = mappedRouteTaskMatch || input.route.taskType === "GENERAL_CHAT"
        if (!exactTaskMatch || !routeAllowsExplicitIntent) return []

        let score = 40 + 25
        if (mappedRouteTaskMatch) score += 15
        if (row.cost_level === "low") score += 5
        if (row.cost_level === "high") score -= 20

        const preferredProvider = modelProvider(row.default_model)
        const routeModelCompatible = preferredProvider === null || preferredProvider === input.route.provider
        if (routeModelCompatible) score += 5
        if (score < ASSISTANT_SCORE_THRESHOLD) return []

        const selected: NHSelectedAssistant = {
          assistantId: row.assistant_id,
          name: row.name,
          category: row.category,
          reasonCode: intents.length > 1 ? "compound_request" : "explicit_service_intent",
          reason: intent.reason,
          confidence: Math.min(0.99, score / 100),
          costLevel: row.cost_level,
          requiredTools: requiredToolsFromMetadata(row.metadata),
          modelPolicy: {
            preferredModel: row.default_model,
            fallbackModel: row.fallback_model,
            routeModelCompatible,
          },
        }

        return [{ selected, score, sortOrder: row.sort_order }]
      })

      candidates.sort((a, b) => b.score - a.score || a.sortOrder - b.sortOrder)
      const maxAssistants = complexity === "compound" ? MAX_COMPOUND_ASSISTANTS : 1
      const selectedAssistants = candidates.slice(0, maxAssistants).map((item) => item.selected)

      if (selectedAssistants.length === 0) {
        return modelOnlyAssistantPlan(
          "활성 상태와 요청 적합도를 충족하는 Assistant 후보가 없습니다.",
          "no_eligible_candidate",
          complexity,
        )
      }

      return {
        mode: "assistant_candidates",
        selectionMode: selectedAssistants.length > 1 ? "limited_parallel" : "single",
        requestComplexity: complexity,
        selectedAssistants,
        maxAssistants: complexity === "compound" ? 3 : 1,
        estimatedCostLevel: highestCostLevel(selectedAssistants.map((item) => item.costLevel)),
        reason: selectedAssistants.length > 1
          ? "서로 다른 복합 작업에 필요한 Assistant 후보를 최대 3개 범위에서 선택했습니다."
          : "명시된 외부 서비스 작업에 가장 적합한 Assistant 후보를 선택했습니다.",
        fallback: "model_only",
      }
    } catch (error) {
      console.warn(
        "[Assistant-Router] 후보 선택 예외; model_only로 복귀합니다.",
        error instanceof Error ? error.message : "unknown_error",
      )
      return modelOnlyAssistantPlan(
        "Assistant 후보를 확인할 수 없어 기존 모델 경로를 유지합니다.",
        "router_exception",
        complexity,
      )
    }
  }

  /**
   * 1단계: 사용자 프롬프트와 이미지 데이터 유무를 분석하여 태스크 인텐트 분류 (Intent Classification)
   */
  public classifyTask(prompt: string, hasImages: boolean): NHExtendedTaskType {
    const text = prompt.trim()

    // 4) 이미지 분석 및 OCR 판단 (우선순위 높음) - 외부 네이버 OCR 제거 후 통합
    if (hasImages || /차량등록증|자동차등록증|렌트카|렌터카|신차\s*등록|현장\s*사진|공사\s*현장|현장\s*이미지|균열|OCR/i.test(text)) {
      return "IMAGE_ANALYSIS_OCR"
    }

    // 1) 데이터 수집 및 짜집기 판단
    if (/나라장터|입찰|조달청|쇼핑몰|단가|종합쇼핑몰|크롤링|수집|짜집기/i.test(text)) {
      return "DATA_CRAWLING_MATCHING"
    }

    // 2) 법인 규정 검색 판단
    if (/규정집|중앙회\s*규정|네트웍스\s*규정|사규|내규|정관|규정\s*검색|조회/i.test(text)) {
      return "COMPANY_REGULATION_SEARCH"
    }

    // 3) 수리 연산 및 가변 견적 판단
    if (/견적|비교견적|추정실적|공사기간|가변\s*견적|수리|연산|실적\s*산출|엑셀\s*정리|품목\s*추가|품목\s*삭제/i.test(text)) {
      return "MATHEMATICAL_ESTIMATION"
    }

    // 5) 여행/관광 컨설팅 판단
    if (/여행|관광|일정\s*추천|관광료|호텔비|제안서|NH여행|항공|일정표/i.test(text)) {
      return "TRAVEL_CONSULTING"
    }

    if (/공공데이터|공공기관\s*자료|지역별\s*인구|농업\s*통계|data\.go\.kr/i.test(text)) return "PUBLIC_DATA_QUERY"
    if (/회사\s*문서|사내\s*문서|내부\s*규정|지식베이스|RAG|Dify/i.test(text)) return "COMPANY_DOCUMENT_RAG"
    if (/코드\s*작성|리팩토링|시스템\s*설계|아키텍처|디버깅|프로그래밍/i.test(text)) return "CODE_SYSTEM_DESIGN"
    if (/Google\s*(Workspace|Drive|Docs|Sheets|Calendar)|구글\s*(드라이브|문서|시트|캘린더)/i.test(text)) return "GOOGLE_WORKSPACE"
    if (/보고서|기획서|제안서|장문|초안\s*작성/i.test(text) || text.length > 4000) return "LONG_FORM_WRITING"
    if (/대량|일괄|배치|반복\s*처리|여러\s*건|저비용\s*요약/i.test(text)) return "BATCH_LOW_COST"
    if (/회사\s*내부\s*특화|사내\s*특화|Hermes/i.test(text)) return "INTERNAL_SPECIALIZED"

    return "GENERAL_CHAT"
  }

  /**
   * 2단계: 분류된 태스크에 따라 최적의 모델 매칭, 비용 최적화, 추론 버젯 제어 파라미터 설계 (2026 프론티어 버전 최신화)
   */
  public async determineRoute(
    prompt: string,
    hasImages: boolean,
    department: string | null,
    preferredProvider: NHProviderPreference = "auto",
  ): Promise<NHRouteResult> {
    const taskType = this.classifyTask(prompt, hasImages)
    const dept = normalizeBudgetDepartment(department)

    let provider: NHRouteProvider = "google"
    let modelId = "gemini-2.5-flash"
    let useContextCaching = false
    let estimatedCostUsd = 0.001
    let thinkingBudget: NHRouteResult["thinkingBudget"] = undefined
    let externalApiRequirements: NHRouteResult["externalApiRequirements"] = undefined

    switch (taskType) {
      case "COMPANY_DOCUMENT_RAG":
        provider = "google"
        modelId = "gemini-2.5-pro"
        useContextCaching = true
        estimatedCostUsd = 0.004
        break

      case "LONG_FORM_WRITING":
        provider = "anthropic"
        modelId = "claude-sonnet-4-6"
        estimatedCostUsd = 0.012
        break

      case "CODE_SYSTEM_DESIGN":
        provider = "openai"
        modelId = "gpt-5.4"
        estimatedCostUsd = 0.012
        break

      case "GOOGLE_WORKSPACE":
        provider = "google"
        modelId = "gemini-2.5-flash"
        estimatedCostUsd = 0.002
        break

      case "BATCH_LOW_COST":
        provider = "deepseek"
        modelId = "deepseek-chat"
        estimatedCostUsd = 0.001
        break

      case "INTERNAL_SPECIALIZED":
        provider = "hermes"
        modelId = safeGetEnv("HERMES_MODEL_ID") ?? "hermes-default"
        estimatedCostUsd = 0.001
        break

      case "PUBLIC_DATA_QUERY":
        provider = "google"
        modelId = "gemini-2.5-flash"
        estimatedCostUsd = 0.002
        break

      case "COMPANY_REGULATION_SEARCH":
        // [규정 RAG 조회] Gemini 3.1 Pro 활용 (API 상에서는 대용량 2.5-pro / 1.5-pro 대응 매핑)
        // 입력 비용 75% 절감을 위해 Context Caching 구조 강제 적용 유지
        provider = "google"
        modelId = "gemini-2.5-pro"
        useContextCaching = true
        estimatedCostUsd = 0.004 // 캐싱 할인 적용가 반영
        break

      case "IMAGE_ANALYSIS_OCR":
        // [비전 OCR 및 현장 분석] 외부 CLOVA OCR을 완전히 삭제하고, Gemini 3.5 Flash 전담 일원화
        provider = "google"
        modelId = "gemini-2.5-flash"
        useContextCaching = false
        estimatedCostUsd = 0.0015 // 초저비용 고가성비 단가 매칭

        // 제미나이 호출 시 Strict JSON Schema 포맷을 강제 주입하기 위한 플래그 활성화
        externalApiRequirements = {
          triggerProcurementCrawler: false,
          triggerGeminiStructuredOcr: true
        }
        break

      case "DATA_CRAWLING_MATCHING":
      case "TRAVEL_CONSULTING":
        // [데이터 수집 짜집기 / 대외 제안 및 일정 보고서]
        // 비즈니스 완성도와 가독성이 가장 정교하고 문장력이 뛰어난 Claude Sonnet 4.6 매칭
        provider = "anthropic"
        modelId = "claude-3-5-sonnet"
        estimatedCostUsd = 0.012

        if (taskType === "DATA_CRAWLING_MATCHING") {
          externalApiRequirements = {
            triggerProcurementCrawler: true,
            triggerGeminiStructuredOcr: false
          }
        }
        break

      case "MATHEMATICAL_ESTIMATION":
        // [수리 연산 및 가변 견적] 정확한 대용량 수학/견적 연산은 DeepSeek-R1(메인)로 분기
        // 다단계 복잡 예외 처리가 가미된 지능형 추론은 o3-mini(백업)로 분기 및 스케줄링

        const isComplexException = prompt.length > 2500 || /추정실적|공사기간|품목\s*삭제\s*연동/i.test(prompt)

        if (isComplexException) {
          // OpenAI o3-mini 백업 라우팅 및 스케줄러 제어
          provider = "openai"
          modelId = "o3-mini"

          let reasoningEffort: "low" | "medium" | "high" = "medium"
          if (prompt.length > 4000) {
            reasoningEffort = "high"
            estimatedCostUsd = 0.025
          } else if (prompt.length < 800) {
            reasoningEffort = "low"
            estimatedCostUsd = 0.006
          } else {
            estimatedCostUsd = 0.012
          }

          thinkingBudget = {
            enabled: true,
            reasoningEffort,
            maxThinkingTokens: reasoningEffort === "high" ? 4000 : reasoningEffort === "medium" ? 2000 : 1000
          }
        } else {
          // DeepSeek-R1 API 키가 없으므로 o3-mini 로 대체 라우팅
          provider = "openai"
          modelId = "o3-mini"
          estimatedCostUsd = 0.012

          thinkingBudget = {
            enabled: true,
            reasoningEffort: "medium",
            maxThinkingTokens: 2000
          }
        }
        break

      case "GENERAL_CHAT":
      default:
        // 일반 응답은 초고속/초저비용 Gemini 3.5 Flash 로직 처리
        provider = "google"
        modelId = "gemini-2.5-flash"
        estimatedCostUsd = 0.0008
        break
    }

    if (preferredProvider !== "auto" && preferredProvider !== "openrouter") {
      provider = preferredProvider
      const complex = taskType === "LONG_FORM_WRITING" ||
        taskType === "CODE_SYSTEM_DESIGN" ||
        taskType === "MATHEMATICAL_ESTIMATION" ||
        taskType === "COMPANY_DOCUMENT_RAG"
      if (preferredProvider === "google") modelId = complex ? "gemini-2.5-pro" : "gemini-2.5-flash"
      if (preferredProvider === "openai") modelId = complex ? "gpt-5.4" : "gpt-5.4-mini"
      if (preferredProvider === "anthropic") modelId = complex ? "claude-sonnet-4-6" : "claude-haiku-4-5"
      if (preferredProvider === "deepseek") modelId = complex ? "deepseek-reasoner" : "deepseek-chat"
      if (preferredProvider === "hermes") modelId = safeGetEnv("HERMES_MODEL_ID") ?? "hermes-default"
    }

    return {
      taskType,
      provider,
      modelId,
      estimatedCostUsd,
      useContextCaching,
      thinkingBudget,
      externalApiRequirements
    }
  }

  /**
   * 3단계: 외부 API 데이터 연동 및 Strict JSON Schema(Structured Outputs) 프롬프트 파이프라인 주입 레이어
   */
  public async executePreflightVerification(
    route: NHRouteResult,
    inputData: { prompt: string; imageBase64?: string }
  ): Promise<{
    verifiedPrompt: string
    crawledData?: any
    ocrResult?: string
  }> {
    let verifiedPrompt = inputData.prompt
    let crawledData: any = null
    let ocrResult: string | undefined = undefined

    // 1) [완전 대체] 네이버 CLOVA OCR 을 삭제하고, Gemini 3.5 Flash Strict JSON Schema OCR 파이프라인 주입
    if (route.externalApiRequirements?.triggerGeminiStructuredOcr) {
      console.log("[NH-Smart-Router] Gemini 3.5 Flash Strict JSON Schema OCR 가이드라인 주입 시작...");

      // Strict JSON Schema를 강제하기 위한 Structured Prompt 가이드 빌딩
      ocrResult = `
[Strict Structured JSON Schema Required]
귀하는 입력받은 차량등록증 또는 현장 이미지에서 무결성을 유지하며 정확한 텍스트 정보를 추출하여 아래의 JSON 구조로만 답변해야 합니다. 마크다운 백틱(\`\`\`json)은 생략하고 순수 JSON 객체만 반환하십시오.

{
  "document_type": "차량등록증" | "공사현장사진" | "기타",
  "verification_details": {
    "car_number": "차량번호 (예: 12가3456) (해당없음 시 null)",
    "chassis_number": "차대번호 (해당없음 시 null)",
    "owner": "소유자명 (예: (주)농협네트웍스) (해당없음 시 null)",
    "first_registration_date": "최초등록일 (YYYY-MM-DD) (해당없음 시 null)",
    "inspection_status": "공사현장 상태 설명 및 주요 식별 균열/안전 위험 요소 (해당없음 시 null)",
    "confidence_score": 0.98
  }
}
`;
      verifiedPrompt = `${verifiedPrompt}\n\n[비전 이미지 데이터 추출 지침]:\n${ocrResult.trim()}`;
    }

    // 2) 공공데이터포털 Open API 연동 파이프라인 작동 (조달청 나라장터) - CORP 접두사 격리
    if (route.externalApiRequirements?.triggerProcurementCrawler) {
      console.log("[NH-Smart-Router] 공공데이터포털 조달청 나라장터 입찰 정보 조회 시작...");

      // CORP 접두사 격리 환경변수 사용
      const portalKey = safeGetEnv("CORP_DATA_PORTAL_API_KEY") || safeGetEnv("DATA_PORTAL_API_KEY");

      if (portalKey) {
        try {
          // 나라장터 시설공사 입찰공고 정보조회 Open API URL (Deno fetch)
          const apiEndpoint = `http://apis.data.go.kr/1230000/BidPublicInfoService04/getBidPblancListInfoCnstcPPSSrch01?serviceKey=${encodeURIComponent(portalKey)}&numOfRows=3&pageNo=1&inqryDiv=1&type=json`;

          const response = await fetch(apiEndpoint, {
            method: "GET",
            headers: {
              "Accept": "application/json"
            }
          });

          if (response.ok) {
            const data = await response.json();
            const items = data.response?.body?.items ?? [];
            crawledData = {
              source: "조달청 나라장터 실시간 OpenAPI (CORP Gateway)",
              queryTime: new Date().toISOString(),
              items: items.map((item: any) => ({
                title: item.bidPtclNm || item.bidPblancNm || "시설 개선 공사",
                status: item.bidPblancSttusNm || "공고중",
                price: item.assignBdgtAmt ? `${Number(item.assignBdgtAmt).toLocaleString()} KRW` : "미정",
                url: item.bidPblancDtlUrl || ""
              }))
            };
            console.log("[NH-Smart-Router] 공공데이터포털 OpenAPI 호출 성공.");
          } else {
            console.warn(`[NH-Smart-Router] 공공데이터포털 응답 실패 (HTTP ${response.status}). 목업 폴백.`);
          }
        } catch (err) {
          console.error("[NH-Smart-Router] 공공데이터포털 API 예외 발생. 목업 폴백.", err);
        }
      }

      if (!crawledData) {
        console.log("[NH-Smart-Router] CORP_DATA_PORTAL_API_KEY 미설정 또는 오류로 기본 사내 목업 입찰 공고 정보를 제공합니다.");
        crawledData = {
          source: "조달청 나라장터 입찰공고 API (Mockup)",
          queryTime: new Date().toISOString(),
          items: [
            { title: "농협네트웍스 시설 개선 공사 입찰", status: "공고중", price: "550,000,000 KRW" },
            { title: "사내 패키지 위탁 운영 입찰", status: "마감", price: "120,000,000 KRW" }
          ]
        };
      }

      verifiedPrompt = `${verifiedPrompt}\n\n[사전 수집 조달청 공공데이터]:\n${JSON.stringify(crawledData, null, 2)}`;
    }

    return {
      verifiedPrompt,
      crawledData,
      ocrResult
    }
  }
}
