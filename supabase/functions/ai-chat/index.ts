/**
 * NH AI Inside Hub — Edge Function `ai-chat`
 *
 * 브라우저 CORS 한계를 피하기 위해 AI SDK(`routeAiRequest` 와 동일한 순서의 로직)를 서버에서 실행합니다.
 * 이미지가 있으면 Google Drive에 저장한 뒤 Vision 모델로 스트리밍합니다.
 * 로직 기준: src/services/ai/router.ts, guardrail.ts, config.ts
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createAnthropic } from "npm:@ai-sdk/anthropic@3.0.78"
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google@3.0.75"
import { createOpenAI } from "npm:@ai-sdk/openai@3.0.64"
import { generateText, streamText, stepCountIs, type LanguageModel } from "npm:ai@6.0.184"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"

import { uploadChatImagesToGCS } from "../_shared/gcs.ts"
import { routePromptToModelId } from "../_shared/auto-route.ts"
import { NHSmartRoutingController } from "../_shared/nh-smart-routing.ts"
import { decryptCredential } from "../_shared/integration-auth.ts"
import { normalizePreferredAiToResolvedModel } from "../_shared/normalize-preferred-ai-model.ts"
import {
  loadAiModelRegistry,
  resolveRequestedChatModel,
} from "../_shared/ai-models-registry.ts"
import { embedWorkCaseText } from "../_shared/embeddings.ts"
// Removed old company-documents-rag
import {
  GUARDRAIL_SYSTEM_PROMPT,
  parseGuardrailVerdict,
  quickKeywordGuardrail,
} from "../_shared/guardrail-prompt.ts"
import { createDynamicPluginTools } from "../_shared/dynamic-plugin-tools.ts"
import {
  prefetchWebSearchContext,
  resolveWebSearchNeeded,
  resolveWebSearchPrefetchSystemBlock,
  WEB_SEARCH_GEMINI_GROUNDING_GUIDANCE,
  WEB_SEARCH_PREFETCH_GUIDANCE,
} from "../_shared/web-search-routing.ts"
import { loadUserGoogleRefreshToken } from "../_shared/google-user-access-token.ts"
import { createGoogleWorkspaceAgentTools } from "../_shared/google-workspace-agent-tools.ts"
import {
  buildMcpCoreAiSdkTools,
  buildMcpCoreToolGuidance,
  listActiveMcpToolDefinitions,
  MCP_CORE_TOOL_NAMES,
  type McpToolEnableFlags,
  type McpToolExecutionContext,
  WEB_SEARCH_TOOL_NAME,
} from "./mcp-tools.ts"
import {
  assertDepartmentBudgetAllowed,
  readBudgetEstimatedCallUsd,
} from "../_shared/budgetHelper.ts"
import {
  handleCorsPreflight,
  jsonResponse,
  withCors,
} from "../_shared/cors.ts"
import { buildNhPortalSystemInstruction } from "../_shared/nh-company-system-prompt.ts"
import {
  handleMediaGeneration,
  handleMediaRouterRequest,
} from "./mediaRouter.ts"
import { getTokenWeight } from "../_shared/token-costs.ts"

/** 텍스트 SSE 경로에서만 전달(동적 플러그인 도구 활성 시). */
const PLUGIN_TOOL_GUIDANCE = `

## 외부·내장 플러그인 (동적 도구)
관리자가 **활성(ON)** 으로 둔 플러그인만 \`tool_function_name\` 키의 도구로 노출됩니다.
- 예: \`get_weather\`, \`get_exchange_rate\`, \`search_web_news\` 등
- 필요 시 해당 도구를 호출하고, 결과 JSON 을 검증·요약하여 사용자에게 전달하라.
- 비활성(OFF) 플러그인은 존재하지 않는 것처럼 행동하라.`

const GOOGLE_WORKSPACE_TOOL_GUIDANCE = `

## Google Workspace 에이전트
사용자 Google 계정이 연동된 경우 \`google_add_calendar\`, \`google_append_sheets\` 도구를 사용할 수 있다.
- 일정·미팅·회의 등록 요청 → **google_add_calendar** (summary, startTime, endTime ISO8601, description 선택)
- 스프레드시트·엑셀·시트에 행 추가 → **google_append_sheets** (spreadsheetId, range, values)
- 도구 실행 후 결과(성공/실패)를 사용자에게 명확히 알려라.
- 연동되지 않았다면 설정 → 연동에서 Google Workspace 연결을 안내하라.`

const GOOGLE_THINKING_FORMAT_GUIDANCE = `

## 사고 과정 표시 (필수)
최종 답변 전에 \`<thinking>\` 과 \`</thinking>\` 사이에 2~6문장 한국어로 핵심 추론·확인 사항을 먼저 작성하라. 태그 밖에는 사용자에게 보여줄 최종 답변만 출력하라. \`<thinking>\` 태그는 최종 답변 본문에 포함하지 마라.`

const GUARDRAIL_BLOCK_MESSAGE =
  "업무와 직접 관련되지 않은 요청으로, 사내 정책에 따라 응답할 수 없습니다."

const TOKEN_EXHAUSTED_MESSAGE =
  "월간 토큰 한도를 초과하여 AI 요청을 처리할 수 없습니다. 관리자에게 문의하세요."

type ProviderKind =
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "hermes"
  | "openrouter"

type ProviderPreference = "auto" | ProviderKind

function normalizeProviderPreference(value: unknown): ProviderPreference {
  const provider = typeof value === "string" ? value.trim().toLowerCase() : "auto"
  if (
    provider === "openai" ||
    provider === "anthropic" ||
    provider === "google" ||
    provider === "deepseek" ||
    provider === "hermes" ||
    provider === "openrouter"
  ) return provider
  return "auto"
}

type ResolvedModelResult =
  | { ok: true; modelId: string; model: LanguageModel; kind: ProviderKind }
  | { ok: false; error: string }

function missingKeyMessage(kind: ProviderKind): string {
  const envNames =
    kind === "google"
      ? "GEMINI_API_KEY 또는 GOOGLE_GENERATIVE_AI_API_KEY"
      : kind === "anthropic"
      ? "ANTHROPIC_API_KEY"
      : kind === "deepseek"
      ? "DEEPSEEK_API_KEY"
      : kind === "hermes"
      ? "HERMES_API_KEY 및 HERMES_API_BASE_URL"
      : "OPENAI_API_KEY"
  const label =
    kind === "google"
      ? "Google Gemini"
      : kind === "anthropic"
      ? "Anthropic Claude"
      : kind === "deepseek"
      ? "DeepSeek"
      : kind === "hermes"
      ? "Hermes"
      : "OpenAI"
  return (
    `${label} 모델을 사용하려면 Supabase Edge Secrets에 ${envNames} 를 설정하세요. ` +
    "다른 모델을 선택하거나 관리자에게 키 설정을 요청하세요."
  )
}

/** createLanguageModelForKind 실패 시 사용 가능한 다른 프로바이더로 폴백 */
function applyModelKeyFallback(
  resolved: ResolvedModelResult,
): ResolvedModelResult {
  if (resolved.ok) return resolved
  const fallback = getLowCostRoutingModel()
  if (!fallback.ok) return resolved
  console.warn(
    "[ai-chat] 요청 모델 API 키 없음 → 폴백:",
    fallback.modelId,
  )
  return fallback
}

/** 사용자 설정 마크다운 최대 문자(넘치면 자름 + 안내 접미사) */
const USER_PROFILE_MARKDOWN_CAP = 8000

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
const MAX_ATTACHMENTS = 6

type RichImage = {
  bytes: Uint8Array
  mimeType: string
  originalName: string
}

function readEnv(name: string): string | undefined {
  // 사내 종량제 API Key 접두사(CORP_*)가 존재하는 경우 우선적으로 적용
  const corpName = `CORP_${name}`;
  const corpVal = Deno.env.get(corpName);
  if (corpVal && corpVal.length > 0) return corpVal;

  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function parseDataUrlToRich(
  dataUrl: string,
  originalName: string,
): RichImage | null {
  const trimmed = dataUrl.trim()
  const m = /^data:(image\/[a-z0-9.+-]+|application\/pdf|text\/[a-z0-9.+-]+|application\/vnd\.openxmlformats-officedocument\.[a-z0-9.+-]+|application\/msword|application\/vnd\.ms-excel|application\/vnd\.ms-powerpoint);base64,([\s\S]+)$/i.exec(trimmed)
  if (!m) return null
  const mimeType = m[1].toLowerCase()
  const base64 = m[2].replace(/\s/g, "")
  if (!base64.length) return null
  const bytes = base64ToBytes(base64)
  if (bytes.length > MAX_ATTACHMENT_BYTES + 64 * 1024) return null
  return { bytes, mimeType, originalName }
}

function normalizeExperimentalAttachments(raw: unknown): RichImage[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  const out: RichImage[] = []
  for (const item of raw.slice(0, MAX_ATTACHMENTS)) {
    if (!item || typeof item !== "object") continue
    const url = (item as { url?: unknown }).url
    if (typeof url !== "string") continue
    const name = typeof (item as { name?: unknown }).name === "string"
      ? (item as { name: string }).name
      : "attachment.jpg"
    const parsed = parseDataUrlToRich(url, name)
    if (parsed) out.push(parsed)
  }
  return out
}

type ExperimentalLabPayload = {
  system_prompt: string
  system_prompt_mode: "append" | "replace"
  tool_debug: boolean
}

function normalizeExperimentalLab(
  raw: unknown,
): ExperimentalLabPayload | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const o = raw as Record<string, unknown>
  const sp = typeof o.system_prompt === "string" ? o.system_prompt.trim() : ""
  const tool_debug = o.tool_debug === true
  if (!sp.length && !tool_debug) return undefined
  const modeRaw = o.system_prompt_mode
  const system_prompt_mode = modeRaw === "replace" ? "replace" : "append"
  return { system_prompt: sp, system_prompt_mode, tool_debug }
}

function truncateCitationSnippet(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

function buildCitationSourcesFromSearchOutput(output: unknown): Array<{
  index: number
  title: string
  snippet?: string
  sourceType: "work_case"
  id?: string
}> {
  if (!output || typeof output !== "object") return []
  const payload = output as {
    ok?: boolean
    cases?: Array<{ id?: string; title?: string; content?: string }>
  }
  if (!payload.ok || !Array.isArray(payload.cases)) return []
  return payload.cases.map((row, i) => ({
    index: i + 1,
    title: String(row.title ?? `사내 사례 ${i + 1}`).trim(),
    snippet: row.content
      ? truncateCitationSnippet(String(row.content))
      : undefined,
    sourceType: "work_case" as const,
    id: typeof row.id === "string" ? row.id : undefined,
  }))
}

type ParseResult =
  | {
    ok: true
    trimmedPrompt: string
    preferredAiBody: string
    providerPreference: ProviderPreference
    richImages: RichImage[]
    jsonAttachmentAttemptCount: number
    /** JSON 요청에서만; multipart 는 미지정 */
    conversationId?: string
    billingUserIdHint?: string
    experimental_lab?: ExperimentalLabPayload
    composer_tool?: string
    /** 프론트 [인터넷 검색] 토글 */
    internet_search_enabled?: boolean
    company_knowledge_enabled?: boolean
    conversationMessages: ChatHistoryMessage[]
  }
  | { ok: false; status: number; message: string }

type ChatHistoryMessage = {
  role: "user" | "assistant"
  content: string
}

type OpenAiChatMessage = {
  role: "user" | "assistant"
  content: string
}

type AnthropicChatMessage = {
  role: "user" | "assistant"
  content: string
}

type GeminiContentPart = {
  text: string
}

type GeminiContent = {
  role: "user" | "model"
  parts: GeminiContentPart[]
}

function normalizeChatHistory(raw: unknown): ChatHistoryMessage[] {
  if (!Array.isArray(raw)) return []
  const out: ChatHistoryMessage[] = []
  for (const row of raw) {
    if (!row || typeof row !== "object") continue
    const role = (row as { role?: unknown }).role
    const content =
      typeof (row as { content?: unknown }).content === "string"
        ? (row as { content: string }).content.trim()
        : ""
    if (role !== "user" && role !== "assistant") continue
    if (!content.length) continue
    out.push({ role, content })
  }
  return out.slice(-24)
}

function parseMessagesField(raw: unknown): ChatHistoryMessage[] {
  if (Array.isArray(raw)) {
    return normalizeChatHistory(raw)
  }
  if (typeof raw === "string" && raw.trim().length > 0) {
    try {
      return normalizeChatHistory(JSON.parse(raw))
    } catch {
      return []
    }
  }
  return []
}

function resolveConversationMessages(input: {
  messages?: unknown
  chatHistory?: unknown
  prompt?: string
}): ChatHistoryMessage[] {
  const fromMessages = parseMessagesField(input.messages)
  if (fromMessages.length > 0) return fromMessages

  const history = normalizeChatHistory(input.chatHistory)
  const prompt = (input.prompt ?? "").trim()
  if (prompt.length > 0) {
    return [...history, { role: "user", content: prompt }]
  }
  return history
}

function extractLastUserMessageText(messages: ChatHistoryMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      return messages[i].content
    }
  }
  return ""
}

function mapToOpenAiMessages(
  messages: ChatHistoryMessage[],
): OpenAiChatMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }))
}

function mapToAnthropicMessages(
  messages: ChatHistoryMessage[],
): AnthropicChatMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }))
}

function mapToGeminiContents(messages: ChatHistoryMessage[]): GeminiContent[] {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }))
}

function mapMessagesForProvider(
  kind: ProviderKind,
  messages: ChatHistoryMessage[],
): OpenAiChatMessage[] | AnthropicChatMessage[] | GeminiContent[] {
  switch (kind) {
    case "openai":
    case "openrouter":
    case "deepseek":
    case "hermes":
      return mapToOpenAiMessages(messages)
    case "anthropic":
      return mapToAnthropicMessages(messages)
    case "google":
      return mapToGeminiContents(messages)
  }
}

/** AI SDK `streamText` 에 전달할 CoreMessage 형식(user/assistant) */
function providerMappedToAiSdkMessages(
  kind: ProviderKind,
  messages: ChatHistoryMessage[],
): ChatHistoryMessage[] {
  if (kind === "google") {
    return mapToGeminiContents(messages).map((row) => ({
      role: row.role === "model" ? "assistant" as const : "user" as const,
      content: row.parts.map((part) => part.text).join(""),
    }))
  }
  return messages
}

function parseInternetSearchEnabled(raw: unknown): boolean {
  if (raw === true || raw === "true" || raw === "1" || raw === 1) return true
  return false
}

function resolveActiveModelFromBody(body: {
  activeModel?: unknown
  preferredAi?: unknown
  model?: unknown
}): string {
  if (typeof body.activeModel === "string" && body.activeModel.trim().length > 0) {
    return body.activeModel.trim()
  }
  if (typeof body.preferredAi === "string" && body.preferredAi.trim().length > 0) {
    return body.preferredAi.trim()
  }
  if (typeof body.model === "string" && body.model.trim().length > 0) {
    return body.model.trim()
  }
  return ""
}

const CANVAS_TOOL_OVERLAY = `

## Canvas 모드 (도구)
사용자는 인터랙티브 HTML 미리보기 패널을 요청했습니다.
- 응답에 반드시 **하나**의 \`\`\`html ... \`\`\` 코드 블록을 포함하세요.
- self-contained HTML 문서(DOCTYPE, style/script 포함)로 작성하세요.
- 업무용 대시보드·표·폼·카드 UI 등 실무에 쓸 수 있는 수준으로 작성합니다.
- 코드 블록 앞뒤로 짧은 한국어 설명만 덧붙이세요.`

async function parseAiChatRequest(req: Request): Promise<ParseResult> {
  const ct = req.headers.get("content-type") ?? ""

  if (ct.includes("multipart/form-data")) {
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return {
        ok: false,
        status: 400,
        message: "multipart/form-data 본문을 읽을 수 없습니다.",
      }
    }

    const trimmedPrompt = String(form.get("prompt") ?? "").trim()
    const preferredAiBody = resolveActiveModelFromBody({
      activeModel: form.get("activeModel"),
      preferredAi: form.get("preferredAi"),
      model: form.get("model"),
    })
    const conversationMessages = resolveConversationMessages({
      messages: form.get("messages"),
      prompt: trimmedPrompt,
    })
    const internet_search_enabled = parseInternetSearchEnabled(
      form.get("internet_search_enabled"),
    )
    const company_knowledge_enabled = form.has("company_knowledge_enabled")
      ? form.get("company_knowledge_enabled") === "true"
      : undefined
    const richImages: RichImage[] = []
    const entries = form.getAll("images")

    for (const entry of entries.slice(0, MAX_ATTACHMENTS)) {
      if (!(entry instanceof Blob)) continue
      const mimeType = entry.type || ""
      if (!mimeType.startsWith("image/")) continue
      if (entry.size > MAX_ATTACHMENT_BYTES) {
        return {
          ok: false,
          status: 400,
          message:
            `각 이미지는 최대 ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB 까지 허용됩니다.`,
        }
      }
      const buf = new Uint8Array(await entry.arrayBuffer())
      const originalName = entry instanceof File && typeof entry.name === "string"
        ? entry.name
        : "image.jpg"
      richImages.push({
        bytes: buf,
        mimeType: mimeType || "image/jpeg",
        originalName,
      })
    }

    return {
      ok: true,
      trimmedPrompt: extractLastUserMessageText(conversationMessages),
      preferredAiBody,
      providerPreference: normalizeProviderPreference(form.get("providerPreference")),
      richImages,
      jsonAttachmentAttemptCount: 0,
      conversationId: undefined,
      billingUserIdHint: form.get("billingUserId") || undefined,
      internet_search_enabled,
      company_knowledge_enabled,
      experimental_lab: normalizeExperimentalLab(form.get("experimental_lab")),
      conversationMessages,
    }
  }

  let body: {
    prompt?: string
    preferredAi?: string
    /** preferredAi 별칭(클라이언트 model 필드) */
    model?: string
    /** 클라이언트 선택 모델 */
    activeModel?: string
    /** 멀티턴 대화 전체 */
    messages?: unknown
    /** 압축 Vision 이미지 (순수 Base64) */
    imageBase64?: string
    mimeType?: string
    experimental_attachments?: unknown
    /** 공유 채팅 검증용(있으면 JWT 사용자가 해당 대화 참가자여야 함) */
    conversationId?: string
    /** 클라이언트 디버깅용 — JWT subject 와 불일치 시 거부 */
    billingUserId?: string
    experimental_lab?: unknown
    composer_tool?: string
    chat_history?: unknown
    /** 프론트 [인터넷 검색] 토글 */
    internet_search_enabled?: unknown
    company_knowledge_enabled?: boolean
    providerPreference?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      status: 400,
      message: "JSON 본문이 필요합니다. 이미지 첨부는 multipart/form-data 로 보내 주세요.",
    }
  }

  const trimmedPrompt = (body.prompt ?? "").trim()
  const preferredAiBody = resolveActiveModelFromBody(body)
  const conversationMessages = resolveConversationMessages({
    messages: body.messages,
    chatHistory: body.chat_history,
    prompt: trimmedPrompt,
  })
  const lastUserText = extractLastUserMessageText(conversationMessages)
  const conversationId =
    typeof body.conversationId === "string" && body.conversationId.trim().length > 0
      ? body.conversationId.trim()
      : undefined
  const billingUserIdHint =
    typeof body.billingUserId === "string" && body.billingUserId.trim().length > 0
      ? body.billingUserId.trim()
      : undefined
  const rawAtt = body.experimental_attachments
  const jsonAttachmentAttemptCount =
    (Array.isArray(rawAtt) ? rawAtt.length : 0) +
    (typeof body.imageBase64 === "string" && body.imageBase64.trim().length > 0
      ? 1
      : 0)
  const richImages = normalizeExperimentalAttachments(rawAtt)

  const rawB64 = typeof body.imageBase64 === "string"
    ? body.imageBase64.trim()
    : ""
  if (rawB64.length > 0 && richImages.length < MAX_ATTACHMENTS) {
    const mimeType =
      typeof body.mimeType === "string" && body.mimeType.startsWith("image/")
        ? body.mimeType.toLowerCase()
        : "image/jpeg"
    try {
      const bytes = base64ToBytes(rawB64.replace(/\s/g, ""))
      if (bytes.length > 0 && bytes.length <= MAX_ATTACHMENT_BYTES + 64 * 1024) {
        richImages.push({
          bytes,
          mimeType,
          originalName: "attachment.jpg",
        })
      }
    } catch {
      /* invalid base64 — richImages unchanged */
    }
  }
  const composerRaw = typeof body.composer_tool === "string"
    ? body.composer_tool.trim().toLowerCase()
    : ""
  const composer_tool = composerRaw === "canvas" ? "canvas" : undefined
  const internet_search_enabled = parseInternetSearchEnabled(
    body.internet_search_enabled,
  )
  const company_knowledge_enabled = typeof body.company_knowledge_enabled === "boolean"
    ? body.company_knowledge_enabled
    : undefined

  return {
    ok: true,
    trimmedPrompt: lastUserText || trimmedPrompt,
    preferredAiBody,
    providerPreference: normalizeProviderPreference(body.providerPreference),
    richImages,
    jsonAttachmentAttemptCount,
    conversationId,
    billingUserIdHint,
    experimental_lab: normalizeExperimentalLab(body.experimental_lab),
    composer_tool,
    internet_search_enabled,
    company_knowledge_enabled,
    conversationMessages,
  }
}

function readGeminiApiKey(): string | undefined {
  return readEnv("GEMINI_API_KEY") ?? readEnv("GOOGLE_GENERATIVE_AI_API_KEY")
}

function envKeyForProvider(kind: ProviderKind): string | undefined {
  switch (kind) {
    case "google":
      return readGeminiApiKey()
    case "anthropic":
      return readEnv("ANTHROPIC_API_KEY")
    case "openai":
      return readEnv("OPENAI_API_KEY")
    case "openrouter":
      return readEnv("OPENROUTER_API_KEY")
    case "deepseek":
      return readEnv("DEEPSEEK_API_KEY")
    case "hermes":
      return readEnv("HERMES_API_KEY")
  }
}

/** 요청 모델 kind 에 해당하는 Provider 만 블록 안에서 지연 초기화 */
function createLanguageModelForKind(
  kind: ProviderKind,
  modelId: string,
): ResolvedModelResult {
  switch (kind) {
    case "google": {
      const apiKey = readGeminiApiKey()
      if (!apiKey || apiKey.length === 0) {
        return { ok: false, error: missingKeyMessage("google") }
      }
      const google = createGoogleGenerativeAI({ apiKey })
      return { ok: true, kind, modelId, model: google(modelId) }
    }
    case "anthropic": {
      const apiKey = envKeyForProvider("anthropic")
      if (!apiKey) {
        return { ok: false, error: missingKeyMessage("anthropic") }
      }
      const provider = createAnthropic({ apiKey })
      return { ok: true, kind, modelId, model: provider(modelId) }
    }
    case "openai": {
      const apiKey = envKeyForProvider("openai")
      if (!apiKey) {
        return { ok: false, error: missingKeyMessage("openai") }
      }
      const provider = createOpenAI({ apiKey })
      return { ok: true, kind, modelId, model: provider(modelId) }
    }
    case "openrouter": {
      const apiKey = envKeyForProvider("openrouter")
      if (!apiKey) {
        return { ok: false, error: "OpenRouter API Key 가 없습니다." }
      }
      const provider = createOpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1"
      })
      return { ok: true, kind, modelId, model: provider(modelId) }
    }
    case "deepseek": {
      const apiKey = envKeyForProvider("deepseek")
      if (!apiKey) return { ok: false, error: missingKeyMessage("deepseek") }
      const provider = createOpenAI({
        apiKey,
        baseURL: readEnv("DEEPSEEK_API_BASE_URL") ?? "https://api.deepseek.com",
      })
      return { ok: true, kind, modelId, model: provider(modelId) }
    }
    case "hermes": {
      const apiKey = envKeyForProvider("hermes")
      const baseURL = readEnv("HERMES_API_BASE_URL")
      if (!apiKey || !baseURL) {
        return { ok: false, error: missingKeyMessage("hermes") }
      }
      const resolvedModelId = modelId === "hermes-default"
        ? readEnv("HERMES_MODEL_ID") ?? modelId
        : modelId
      const provider = createOpenAI({ apiKey, baseURL })
      return { ok: true, kind, modelId: resolvedModelId, model: provider(resolvedModelId) }
    }
  }
}

function resolveGuardrailProviderKind(): ProviderKind | null {
  const configured = (readEnv("NH_AI_GUARDRAIL_PROVIDER") ?? "").toLowerCase()
  if (configured === "google" && envKeyForProvider("google")) return "google"
  if (configured === "openai" && envKeyForProvider("openai")) return "openai"
  if (configured === "anthropic" && envKeyForProvider("anthropic")) {
    return "anthropic"
  }
  if (envKeyForProvider("google")) return "google"
  if (envKeyForProvider("openai")) return "openai"
  if (envKeyForProvider("anthropic")) return "anthropic"
  return null
}

function resolvePreferredLanguageModel(preferredAi: string): ResolvedModelResult {
  const model = preferredAi.trim()
  console.log("요청된 모델명:", model)

  if (model.toLowerCase().includes("gemini")) {
    const { modelId } = normalizePreferredAiToResolvedModel(model)
    return createLanguageModelForKind("google", modelId)
  }

  const { kind, modelId } = normalizePreferredAiToResolvedModel(preferredAi)
  return createLanguageModelForKind(kind, modelId)
}

async function resolveLanguageModelFromRequest(
  adminClient: ReturnType<typeof createClient>,
  requestedModel: string,
  options: { isExplicitManual: boolean; lowCostMode: boolean },
): Promise<ResolvedModelResult> {
  if (options.lowCostMode) {
    return getLowCostRoutingModel()
  }

  const trimmed = requestedModel.trim()
  if (options.isExplicitManual && trimmed.length > 0) {
    const registry = await loadAiModelRegistry(adminClient)
    const entry = registry.get(trimmed.toLowerCase())
    if (entry && !entry.is_active) {
      return {
        ok: false,
        error:
          `요청한 AI 모델(${entry.api_id})은 현재 비활성화되어 있습니다. 관리자에게 문의하거나 다른 모델을 선택하세요.`,
      }
    }
    if (entry && entry.model_type === "image") {
      return {
        ok: false,
        error:
          `요청한 모델(${entry.api_id})은 이미지 생성 전용입니다. 텍스트 채팅용 모델을 선택하세요.`,
      }
    }
  }

  const routed = await resolveRequestedChatModel(adminClient, trimmed)
  const resolved = createLanguageModelForKind(routed.kind, routed.modelId)
  if (resolved.ok) {
    console.log(
      "[ai-chat] model route:",
      trimmed,
      "→",
      resolved.modelId,
      routed.fromRegistry ? "(registry)" : "(heuristic)",
    )
  }
  return resolved
}

/** 이미지 Vision 요청 시 비용 절감용 Gemini Flash 모델 id */
const VISION_DEFAULT_MODEL_ID = "gemini-2.5-flash"
const VISION_FALLBACK_MODEL_ID = "gemini-1.5-flash"

function pickVisionModelId(): string {
  if (!envKeyForProvider("google")) return VISION_DEFAULT_MODEL_ID
  const preferred = createLanguageModelForKind("google", VISION_DEFAULT_MODEL_ID)
  if (preferred.ok) return VISION_DEFAULT_MODEL_ID
  return VISION_FALLBACK_MODEL_ID
}

/** 이미지가 있으면 Vision 가능·저비용 Gemini Flash 로 고정(수동 Pro 선택 시에도) */
function applyVisionModelOverride(
  modelLabel: string,
  hasImages: boolean,
): string {
  if (!hasImages) return modelLabel
  if (!envKeyForProvider("google")) return modelLabel
  const { kind, modelId } = normalizePreferredAiToResolvedModel(modelLabel)
  if (kind === "google" && modelId.includes("flash")) return modelId
  return pickVisionModelId()
}

function getLowCostRoutingModel(): ResolvedModelResult {
  if (envKeyForProvider("google")) {
    return createLanguageModelForKind("google", "gemini-2.5-flash-lite")
  }
  if (envKeyForProvider("openai")) {
    return createLanguageModelForKind("openai", "gpt-4o-mini")
  }
  return {
    ok: false,
    error:
      "AI API 키가 하나도 설정되지 않았습니다. Supabase Secrets에 GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY 중 하나 이상을 설정하세요.",
  }
}

/** LLM 기반 Reranker 헬퍼 함수 생성 */
function createLlmReranker(deps: {
  model: LanguageModel
}): (query: string, cases: any[]) => Promise<any[]> {
  return async (query: string, cases: any[]): Promise<any[]> => {
    if (cases.length <= 1) return cases

    const casesPrompt = cases
      .map((c, i) => `[사례 ID: ${i}]\n제목: ${c.title}\n내용: ${c.content}`)
      .join("\n\n")

    const prompt = `사용자의 질문과 가장 관련성이 높고 유용한 정보를 포함하고 있는 사례들의 순위를 정해주십시오.
반드시 아래의 사례 ID 목록을 가장 관련성이 높은 순서대로 콤마(,)로 구분된 배열 형태로만 반환해주십시오. (예: 2, 0, 1)
다른 텍스트나 설명은 절대 추가하지 마십시오.

사용자 질문: "${query}"

검색된 사례 목록:
${casesPrompt}

가장 유용한 사례 ID 목록 (관련성이 높은 순서대로 정렬):`

    try {
      const { text } = await generateText({
        model: deps.model,
        prompt: prompt,
        temperature: 0,
        maxTokens: 50,
      })

      const matchedIdxs = text
        .replace(/[\[\]]/g, "")
        .split(",")
        .map((x) => parseInt(x.trim(), 10))
        .filter((x) => !isNaN(x) && x >= 0 && x < cases.length)

      if (matchedIdxs.length === 0) {
        return cases
      }

      const reranked: any[] = []
      const added = new Set<number>()

      for (const idx of matchedIdxs) {
        if (!added.has(idx)) {
          reranked.push(cases[idx])
          added.add(idx)
        }
      }

      for (let i = 0; i < cases.length; i++) {
        if (!added.has(i)) {
          reranked.push(cases[i])
        }
      }

      return reranked
    } catch (err) {
      console.error(
        "[llm-reranker] Reranking failed, returning original cases:",
        err,
      )
      return cases
    }
  }
}

function isGuardrailLlmEnabled(): boolean {
  const mode = (readEnv("NH_AI_GUARDRAIL_MODE") ?? "llm").trim().toLowerCase()
  if (mode === "off" || mode === "false" || mode === "0") return false
  if (mode === "keyword" || mode === "keyword_only") return false
  return true
}

async function evaluatePromptGuardrail(prompt: string): Promise<"PASS" | "BLOCK"> {
  const trimmed = prompt.trim()
  if (!trimmed.length) return "BLOCK"
  if (quickKeywordGuardrail(trimmed) === "BLOCK") return "BLOCK"

  if (!isGuardrailLlmEnabled()) {
    return "PASS"
  }

  const guardrailKind = resolveGuardrailProviderKind()
  if (!guardrailKind) {
    return "PASS"
  }

  const guardrailModelId = guardrailKind === "google"
    ? "gemini-2.5-flash"
    : guardrailKind === "anthropic"
    ? "claude-3-5-haiku"
    : "gpt-4o-mini"

  const guardrailModel = createLanguageModelForKind(
    guardrailKind,
    guardrailModelId,
  )
  if (!guardrailModel.ok) {
    return "PASS"
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)

  try {
    const { text } = await generateText({
      model: guardrailModel.model,
      system: GUARDRAIL_SYSTEM_PROMPT,
      prompt: trimmed,
      temperature: 0,
      maxOutputTokens: 16,
      abortSignal: controller.signal,
    })
    const parsed = parseGuardrailVerdict(text)
    if (!parsed) {
      console.warn(
        "[ai-chat] 가드레일 LLM 응답 파싱 실패 → PASS 폴백:",
        text.slice(0, 120),
      )
      return "PASS"
    }
    return parsed
  } catch (err) {
    console.warn("[ai-chat] 가드레일 LLM 호출 실패 → PASS 폴백", err)
    return "PASS"
  } finally {
    clearTimeout(timeoutId)
  }
}

function isOrgDriveConfigured(): boolean {
  const root = readEnv("GDRIVE_ROOT_FOLDER_ID")
  const clientId =
    readEnv("GOOGLE_OAUTH_CLIENT_ID") ?? readEnv("GDRIVE_CLIENT_ID")
  const clientSecret =
    readEnv("GOOGLE_OAUTH_CLIENT_SECRET") ?? readEnv("GDRIVE_CLIENT_SECRET")
  const refreshToken =
    readEnv("GOOGLE_OAUTH_REFRESH_TOKEN") ?? readEnv("GDRIVE_REFRESH_TOKEN")
  return !!(root && clientId && clientSecret && refreshToken)
}

type AuthedSupabase = ReturnType<typeof createClient>

async function ensureSharedChatAccessAllowed(params: {
  supabaseUser: AuthedSupabase
  userId: string
  conversationId?: string
  billingUserIdHint?: string
}): Promise<
  { ok: true } | { ok: false; status: number; message: string }
> {
  if (
    params.billingUserIdHint &&
    params.billingUserIdHint !== params.userId
  ) {
    return {
      ok: false,
      status: 403,
      message:
        "billingUserId 가 현재 세션과 일치하지 않습니다. 클라이언트를 새로 고치고 다시 시도하세요.",
    }
  }
  const cid = params.conversationId?.trim()
  if (!cid) return { ok: true }

  const { data, error } = await params.supabaseUser
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", cid)
    .eq("user_id", params.userId)
    .maybeSingle()

  if (error) {
    console.error("[ai-chat] 공유 대화 참가 검증 실패", error)
    return {
      ok: false,
      status: 403,
      message: "공유 대화 접근을 검증할 수 없습니다.",
    }
  }
  if (!data) {
    return {
      ok: false,
      status: 403,
      message:
        "이 공유 대화의 참가자만 AI 응답을 요청할 수 있습니다. 초대를 받은 뒤 다시 시도하세요.",
    }
  }
  return { ok: true }
}

async function loadUserProfileContextForPrompt(
  supabaseUser: AuthedSupabase,
  userId: string,
): Promise<{ text: string; wasTruncated: boolean }> {
  // 1. 수동 입력 마크다운 불러오기
  const { data: profileData } = await supabaseUser
    .from("user_ai_profile_context")
    .select("context_markdown")
    .eq("user_id", userId)
    .maybeSingle()

  // 2. 자동 수집된 헤르메스 장기 기억 불러오기
  const { data: memoryData } = await supabaseUser
    .from("user_long_term_memory")
    .select("memory_type, content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30)

  let raw = String(profileData?.context_markdown ?? "").trim()

  if (memoryData && memoryData.length > 0) {
    raw += "\n\n### AI 자동 수집 기억 (헤르메스)\n"
    for (const m of memoryData) {
      raw += `- [${m.memory_type}] ${m.content}\n`
    }
  }

  if (!raw.length) return { text: "", wasTruncated: false }

  if (raw.length <= USER_PROFILE_MARKDOWN_CAP) {
    return { text: raw, wasTruncated: false }
  }
  return {
    text: raw.slice(0, USER_PROFILE_MARKDOWN_CAP),
    wasTruncated: true,
  }
}

function buildEffectiveSystemPrompt(ctx: {
  text: string
  wasTruncated: boolean
}): string {
  const base = buildNhPortalSystemInstruction()
  if (!ctx.text.length) return base

  const notice = ctx.wasTruncated
    ? "\n\n[시스템 안내: 사용자가 저장한 프로필/기억 텍스트가 길이 한도로 잘렸습니다.]"
    : ""

  return `${base}

## 사용자 프로필/스타일/기억
다음 블록은 포털 **설정**에 저장된 사용자 제공 맥락(마크다운)입니다. 용어 선호·업무 관습만 반영하고, 민감 개인정보는 답변에 노출하지 마세요.

${ctx.text}${notice}`
}

async function loadUserGoogleRefreshToken(
  userId: string,
): Promise<string | undefined> {
  const secret = readEnv("INTEGRATION_CREDENTIALS_SECRET")
  const svcKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")
  const url = readEnv("SUPABASE_URL")
  if (!secret || !svcKey || !url) return undefined

  const admin = createClient(url, svcKey)
  const { data } = await admin
    .from("user_integration_credentials")
    .select("iv, ciphertext")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle()

  if (!data?.iv || !data?.ciphertext) return undefined
  try {
    return await decryptCredential(data.iv, data.ciphertext, secret)
  } catch (err) {
    console.error("[ai-chat] 사용자 Drive 자격 복호화 실패", err)
    return undefined
  }
}

async function handleRequest(req: Request) {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405)
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return jsonResponse({ error: "인증 헤더가 없습니다." }, 401)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser()
  if (userError || !user) {
    return jsonResponse({ error: "유효하지 않은 세션입니다." }, 401)
  }


  const reqContentType = req.headers.get("content-type") ?? ""
  if (reqContentType.includes("application/json")) {
    const peek = await req.clone().json().catch(() => null) as
      | Record<string, unknown>
      | null
    if (peek && peek.actionType === "image") {
      return handleMediaGeneration(req)
    }
    if (peek && peek.actionType === "video") {
      const body = await req.json()
      const mediaResult = await handleMediaRouterRequest({
        activeModel: typeof body.activeModel === "string"
          ? body.activeModel
          : "",
        actionType: "video",
        prompt: typeof body.prompt === "string" ? body.prompt : "",
        model_id: typeof body.model_id === "string" ? body.model_id : undefined,
      })
      if (!mediaResult.ok) {
        return jsonResponse({ ok: false, error: mediaResult.error }, mediaResult.status)
      }
      return jsonResponse({
        ok: true,
        markdown: mediaResult.data.markdown,
        provider: mediaResult.data.provider,
        model: mediaResult.data.model,
        routedVia: mediaResult.data.routedVia,
      })
    }
  }

  const parsed = await parseAiChatRequest(req)
  if (!parsed.ok) {
    return jsonResponse({ error: parsed.message }, parsed.status)
  }

  const {
    trimmedPrompt,
    preferredAiBody,
    providerPreference,
    richImages,
    jsonAttachmentAttemptCount,
    conversationId,
    billingUserIdHint,
    internet_search_enabled,
    company_knowledge_enabled,
    conversationMessages,
  } = parsed

  if (!trimmedPrompt.length && richImages.length === 0 && conversationMessages.length === 0) {
    return jsonResponse(
      { error: "메시지 텍스트 또는 이미지 첨부가 필요합니다." },
      400,
    )
  }

  if (
    trimmedPrompt.length === 0 &&
    jsonAttachmentAttemptCount > 0 &&
    richImages.length === 0
  ) {
    return jsonResponse(
      {
        error:
          "이미지 데이터를 해석하지 못했습니다. multipart 로 파일을 보내거나 data:image Base64(Data URL) 형식을 사용해 주세요.",
      },
      400,
    )
  }

  // [Phase 1] DLP(데이터 유출 방지) 검사
  const { checkDlpViolation } = await import("../_shared/dlp-filter.ts");

  // 현재 프롬프트 및 대화 내역(conversationMessages) 전체에 대해 DLP 검사
  const fullContextToCheck = trimmedPrompt + "\n" + conversationMessages.map(m => m.content).join("\n");
  const dlpResult = checkDlpViolation(fullContextToCheck);

  if (dlpResult.isViolated) {
    return jsonResponse(
      { error: `보안 규정 위반: ${dlpResult.reason} (데이터가 외부 모델로 전송되지 않았습니다.)` },
      403
    );
  }

  const gate = await ensureSharedChatAccessAllowed({
    supabaseUser,
    userId: user.id,
    conversationId,
    billingUserIdHint,
  })
  if (!gate.ok) {
    return jsonResponse({ error: gate.message }, gate.status)
  }

  const [{ data: profile, error: profileError }, profileCtx] = await Promise
    .all([
      supabaseUser
        .from("users")
        .select(
          "preferred_ai, token_limit, current_token_usage, is_admin, role, department",
        )
        .eq("id", user.id)
        .maybeSingle(),
      loadUserProfileContextForPrompt(supabaseUser, user.id),
    ])

  const systemPrompt = buildEffectiveSystemPrompt(profileCtx)

  if (profileError || !profile) {
    return jsonResponse({ error: "직원 프로필을 찾을 수 없습니다." }, 403)
  }

  const profileAdminFields = profile as {
    is_admin?: boolean | null
    role?: string | null
  }
  const isAdminUser =
    Boolean(profileAdminFields.is_admin) ||
    (typeof profileAdminFields.role === "string" &&
      profileAdminFields.role.trim().toLowerCase() === "admin")

  let textStreamSystemPrompt = systemPrompt
  const labPayload = parsed.experimental_lab
  if (labPayload && richImages.length === 0) {
    const labText = labPayload.system_prompt?.trim() ?? ""
    if (labText.length > 0) {
      if (labPayload.system_prompt_mode === "replace") {
        textStreamSystemPrompt =
          `[AI 실험실 · 관리자 전용]\n운영 시스템 프롬프트 대체 모드입니다.\n\n${labText}`
      } else {
        textStreamSystemPrompt =
          `${systemPrompt}\n\n## 실험실 오버레이\n${labText}`
      }
    }
  }

  if (parsed.composer_tool === "canvas" && richImages.length === 0) {
    textStreamSystemPrompt = `${textStreamSystemPrompt}${CANVAS_TOOL_OVERLAY}`
  }

  const tokenLimit = Number(profile.token_limit ?? 0)
  const currentTokenUsage = Number(profile.current_token_usage ?? 0)
  /** 요청 바디 preferredAi 가 있으면 프로필보다 우선(드롭다운 즉시 선택 반영) */
  const preferredAiFromRequest = preferredAiBody.trim()
  const preferredAiFromProfile =
    typeof profile.preferred_ai === "string"
      ? profile.preferred_ai.trim()
      : ""
  const preferredAiChosen = preferredAiFromRequest.length > 0
    ? preferredAiFromRequest
    : preferredAiFromProfile

  if (preferredAiChosen === 'dall-e-3') {
    const openAiKey = Deno.env.get("OPENAI_API_KEY")
    if (!openAiKey) {
      return jsonResponse({ error: "OPENAI_API_KEY가 설정되지 않았습니다." }, 500)
    }
    const finalUserPrompt = trimmedPrompt || "아름다운 풍경"

    // Create a stream that will emit the image URL once the API returns
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        try {
          const res = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openAiKey}`,
            },
            body: JSON.stringify({
              model: "dall-e-3",
              prompt: finalUserPrompt,
              n: 1,
              size: "1024x1024",
            }),
          })
          const json = await res.json()
          if (!res.ok) {
            throw new Error(json.error?.message || "이미지 생성 실패")
          }
          const imageUrl = json.data?.[0]?.url
          if (imageUrl) {
            // Send standard Vercel AI SDK stream format for text chunk
            const md = `![생성된 이미지](${imageUrl})`;
            controller.enqueue(encoder.encode(`0:${JSON.stringify(md)}\n`))
          } else {
            throw new Error("이미지 URL을 받지 못했습니다.")
          }
        } catch (err: any) {
          const errMsg = `이미지 생성 중 오류가 발생했습니다: ${err.message}`;
          controller.enqueue(encoder.encode(`0:${JSON.stringify(errMsg)}\n`))
        } finally {
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "x-vercel-ai-data-stream": "v1"
      }
    })
  }

  const svcKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")
  if (!svcKey) {
    return jsonResponse({ error: "server_config" }, 500)
  }
  const adminClient = createClient(supabaseUrl, svcKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const smartRouter = new NHSmartRoutingController(adminClient)
  const hasVisionImages = richImages.length > 0

  const routingPrompt =
    trimmedPrompt.length > 0
      ? trimmedPrompt
      : `업무 관련 현장·시설 이미지 ${richImages.length}장에 대한 시각 분석 요청입니다.`

  let nhRouteResult = null
  let finalPrompt = trimmedPrompt
  let preferredAiForModel = ""

  if (preferredAiChosen.trim().toLowerCase() === "auto") {
    // NH Smart Router 연동
    const routeRes = await smartRouter.determineRoute(
      routingPrompt,
      hasVisionImages,
      profile.department,
      providerPreference,
    )
    nhRouteResult = routeRes
    preferredAiForModel = routeRes.modelId
    console.log("[NH-Smart-Router] 자동 모델 결정:", routeRes.modelId, `(태스크: ${routeRes.taskType})`)

    // 외부 API 교차 검증 및 사전 데이터 수집 파이프라인 가동
    const preflightRes = await smartRouter.executePreflightVerification(routeRes, {
      prompt: trimmedPrompt,
      imageBase64: richImages.length > 0 ? bytesToBase64(richImages[0].bytes) : undefined
    })
    finalPrompt = preflightRes.verifiedPrompt
    console.log("[NH-Smart-Router] 사전 전처리/교차검증 레이어 실행 완료.")
  } else {
    preferredAiForModel = preferredAiChosen
  }

  preferredAiForModel = applyVisionModelOverride(
    preferredAiForModel,
    hasVisionImages,
  )

  const isExplicitManualModel =
    preferredAiChosen.trim().length > 0 &&
    preferredAiChosen.trim().toLowerCase() !== "auto"

  const model = preferredAiForModel
  console.log("요청된 모델명:", model)

  let resolvedLanguageModel: LanguageModel
  let modelIdUsed: string
  let providerKindUsed: ProviderKind
  {
    const lowCostMode =
      !isExplicitManualModel &&
      tokenLimit > 0 &&
      tokenLimit - currentTokenUsage < tokenLimit * 0.1

    let resolved = await resolveLanguageModelFromRequest(adminClient, model, {
      isExplicitManual: isExplicitManualModel,
      lowCostMode,
    })
    if (!resolved.ok && !isExplicitManualModel) {
      resolved = applyModelKeyFallback(resolved)
    }
    if (!resolved.ok) {
      return jsonResponse({ error: resolved.error }, 400)
    }
    resolvedLanguageModel = resolved.model
    modelIdUsed = resolved.modelId
    providerKindUsed = resolved.kind
    console.log(
      "[ai-chat] 모델 선택:",
      preferredAiChosen,
      "→ 호출:",
      modelIdUsed,
      isExplicitManualModel ? "(수동 고정)" : "(자동/토큰절약)",
    )
  }

  const providerKind: ProviderKind = providerKindUsed

  const providerMappedMessages = mapMessagesForProvider(
    providerKind,
    conversationMessages,
  )
  const aiSdkConversationMessages = providerMappedToAiSdkMessages(
    providerKind,
    conversationMessages,
  )

  if (nhRouteResult && aiSdkConversationMessages.length > 0) {
    const lastMsg = aiSdkConversationMessages[aiSdkConversationMessages.length - 1]
    if (lastMsg.role === "user" && typeof lastMsg.content === "string") {
      lastMsg.content = finalPrompt
    }
  }
  console.log(
    "[ai-chat] multi-turn:",
    conversationMessages.length,
    "messages →",
    providerKind,
    "payload",
    providerMappedMessages.length,
    "turns",
  )

  const guardrailPrompt =
    trimmedPrompt.length > 0
      ? trimmedPrompt
      : `업무 관련 현장·시설 이미지 ${richImages.length}장에 대한 시각 분석 요청입니다.`

  const verdict = await evaluatePromptGuardrail(guardrailPrompt)
  if (verdict === "BLOCK") {
    return jsonResponse({ error: GUARDRAIL_BLOCK_MESSAGE }, 422)
  }

  if (tokenLimit > 0) {
    const remaining = tokenLimit - currentTokenUsage
    if (remaining <= 0) {
      return jsonResponse({ error: TOKEN_EXHAUSTED_MESSAGE }, 429)
    }
  }

  const profileDeptFields = profile as { department?: string | null }
  const budgetGate = await assertDepartmentBudgetAllowed({
    adminClient,
    department: profileDeptFields.department ?? null,
    estimatedCostUsd: readBudgetEstimatedCallUsd(),
    isAdmin: isAdminUser,
  })
  if (!budgetGate.ok) {
    return jsonResponse({ error: budgetGate.message }, 402)
  }

  if (richImages.length > 0) {
    try {
      // Upload images directly to Google Cloud Storage (GCS)
      await uploadChatImagesToGCS({
        userEmail: user.email ?? user.id,
        images: richImages,
      })
    } catch (e: any) {
      console.error("[ai-chat] uploadChatImagesToGCS 실패", e.message)
      return jsonResponse(
        {
          error: `이미지 저장에 실패했습니다: ${e.message}`,
        },
        502,
      )
    }
  }

  try {
    const userFacingText =
      finalPrompt.length > 0
        ? finalPrompt
        : "첨부된 이미지를 분석하고, 현장 안전·품질 관점에서 확인할 점과 조치 제안을 정리해 주세요."

    const visionHistoryMessages = aiSdkConversationMessages.slice(0, -1)
    const visionLatestUserText =
      extractLastUserMessageText(aiSdkConversationMessages) || userFacingText

    const svcKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")
    const openaiEmbedKey = readEnv("OPENAI_API_KEY")
    const adminSvc = svcKey ? createClient(supabaseUrl, svcKey) : null

    const pluginTools = adminSvc
      ? await createDynamicPluginTools({
        admin: adminSvc,
        userId: user.id,
        department: profile.department,
      })
      : {}

    const userJwt = authHeader.replace(/^Bearer\s+/i, "")
    const googleRefresh = await loadUserGoogleRefreshToken(user.id)
    const googleTools = googleRefresh
      ? createGoogleWorkspaceAgentTools({
        supabaseUrl,
        anonKey: supabaseAnonKey,
        userJwt,
      })
      : {}

    const exaApiKey = readEnv("EXA_API_KEY")
    const needsWebSearch = richImages.length === 0 &&
      resolveWebSearchNeeded({
        query: trimmedPrompt,
        internetSearchEnabled: internet_search_enabled,
      })

    const includeExaSearchTool =
      Boolean(exaApiKey) &&
      providerKind !== "google" &&
      !needsWebSearch

    const skipCompanyRagForPrompt =
      labPayload?.system_prompt_mode === "replace"
    const isCompanyKnowledgeUserEnabled = parsed.company_knowledge_enabled !== false
    const geminiKeyForRag = readGeminiApiKey()

    // ── MCP 코어 도구 레지스트리 (Exa · RAG · 징검다리) ─────────────────────
    const mcpToolFlags: McpToolEnableFlags = {
      webSearch: includeExaSearchTool,
      companyRag: isCompanyKnowledgeUserEnabled && !skipCompanyRagForPrompt && Boolean(adminSvc && geminiKeyForRag),
      workCaseKnowledge: isCompanyKnowledgeUserEnabled && Boolean(adminSvc && openaiEmbedKey),
      googleSpreadsheetRead: Boolean(readEnv("GOOGLE_SERVICE_ACCOUNT_KEY")),
      univerOffice: true,
      databaseQuery: Boolean(adminSvc),
      googleDriveSearch: Boolean(
        readEnv("GOOGLE_OAUTH_CLIENT_ID") ?? readEnv("GDRIVE_CLIENT_ID")
      ),
      readMyEmail: true,
      readWebPage: true,
      // Assistant demo executors must never be exposed on the production chat path.
      allMcpMocks: false,
    }

    const mcpToolCtx: McpToolExecutionContext = {
      exaApiKey,
      admin: adminSvc ?? adminClient,
      supabaseUser,
      geminiKey: geminiKeyForRag,
      openaiKey: readEnv("OPENAI_API_KEY"),
      embedText: adminSvc && openaiEmbedKey
        ? (t: string) => embedWorkCaseText(openaiEmbedKey, t)
        : undefined,
      rerankCases: adminSvc && openaiEmbedKey
        ? (() => {
            // Deno 환경 및 CORP 접두사 인프라를 고려하여 readEnv 기반 안전 검증
            const googleKey = readEnv("GEMINI_API_KEY") ?? readEnv("GOOGLE_GENERATIVE_AI_API_KEY");
            const hasGoogleKey = !!googleKey;

            // LanguageModel 타입 안정성을 보장하기 위해 인스턴스 획득 및 인라인 폴백 구현
            let rerankModel = resolvedLanguageModel;
            if (hasGoogleKey) {
              const lowModel = createLanguageModelForKind("google", "gemini-2.5-flash");
              if (lowModel.ok) {
                rerankModel = lowModel.model;
              }
            }
            return createLlmReranker({ model: rerankModel });
          })()
        : undefined,
      userRefreshToken: googleRefresh ?? undefined,
      supabaseUser,
    }

    const coreMcpTools = buildMcpCoreAiSdkTools(mcpToolCtx, mcpToolFlags)
    const mcpToolDefinitions = listActiveMcpToolDefinitions(mcpToolFlags)

    const mergedToolsRaw = {
      ...coreMcpTools,
      ...pluginTools,
      ...googleTools,
    }
    let mergedTools =
      Object.keys(mergedToolsRaw).length > 0 ? mergedToolsRaw : null

    let webSearchPrefetchBlock = ""
    if (needsWebSearch && exaApiKey) {
      try {
        const prefetch = await prefetchWebSearchContext(
          exaApiKey,
          trimmedPrompt,
        )
        if (prefetch.bridge_skip || !prefetch.ok) {
          console.warn(
            "[ai-chat] Exa prefetch bridge-skip:",
            prefetch.message ?? "no results",
            prefetch.http_status != null ? `(HTTP ${prefetch.http_status})` : "",
          )
          webSearchPrefetchBlock = ""
        } else {
          webSearchPrefetchBlock = resolveWebSearchPrefetchSystemBlock(prefetch)
          console.log(
            "[ai-chat] web search prefetch (Exa):",
            `${prefetch.items.length} items`,
          )
        }
      } catch (prefetchErr) {
        console.warn(
          "[ai-chat] Exa prefetch exception (bridge-skip, RAG-only continue)",
          prefetchErr,
        )
        webSearchPrefetchBlock = ""
      }
      if (mergedTools && WEB_SEARCH_TOOL_NAME in mergedTools) {
        const withoutExaTool = { ...mergedTools }
        delete withoutExaTool[WEB_SEARCH_TOOL_NAME]
        mergedTools = Object.keys(withoutExaTool).length > 0
          ? withoutExaTool
          : null
      }
    }

    if (needsWebSearch) {
      console.log(
        "[ai-chat] web search routing: Exa prefetch →",
        providerKind,
        modelIdUsed,
      )
    }

    if (needsWebSearch) {
      console.log(
        "[ai-chat] web search triggered:",
        internet_search_enabled ? "user toggle" : "heuristic",
      )
    }

    let ragAugmentedStreamBase = textStreamSystemPrompt
    let ragAugmentedVisionBase = systemPrompt


    const textSystemPrompt =
      `${ragAugmentedStreamBase}` +
      webSearchPrefetchBlock +
      (needsWebSearch && webSearchPrefetchBlock
        ? WEB_SEARCH_PREFETCH_GUIDANCE
        : "") +
      buildMcpCoreToolGuidance(mcpToolFlags) +
      (Object.keys(pluginTools).length > 0 ? PLUGIN_TOOL_GUIDANCE : "") +
      (Object.keys(googleTools).length > 0 ? GOOGLE_WORKSPACE_TOOL_GUIDANCE : "")

    const persistUsage = async (event: {
      totalUsage: {
        inputTokens?: number
        outputTokens?: number
      }
    }) => {
      try {
        const usage = event.totalUsage
        const promptTok = Math.max(
          0,
          Math.round(Number(usage.inputTokens ?? 0)),
        )
        const completionTok = Math.max(
          0,
          Math.round(Number(usage.outputTokens ?? 0)),
        )
        const totalTok = promptTok + completionTok

        if (totalTok <= 0) {
          console.warn(
            "[ai-chat] usage.totalTokens=0 — provider did not report token counts",
          )
          return
        }

        let promptWeight = getTokenWeight(modelIdUsed)
        let completionWeight = getTokenWeight(modelIdUsed)

        try {
          const { data: modelData } = await adminClient
            .from("ai_models")
            .select("prompt_weight, completion_weight")
            .eq("api_id", modelIdUsed)
            .maybeSingle()

          if (modelData) {
            promptWeight = Number(modelData.prompt_weight) || promptWeight
            completionWeight = Number(modelData.completion_weight) || completionWeight
          }
        } catch (e) {
          console.error("ai_models 가중치 조회 에러", e)
        }

        const costTokens = (promptTok * promptWeight) + (completionTok * completionWeight)
        const totalCost = Number((costTokens * 0.000001).toFixed(8))

        const { error: logErr } = await adminClient.from("token_logs").insert({
          user_id: user.id,
          ai_model: modelIdUsed,
          prompt_tokens: promptTok * promptWeight,
          completion_tokens: completionTok * completionWeight,
          total_cost: costTokens,
          prompt_text: trimmedPrompt ? trimmedPrompt.substring(0, 200) : null,
        })
        if (logErr) {
          console.error("[ai-chat] token_logs insert 실패", logErr)
        }

        const { data: usageRow, error: readErr } = await adminClient
          .from("users")
          .select("current_token_usage")
          .eq("id", user.id)
          .maybeSingle()

        if (readErr) {
          console.error("[ai-chat] users 조회 실패", readErr)
          return
        }

        const base = Number(usageRow?.current_token_usage ?? 0)
        const { error: updErr } = await adminClient
          .from("users")
          .update({ current_token_usage: base + costTokens })
          .eq("id", user.id)

        if (updErr) {
          console.error("[ai-chat] current_token_usage 업데이트 실패", updErr)
        }
      } catch (persistErr) {
        console.error("[ai-chat] onFinish 처리 예외", persistErr)
      }
    }

    const labToolDebug =
      Boolean(labPayload?.tool_debug) && richImages.length === 0
    const useNdjsonStream =
      richImages.length === 0 &&
      (labToolDebug ||
        mergedTools !== null)

    if (mcpToolDefinitions.length > 0) {
      console.log(
        "[ai-chat] MCP core tools:",
        mcpToolDefinitions.map((d) => d.name).join(", "),
      )
    }

    // Deno/Google AI SDK Context Caching 및 OpenAI/DeepSeek Thinking Budget 메타데이터 주입
    const googleMetadata = nhRouteResult?.useContextCaching ? {
      google: {
        cachedContent: {
          ttl: "300s"
        }
      }
    } : {}

    const thinkingMetadata = nhRouteResult?.thinkingBudget?.enabled ? {
      openai: {
        // o3-mini/o3 용 reasoningEffort
        ...(nhRouteResult.thinkingBudget.reasoningEffort ? { reasoningEffort: nhRouteResult.thinkingBudget.reasoningEffort } : {}),
        // OpenAI 호환 API로 R1 호출 시 호환 매개변수 바인딩
        ...(nhRouteResult.thinkingBudget.maxThinkingTokens ? { maxCompletionTokens: nhRouteResult.thinkingBudget.maxThinkingTokens } : {})
      },
      deepseek: {
        // DeepSeek Native SDK 용 maxThinkingTokens 바인딩
        maxThinkingTokens: nhRouteResult.thinkingBudget.maxThinkingTokens
      }
    } : {}

    const nhProviderMetadata = {
      ...googleMetadata,
      ...thinkingMetadata
    }

    const hasProviderMetadata = Object.keys(nhProviderMetadata).length > 0

    const streamCommon = {
      model: resolvedLanguageModel,
      onFinish: async (event: {
        totalUsage: { inputTokens?: number; outputTokens?: number }
      }) => {
        await persistUsage(event)

        // 헤르메스 에이전트 장기 기억 추출 백그라운드 트리거 (메시지가 3턴 이상일 때만)
        if (messages.length > 2) {
          const baseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, '') || ''
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ''

          if (baseUrl && serviceKey) {
            // fire-and-forget (await 하지 않음)
            fetch(`${baseUrl}/functions/v1/memory-extractor`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${serviceKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                userId: user.id,
                messages: messages
              })
            }).catch(e => console.error('[ai-chat] memory-extractor trigger failed:', e))
          }
        }
      },
    } as const

    if (richImages.length > 0) {
      const result = streamText({
        ...streamCommon,
        system: ragAugmentedVisionBase,
        messages: [
          ...visionHistoryMessages,
          {
            role: "user",
            content: [
              { type: "text", text: visionLatestUserText },
              ...richImages.map((img) => (
                img.mimeType.startsWith("image/") ? {
                  type: "image" as const,
                  image: bytesToBase64(img.bytes),
                  mimeType: img.mimeType,
                } : {
                  type: "file" as const,
                  data: bytesToBase64(img.bytes),
                  mimeType: img.mimeType,
                }
              )),
            ],
          },
        ],
        ...(hasProviderMetadata ? { providerMetadata: nhProviderMetadata } : {}),
      })
      return result.toTextStreamResponse({
        headers: withCors({ "X-NH-AI-Model-Used": modelIdUsed }),
      })
    }

    if (useNdjsonStream) {
      const encoder = new TextEncoder()
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          const writeLine = (obj: Record<string, unknown>) => {
            controller.enqueue(
              encoder.encode(`${JSON.stringify(obj)}\n`),
            )
          }
          try {
            const result = streamText({
              ...streamCommon,
              system: textSystemPrompt,
              messages: aiSdkConversationMessages,
              ...(mergedTools
                ? { tools: mergedTools, stopWhen: stepCountIs(12) }
                : {}),
              ...(hasProviderMetadata ? { providerMetadata: nhProviderMetadata } : {}),
              onStepFinish: async (step) => {
                // ── 중앙 집중형 에이전트 루프: tool_use → NDJSON 이벤트 ─────
                // execute 라우팅은 mcp-tools.routeMcpToolInvocation (및 플러그인 도구) 에 위임
                const calls = step.toolCalls ?? []
                for (const tc of calls) {
                  writeLine({
                    type: "tool",
                    phase: "call",
                    at: new Date().toISOString(),
                    toolName: tc.toolName,
                    toolCallId: tc.toolCallId,
                    input: "input" in tc ? tc.input : undefined,
                  })
                }
                const results = step.toolResults ?? []
                for (const tr of results) {
                  writeLine({
                    type: "tool",
                    phase: "result",
                    at: new Date().toISOString(),
                    toolName: tr.toolName,
                    toolCallId: tr.toolCallId,
                    output: "output" in tr ? tr.output : undefined,
                  })
                  if (tr.toolName === MCP_CORE_TOOL_NAMES.SEARCH_SIMILAR_CASES) {
                    const sources = buildCitationSourcesFromSearchOutput(
                      "output" in tr ? tr.output : undefined,
                    )
                    if (sources.length > 0) {
                      writeLine({ type: "citations", sources })
                    }
                  }
                  if (
                    tr.toolName ===
                      MCP_CORE_TOOL_NAMES.INJECT_UNIVER_OFFICE_DATA
                  ) {
                    const officeOutput = "output" in tr ? tr.output : undefined
                    if (
                      officeOutput &&
                      typeof officeOutput === "object" &&
                      officeOutput !== null &&
                      (officeOutput as { ok?: boolean }).ok === true
                    ) {
                      const payload = officeOutput as {
                        activeTab?: string
                        aiDataSignal?: Record<string, unknown>
                      }
                      if (payload.aiDataSignal) {
                        writeLine({
                          type: "univer_office",
                          activeTab: payload.activeTab,
                          aiDataSignal: payload.aiDataSignal,
                        })
                      }
                    }
                  }
                }
                if (calls.length > 0 || results.length > 0) {
                  writeLine({
                    type: "meta",
                    activeToolNames: Object.keys(mergedTools ?? {}),
                    mcpCoreToolDefinitions: mcpToolDefinitions,
                    model: modelIdUsed,
                  })
                }
              },
            })

            for await (const delta of result.textStream) {
              if (delta.length > 0) {
                writeLine({ type: "text", delta })
              }
            }

            writeLine({
              type: "done",
              model: modelIdUsed,
              activeToolNames: Object.keys(mergedTools ?? {}),
              mcpCoreToolDefinitions: mcpToolDefinitions,
            })
          } catch (streamErr) {
            const message = streamErr instanceof Error
              ? streamErr.message
              : String(streamErr)
            writeLine({ type: "error", message })
          } finally {
            controller.close()
          }
        },
      })

      return new Response(body, {
        headers: withCors({
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "X-NH-AI-Requested-Model": preferredAiChosen,
          "X-NH-AI-Model-Used": modelIdUsed,
        }),
      })
    }

    const result = streamText({
      ...streamCommon,
      system: textSystemPrompt,
      messages: aiSdkConversationMessages,
      // ── 중앙 집중형 에이전트 루프 (표준 SSE): tools → tool_use → routeMcpToolInvocation
      ...(mergedTools
        ? { tools: mergedTools, stopWhen: stepCountIs(12) }
        : {}),
      ...(hasProviderMetadata ? { providerMetadata: nhProviderMetadata } : {}),
    })

    return result.toTextStreamResponse({
      headers: withCors({
        "X-NH-AI-Requested-Model": preferredAiChosen,
        "X-NH-AI-Model-Used": modelIdUsed,
      }),
    })
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "streamText 호출에 실패했습니다."
    if (/loadapikeyerror|api key|apikey/i.test(message)) {
      return jsonResponse(
        {
          error:
            "AI 프로바이더 API 키가 없거나 유효하지 않습니다. Supabase Edge Secrets를 확인하거나 다른 모델을 선택해 주세요.",
        },
        400,
      )
    }
    return jsonResponse({ error: message }, 500)
  }
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req)
  } catch (error) {
    console.error("[ai-chat] Unhandled Exception:", error)
    const msg = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ error: `서버 내부 오류가 발생했습니다: ${msg}` }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
      }
    })
  }
})
