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

기획 맥락(타겟·문제·핵심 기능·차별점)이 충분히 모였다고 판단될 때만, 아래 형식으로 안내하세요.
- 준비되기 전에는 절대 [PLANNER_READY] 를 출력하지 마세요.
- 준비되면 사용자에게 친절히 요약한 뒤, 마지막 문단에 반드시 이렇게 안내하세요:
  "이제 오른쪽 상단 **🚀 기획안 생성** 버튼을 눌러주세요. PRD·기능명세·플로우·와이어프레임이 작성됩니다."
- 그 다음 줄에 단독으로 [PLANNER_READY] 를 출력하세요. (이 줄은 시스템용이므로 다른 텍스트와 같은 줄에 쓰지 마세요.)`

const PLANNER_GENERATION_SYSTEM_PROMPT = `당신은 실리콘밸리 최고의 PM, 개발자, UX 디자이너 3인으로 구성된 팀입니다.
제공된 대화 내역(기획 맥락)을 바탕으로 아래 4가지 문서를 작성해야 합니다.

1. PRD (제품 요구사항 정의서): 마크다운 형식. 배경, 목적, 타겟, 기대효과.
2. 기능 명세서 (Feature Specs): 마크다운 형식. 기능별 우선순위, 상세 설명.
3. 유저 플로우 (Mermaid.js): 사용자가 서비스를 이용하는 핵심 흐름을 Mermaid.js 형식의 flowchart TD 로 작성.
4. 와이어프레임 (HTML/CSS): 핵심 화면의 UI를 보여주는 독립 실행 가능한 HTML/CSS 목업. 외부 리소스와 script 없이 inline CSS만 사용.

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

  // Planner UI의 "자동 · Gemini 2.5 Flash 기본"과 동일하게 Gemini 고정
  if (isAuto) {
    return [{ kind: "google", modelId: "gemini-2.5-flash" }]
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

    const providerMetadata =
      candidate.kind === "google"
        ? {
          google: {
            thinkingConfig: {
              // Gemini 2.5 Flash 기본 thinking(최대 ~8192)이 maxOutputTokens 예산을 잡아먹지 않도록 비활성화
              thinkingBudget: 0,
            },
          },
        }
        : undefined

    try {
      const { text, finishReason } = await generateText({
        model: resolved.model,
        system: params.system,
        messages: params.messages,
        temperature: params.temperature,
        maxOutputTokens: params.maxOutputTokens,
        maxRetries: 0,
        ...(providerMetadata ? { providerMetadata } : {}),
      })

      if (finishReason === "length") {
        console.warn(
          `[ai-planner] ${params.mode} 응답이 출력 토큰 한도(${params.maxOutputTokens})에서 잘렸습니다.`,
          { modelId: resolved.modelId, provider: resolved.provider },
        )
      }

      if (!text.trim()) {
        throw new Error("모델이 빈 응답을 반환했습니다.")
      }

      return {
        text,
        modelId: resolved.modelId,
        provider: resolved.provider,
        truncated: finishReason === "length",
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(formatPlannerProviderError(candidate.kind, candidate.modelId, message))
    }
  }

  throw new Error(
    errors[0] ??
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
    .replace(/^```(?:mermaid|html)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
}

function parsePlannerResult(text: string): PlannerFullResult {
  return {
    prdMarkdown: matchTag(text, "PRD"),
    specMarkdown: matchTag(text, "SPEC"),
    mermaidFlow: stripCodeFence(matchTag(text, "MERMAID")),
    wireframeHtml: stripCodeFence(matchTag(text, "WIREFRAME")),
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
  const maxOutputTokens = mode === "generate" ? 8000 : 2048
  const temperature = mode === "generate" ? 0.5 : 0.7

  try {
    let generated = await generatePlannerText({
      preferredAi,
      system,
      messages,
      maxOutputTokens,
      temperature,
      mode,
    })

    if (mode === "chat") {
      return jsonResponse({
        ok: true,
        text: generated.text,
        truncated: generated.truncated,
        model: generated.modelId,
        provider: generated.provider,
      })
    }

    let result = parsePlannerResult(generated.text)
    let missing = missingPlannerSections(result)

    if (missing.length > 0) {
      generated = await generatePlannerText({
        preferredAi,
        system:
          `${PLANNER_GENERATION_SYSTEM_PROMPT}\n\n` +
          "네 XML 블록을 모두 빠짐없이 작성하세요. 빈 블록을 반환하지 마세요.",
        messages,
        maxOutputTokens,
        temperature: 0.3,
        mode: "generate",
      })
      result = parsePlannerResult(generated.text)
      missing = missingPlannerSections(result)
    }

    if (missing.length > 0) {
      throw new Error(
        `AI가 완전한 기획안을 반환하지 않았습니다. 누락: ${missing.join(", ")}. 다시 생성해 주세요.`,
      )
    }

    return jsonResponse({
      ok: true,
      result,
      model: generated.modelId,
      provider: generated.provider,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[ai-planner]", message)
    return jsonResponse({ ok: false, error: message }, 500)
  }
})
