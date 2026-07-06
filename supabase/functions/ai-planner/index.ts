import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createAnthropic } from "npm:@ai-sdk/anthropic@3.0.58"
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google@3.0.75"
import { createOpenAI } from "npm:@ai-sdk/openai@3.0.64"
import { generateText, type CoreMessage, type LanguageModel } from "npm:ai@6.0.184"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"

import {
  handleCorsPreflight,
  jsonResponse,
} from "../_shared/cors.ts"
import { normalizePreferredAiToResolvedModel } from "../_shared/normalize-preferred-ai-model.ts"

type PlannerMode = "chat" | "generate"

const PLANNER_CHAT_SYSTEM_PROMPT = `당신은 세계 최고의 프로덕트 매니저(PM)입니다.
사용자가 서비스를 만들고자 할 때, 필요한 정보(타겟 유저, 핵심 기능, 수익 모델, 차별점 등)를 역질문하여 기획을 구체화하는 역할을 합니다.
답변은 친절하고 전문적으로 하되, 한 번에 1~2개의 질문만 던져 사용자가 부담 없이 대답할 수 있게 하세요.
사용자가 추가 질문·수정 요청을 해도 대화를 이어가며, 이미 충분한 맥락이 모였다면 다시 생성 안내를 해 주세요.

기획 맥락(타겟·문제·핵심 기능·차별점)이 충분히 모였다고 판단될 때, 아래 형식으로 안내하세요.
- 준비되기 전에는 절대 [PLANNER_READY] 를 출력하지 마세요.
- 준비되면 사용자에게 친절히 요약한 뒤, 마지막 문단에 반드시 이렇게 안내하세요:
  "이제 **🚀 기획안 생성** 버튼을 눌러주세요. PRD·기능명세·플로우·와이어프레임이 작성됩니다."
- 그 다음 줄에 단독으로 [PLANNER_READY] 를 출력하세요. (이 줄은 시스템용이므로 다른 텍스트와 같은 줄에 쓰지 마세요.)
- 사용자가 후속 질문을 한 뒤에도 맥락이 충분하면 답변 마지막에 다시 [PLANNER_READY] 를 출력하세요.`

const PLANNER_GENERATION_SYSTEM_PROMPT = `당신은 실리콘밸리 최고의 PM, 개발자, UX 디자이너 3인으로 구성된 팀입니다.
제공된 대화 내역(기획 맥락)을 바탕으로 아래 4가지 문서를 작성해야 합니다.

1. PRD (제품 요구사항 정의서): 마크다운 형식. 배경, 목적, 타겟, 기대효과.
2. 기능 명세서 (Feature Specs): 마크다운 형식. 기능별 우선순위, 상세 설명.
3. 유저 플로우 (Mermaid.js): 사용자가 서비스를 이용하는 핵심 흐름을 Mermaid.js 형식의 flowchart TD 로 작성.
4. 와이어프레임 (HTML/CSS): 핵심 화면 1~2개만 간결한 HTML/CSS 목업. 외부 리소스와 script 없이 inline CSS만 사용. 400줄 이내로 작성.

출력은 반드시 다음 XML 구조를 엄격히 준수하세요.

<PRD>
(마크다운 내용)
</PRD>

<SPEC>
(기능명세서 마크다운)
</SPEC>

<MERMAID>
(mermaid 코드만 작성, backticks 제외)
</MERMAID>

<WIREFRAME>
(HTML/CSS 코드)
</WIREFRAME>
`

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

function readGeminiKey(): string | undefined {
  return readEnv("GEMINI_API_KEY") ?? readEnv("GOOGLE_GENERATIVE_AI_API_KEY")
}

type ResolvedModel =
  | { ok: true; model: LanguageModel; modelId: string; provider: string }
  | { ok: false; error: string }

function createModelForKind(
  kind: "openai" | "anthropic" | "google",
  modelId: string,
): ResolvedModel {
  if (kind === "google") {
    const apiKey = readGeminiKey()
    if (!apiKey) {
      return { ok: false, error: "Google Gemini API 키가 설정되지 않았습니다." }
    }
    const google = createGoogleGenerativeAI({ apiKey })
    return { ok: true, model: google(modelId), modelId, provider: "google" }
  }

  if (kind === "anthropic") {
    const apiKey = readEnv("ANTHROPIC_API_KEY")
    if (!apiKey) {
      return { ok: false, error: "Anthropic API 키가 설정되지 않았습니다." }
    }
    const anthropic = createAnthropic({ apiKey })
    return { ok: true, model: anthropic(modelId), modelId, provider: "anthropic" }
  }

  const apiKey = readEnv("OPENAI_API_KEY")
  if (!apiKey) {
    return { ok: false, error: "OpenAI API 키가 설정되지 않았습니다." }
  }
  const openai = createOpenAI({ apiKey })
  return { ok: true, model: openai(modelId), modelId, provider: "openai" }
}

function listPlannerModelCandidates(
  preferredAi: string,
): Array<{ kind: "openai" | "anthropic" | "google"; modelId: string }> {
  const raw = preferredAi.trim().toLowerCase()
  const isAuto = !raw || raw === "auto"

  // Planner UI의 "자동 · Gemini 2.5 Flash 기본" + 빈 응답 시 폴백
  if (isAuto) {
    return [
      { kind: "google", modelId: "gemini-2.5-flash" },
      { kind: "google", modelId: "gemini-2.5-flash-lite" },
      { kind: "openai", modelId: "gpt-4o-mini" },
    ]
  }

  const { kind, modelId } = normalizePreferredAiToResolvedModel(preferredAi)
  return [{ kind, modelId }]
}

function providerLabel(kind: "openai" | "anthropic" | "google"): string {
  if (kind === "google") return "Google Gemini"
  if (kind === "anthropic") return "Anthropic Claude"
  return "OpenAI"
}

function formatPlannerProviderError(
  kind: "openai" | "anthropic" | "google",
  modelId: string,
  message: string,
): string {
  const provider = providerLabel(kind)
  if (/incorrect api key|invalid api key|authentication|unauthorized|401|403/i.test(message)) {
    return `${provider}(${modelId}) API 키가 올바르지 않습니다. Supabase Secrets를 확인해 주세요.`
  }
  if (/api key.*missing|not configured|설정되지/i.test(message)) {
    return `${provider}(${modelId}) API 키가 설정되지 않았습니다.`
  }
  return `${provider}(${modelId}): ${message}`
}

type GeminiRestResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
        thought?: boolean
      }>
    }
    finishReason?: string
  }>
  promptFeedback?: {
    blockReason?: string
  }
  error?: {
    message?: string
  }
}

async function generateGooglePlannerTextViaRest(params: {
  modelId: string
  system: string
  messages: CoreMessage[]
  maxOutputTokens: number
  temperature: number
}): Promise<{ text: string; finishReason: string }> {
  const apiKey = readGeminiKey()
  if (!apiKey) throw new Error("Google Gemini API 키가 설정되지 않았습니다.")

  const systemMessages = params.messages
    .filter((message) => message.role === "system" && typeof message.content === "string")
    .map((message) => String(message.content).trim())
    .filter(Boolean)
  const contents = params.messages.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return []
    if (typeof message.content !== "string" || !message.content.trim()) return []
    return [{
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content.trim() }],
    }]
  })

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.modelId)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: [params.system, ...systemMessages].join("\n\n") }],
        },
        contents,
        generationConfig: {
          temperature: params.temperature,
          maxOutputTokens: params.maxOutputTokens,
        },
      }),
    },
  )

  let body: GeminiRestResponse = {}
  try {
    body = await response.json() as GeminiRestResponse
  } catch {
    throw new Error(`Gemini REST 응답을 해석하지 못했습니다 (HTTP ${response.status}).`)
  }

  if (!response.ok) {
    throw new Error(body.error?.message || `Gemini REST 요청 실패 (HTTP ${response.status}).`)
  }

  const candidate = body.candidates?.[0]
  const text = candidate?.content?.parts
    ?.filter((part) => part.thought !== true && typeof part.text === "string")
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim() ?? ""
  const finishReason = candidate?.finishReason ?? body.promptFeedback?.blockReason ?? "unknown"

  if (!text) {
    throw new Error(`Gemini REST가 빈 응답을 반환했습니다 (finishReason=${finishReason}).`)
  }

  return { text, finishReason }
}

async function generatePlannerText(params: {
  preferredAi: string
  system: string
  messages: CoreMessage[]
  maxOutputTokens: number
  temperature: number
  mode: PlannerMode
}): Promise<{ text: string; modelId: string; provider: string; truncated: boolean }> {
  const candidates = listPlannerModelCandidates(params.preferredAi)
  const errors: string[] = []

  for (const candidate of candidates) {
    const resolved = createModelForKind(candidate.kind, candidate.modelId)
    if (!resolved.ok) {
      errors.push(formatPlannerProviderError(candidate.kind, candidate.modelId, resolved.error))
      continue
    }

    try {
      const result = await generateText({
        model: resolved.model,
        system: params.system,
        messages: params.messages,
        temperature: params.temperature,
        maxOutputTokens: params.maxOutputTokens,
        maxRetries: 0,
      })

      let finishReason: string | undefined = result.finishReason
      let text = result.text?.trim() ?? ""

      if (!text && candidate.kind === "google") {
        console.warn("[ai-planner] empty SDK text; trying Gemini REST fallback", {
          mode: params.mode,
          modelId: resolved.modelId,
          finishReason: finishReason ?? "unknown",
        })
        const fallback = await generateGooglePlannerTextViaRest({
          modelId: candidate.modelId,
          system: params.system,
          messages: params.messages,
          maxOutputTokens: params.maxOutputTokens,
          temperature: params.temperature,
        })
        text = fallback.text
        finishReason = fallback.finishReason
      }

      if (finishReason === "length") {
        console.warn(
          `[ai-planner] ${params.mode} 응답이 출력 토큰 한도(${params.maxOutputTokens})에서 잘렸습니다.`,
          { modelId: resolved.modelId, provider: resolved.provider, finishReason },
        )
      }

      if (!text) {
        const reason = finishReason ?? "unknown"
        console.warn("[ai-planner] empty model text", {
          mode: params.mode,
          modelId: resolved.modelId,
          finishReason: reason,
        })
        throw new Error(
          `모델이 빈 응답을 반환했습니다 (finishReason=${reason}). 출력 토큰·thinking 설정을 확인하세요.`,
        )
      }

      return {
        text,
        modelId: resolved.modelId,
        provider: resolved.provider,
        truncated: finishReason === "length",
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const formatted = formatPlannerProviderError(candidate.kind, candidate.modelId, message)
      errors.push(formatted)
      console.warn("[ai-planner] model candidate failed", {
        mode: params.mode,
        provider: candidate.kind,
        modelId: candidate.modelId,
        message,
      })
    }
  }

  throw new Error(
    errors.join(" | ") ||
      "사용 가능한 AI 제공자를 찾지 못했습니다.",
  )
}

function matchTag(str: string, tag: string): string {
  const regex = new RegExp(
    `<\\s*${tag}\\b[^>]*>([\\s\\S]*?)<\\/\\s*${tag}\\s*>`,
    "i",
  )
  const match = str.match(regex)
  return match ? match[1].trim() : ""
}

type PlannerFullResult = {
  prdMarkdown: string
  specMarkdown: string
  mermaidFlow: string
  wireframeHtml: string
}

function stripCodeFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:mermaid|html|xml|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
}

function extractSectionByHeading(text: string, headings: string[]): string {
  const headingPattern = headings
    .map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")
  const regex = new RegExp(
    `(?:^|\\n)#+\\s*(?:${headingPattern})[^\\n]*\\n([\\s\\S]*?)(?=\\n#+\\s|$)`,
    "i",
  )
  const match = text.match(regex)
  return match ? match[1].trim() : ""
}

function mergePlannerResults(
  base: PlannerFullResult,
  patch: PlannerFullResult,
): PlannerFullResult {
  return {
    prdMarkdown: base.prdMarkdown || patch.prdMarkdown,
    specMarkdown: base.specMarkdown || patch.specMarkdown,
    mermaidFlow: base.mermaidFlow || patch.mermaidFlow,
    wireframeHtml: base.wireframeHtml || patch.wireframeHtml,
  }
}

function parsePlannerResult(text: string): PlannerFullResult {
  const fromTags: PlannerFullResult = {
    prdMarkdown: matchTag(text, "PRD"),
    specMarkdown: matchTag(text, "SPEC"),
    mermaidFlow: stripCodeFence(matchTag(text, "MERMAID")),
    wireframeHtml: stripCodeFence(matchTag(text, "WIREFRAME")),
  }

  return mergePlannerResults(fromTags, {
    prdMarkdown: extractSectionByHeading(text, ["PRD", "제품 요구사항", "Product Requirements"]),
    specMarkdown: extractSectionByHeading(text, ["SPEC", "기능 명세", "Feature Spec", "Feature Specs"]),
    mermaidFlow: stripCodeFence(
      extractSectionByHeading(text, ["MERMAID", "유저 플로우", "User Flow", "플로우"]),
    ),
    wireframeHtml: stripCodeFence(
      extractSectionByHeading(text, ["WIREFRAME", "와이어프레임", "Wireframe"]),
    ),
  })
}

type PlannerSection = "PRD" | "SPEC" | "MERMAID" | "WIREFRAME"

const SECTION_MAX_TOKENS: Record<PlannerSection, number> = {
  PRD: 3072,
  SPEC: 4096,
  MERMAID: 2048,
  WIREFRAME: 4096,
}

function sectionField(section: PlannerSection): keyof PlannerFullResult {
  if (section === "PRD") return "prdMarkdown"
  if (section === "SPEC") return "specMarkdown"
  if (section === "MERMAID") return "mermaidFlow"
  return "wireframeHtml"
}

function parsePlannerSection(section: PlannerSection, text: string): PlannerFullResult {
  const parsed = parsePlannerResult(text)
  const field = sectionField(section)
  if (parsed[field].trim()) return parsed

  const unwrapped = text
    .replace(new RegExp(`<\\/?\\s*${section}\\b[^>]*>`, "gi"), "")
    .trim()
  const fallback = section === "MERMAID" || section === "WIREFRAME"
    ? stripCodeFence(unwrapped)
    : unwrapped

  return {
    ...parsed,
    [field]: fallback,
  }
}

function sectionSystemPrompt(section: PlannerSection): string {
  const mermaidRules = section === "MERMAID"
    ? `
Mermaid 작성 규칙:
- 첫 줄은 반드시 flowchart TD 로 작성하세요.
- 노드 ID는 A, B1처럼 영문과 숫자만 사용하세요.
- 모든 노드 라벨은 A["한글 라벨"] 형식으로 큰따옴표 안에 작성하세요.
- 연결은 A --> B 또는 A -->|조건| B 형식만 사용하세요.
- 괄호형 노드, HTML, Markdown, 주석, 코드펜스는 사용하지 마세요.
- flowchart TD 선언부터 마지막 연결선까지 유효한 Mermaid 코드만 태그 안에 작성하세요.`
    : ""

  const wireframeRules = section === "WIREFRAME"
    ? `
와이어프레임 작성 규칙:
- <!doctype html>로 시작하는 완전한 HTML 문서로 작성하세요.
- 화면 UI는 시맨틱 HTML과 inline <style>만 사용하세요.
- Mermaid, SVG 다이어그램, Markdown, 코드펜스는 사용하지 마세요.
- script, 외부 리소스, 외부 URL, iframe은 사용하지 마세요.
- 문서에는 오류 메시지나 Mermaid 버전 문구를 포함하지 마세요.`
    : ""

  return `${PLANNER_GENERATION_SYSTEM_PROMPT}

이번 응답에서는 <${section}> XML 블록 하나만 작성하세요.
다른 태그(PRD, SPEC, MERMAID, WIREFRAME)는 절대 출력하지 마세요.
반드시 <${section}> 로 시작하고 </${section}> 로 끝내세요.${mermaidRules}${wireframeRules}`
}

function isValidPlannerSection(section: PlannerSection, value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false

  if (section === "MERMAID") {
    return /^flowchart\s+TD\b/i.test(trimmed) &&
      !/<\/?(?:html|body|script|style|div|main|section)\b/i.test(trimmed) &&
      !/syntax error in text|mermaid version/i.test(trimmed)
  }

  if (section === "WIREFRAME") {
    return /^<!doctype\s+html>/i.test(trimmed) &&
      /<html\b/i.test(trimmed) &&
      /<body\b/i.test(trimmed) &&
      !/<(?:script|iframe)\b/i.test(trimmed) &&
      !/\b(?:flowchart|graph)\s+(?:TD|TB|BT|RL|LR)\b/i.test(trimmed) &&
      !/syntax error in text|mermaid version/i.test(trimmed)
  }

  return true
}

function sectionGenerationMessages(
  messages: CoreMessage[],
  section: PlannerSection,
): CoreMessage[] {
  return [
    ...messages,
    {
      role: "user",
      content: `지금까지의 대화를 바탕으로 ${section} 문서를 작성하세요. 응답에는 요청한 ${section} 섹션만 포함하세요.`,
    },
  ]
}

async function generatePlannerPlanResult(params: {
  preferredAi: string
  messages: CoreMessage[]
}): Promise<{
  result: PlannerFullResult
  modelId: string
  provider: string
  truncated: boolean
}> {
  const empty: PlannerFullResult = {
    prdMarkdown: "",
    specMarkdown: "",
    mermaidFlow: "",
    wireframeHtml: "",
  }
  let merged = { ...empty }
  let lastModelId = "gemini-2.5-flash"
  let lastProvider = "google"
  let truncated = false

  const sections: PlannerSection[] = ["PRD", "SPEC", "MERMAID", "WIREFRAME"]

  for (const section of sections) {
    const field = sectionField(section)
    if (merged[field].trim()) continue

    let lastError = ""

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const sectionGenerated = await generatePlannerText({
          preferredAi: params.preferredAi,
          system: sectionSystemPrompt(section),
          messages: sectionGenerationMessages(params.messages, section),
          maxOutputTokens: SECTION_MAX_TOKENS[section],
          temperature: attempt === 0 ? 0.4 : 0.2,
          mode: "generate",
        })
        lastModelId = sectionGenerated.modelId
        lastProvider = sectionGenerated.provider
        truncated = truncated || sectionGenerated.truncated

        const parsed = parsePlannerSection(section, sectionGenerated.text)
        const value = parsed[field].trim()
        if (isValidPlannerSection(section, value)) {
          merged = { ...merged, [field]: value }
          break
        }
        lastError = `${section} 블록의 형식이 올바르지 않습니다.`
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
      }
    }

    if (!merged[field].trim()) {
      throw new Error(
        lastError ||
          `${section} 섹션 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.`,
      )
    }
  }

  return {
    result: merged,
    modelId: lastModelId,
    provider: lastProvider,
    truncated,
  }
}

function missingPlannerSections(result: PlannerFullResult): string[] {
  const missing: string[] = []
  if (!result.prdMarkdown) missing.push("PRD")
  if (!result.specMarkdown) missing.push("SPEC")
  if (!result.mermaidFlow) missing.push("MERMAID")
  if (!result.wireframeHtml) missing.push("WIREFRAME")
  return missing
}

function normalizeMessages(raw: unknown): CoreMessage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => {
      if (!item || typeof item !== "object") return false
      const role = (item as { role?: unknown }).role
      return role === "user" || role === "assistant" || role === "system"
    })
    .map((item) => {
      const row = item as { role: "user" | "assistant" | "system"; content: unknown }
      const content =
        typeof row.content === "string"
          ? row.content
          : Array.isArray(row.content)
            ? row.content
                .map((part) =>
                  typeof part === "string"
                    ? part
                    : typeof part === "object" &&
                        part &&
                        "text" in part &&
                        typeof (part as { text?: unknown }).text === "string"
                      ? (part as { text: string }).text
                      : "",
                )
                .join("\n")
            : String(row.content ?? "")
      return { role: row.role, content }
    })
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405)
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return jsonResponse({ ok: false, error: "인증 헤더가 없습니다." }, 401)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ ok: false, error: "Supabase 설정이 누락되었습니다." }, 500)
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser()
  if (userError || !user) {
    return jsonResponse({ ok: false, error: "유효하지 않은 세션입니다." }, 401)
  }

  let body: {
    mode?: string
    messages?: unknown
    preferredAi?: string
  }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: "JSON 본문이 필요합니다." }, 400)
  }

  const mode = (body.mode ?? "chat").trim().toLowerCase() as PlannerMode
  const preferredAi = (body.preferredAi ?? "auto").trim()
  const messages = normalizeMessages(body.messages)

  if (!["chat", "generate"].includes(mode)) {
    return jsonResponse({ ok: false, error: "지원하지 않는 mode 입니다." }, 400)
  }

  if (messages.length === 0) {
    return jsonResponse({ ok: false, error: "messages 가 필요합니다." }, 400)
  }

  const system =
    mode === "generate" ? PLANNER_GENERATION_SYSTEM_PROMPT : PLANNER_CHAT_SYSTEM_PROMPT
  const maxOutputTokens = mode === "generate" ? 8192 : 2048
  const temperature = mode === "generate" ? 0.5 : 0.7

  try {
    if (mode === "chat") {
      const generated = await generatePlannerText({
        preferredAi,
        system,
        messages,
        maxOutputTokens,
        temperature,
        mode,
      })

      return jsonResponse({
        ok: true,
        text: generated.text,
        truncated: generated.truncated,
        model: generated.modelId,
        provider: generated.provider,
      })
    }

    const generated = await generatePlannerPlanResult({
      preferredAi,
      messages,
    })

    return jsonResponse({
      ok: true,
      result: generated.result,
      model: generated.modelId,
      provider: generated.provider,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[ai-planner]", message)
    return jsonResponse({ ok: false, error: message }, 500)
  }
})
