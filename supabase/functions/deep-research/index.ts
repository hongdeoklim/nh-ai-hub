/**
 * NH AI Inside Hub — Edge Function `deep-research`
 *
 * [28단계] AI 앙상블(Multi-Agent) 심층 연구 모드
 * Claude · GPT · Gemini 병렬 분석 후 편집장(Claude)이 교차 검증·융합합니다.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createAnthropic } from "npm:@ai-sdk/anthropic@3.0.78"
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google@3.0.75"
import { createOpenAI } from "npm:@ai-sdk/openai@3.0.64"
import { generateText } from "npm:ai@6.0.184"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"

import {
  assertDepartmentBudgetAllowed,
  readDeepResearchEstimatedUsd,
} from "../_shared/budgetHelper.ts"

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

const CLAUDE_MODEL = "claude-3-5-sonnet-20241022"
const OPENAI_MODEL = "gpt-4o"
const GEMINI_MODEL = "gemini-1.5-flash"

const RESEARCH_SYSTEM =
  "당신은 농협네트웍스 임직원을 돕는 전문 업무 분석가입니다. 질문에 대해 깊이 있고 구조화된 분석·기획안을 작성합니다."

const EDITOR_SYSTEM =
  "너는 최고 데이터 분석가이자 편집장이야. 다음 3개 AI 모델의 분석 결과를 읽고, 상호 교차 검증하여 모순점을 해결한 뒤, 가장 완벽하고 구조화된 하나의 최종 기획서(보고서)로 융합해서 작성해 줘."

type ModelLabel = "Claude" | "GPT" | "Gemini"

type ResearchSuccess = {
  label: ModelLabel
  text: string
}

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

function readGoogleApiKey(): string | undefined {
  return readEnv("GOOGLE_GENERATIVE_AI_API_KEY") ?? readEnv("GEMINI_API_KEY")
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

async function runClaudeResearch(
  prompt: string,
  apiKey: string,
): Promise<ResearchSuccess> {
  const anthropic = createAnthropic({ apiKey })
  const { text } = await generateText({
    model: anthropic(CLAUDE_MODEL),
    system: RESEARCH_SYSTEM,
    prompt,
    maxOutputTokens: 4096,
  })
  return { label: "Claude", text: text.trim() }
}

async function runOpenAiResearch(
  prompt: string,
  apiKey: string,
): Promise<ResearchSuccess> {
  const openai = createOpenAI({ apiKey })
  const { text } = await generateText({
    model: openai(OPENAI_MODEL),
    system: RESEARCH_SYSTEM,
    prompt,
    maxOutputTokens: 4096,
  })
  return { label: "GPT", text: text.trim() }
}

async function runGeminiResearch(
  prompt: string,
  apiKey: string,
): Promise<ResearchSuccess> {
  const google = createGoogleGenerativeAI({ apiKey })
  const { text } = await generateText({
    model: google(GEMINI_MODEL),
    system: RESEARCH_SYSTEM,
    prompt,
    maxOutputTokens: 4096,
  })
  return { label: "Gemini", text: text.trim() }
}

function buildEditorPrompt(
  userPrompt: string,
  results: ResearchSuccess[],
): string {
  const sections = results
    .map(
      (r) =>
        `## [${r.label} 분석]\n${r.text}`,
    )
    .join("\n\n---\n\n")

  return `## 원본 질문\n${userPrompt}\n\n---\n\n${sections}`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "POST only" }, 405)
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return jsonResponse({ ok: false, error: "인증 헤더가 없습니다." }, 401)
  }

  const supabaseUrl = readEnv("SUPABASE_URL")
  const supabaseAnonKey = readEnv("SUPABASE_ANON_KEY")
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ ok: false, error: "server_config" }, 500)
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser()

  if (userError || !user) {
    return jsonResponse({ ok: false, error: "유효하지 않은 세션입니다." }, 401)
  }

  let body: { prompt?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400)
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
  if (!prompt.length) {
    return jsonResponse({ ok: false, error: "prompt_required" }, 400)
  }

  const { data: profile, error: profileError } = await supabaseUser
    .from("users")
    .select("department, is_admin, role")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return jsonResponse({ ok: false, error: "직원 프로필을 찾을 수 없습니다." }, 403)
  }

  const profileAdminFields = profile as {
    is_admin?: boolean | null
    role?: string | null
    department?: string | null
  }
  const isAdminUser =
    Boolean(profileAdminFields.is_admin) ||
    (typeof profileAdminFields.role === "string" &&
      profileAdminFields.role.trim().toLowerCase() === "admin")

  const svcKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")
  if (!svcKey) {
    return jsonResponse({ ok: false, error: "server_config" }, 500)
  }
  const adminClient = createClient(supabaseUrl, svcKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const budgetGate = await assertDepartmentBudgetAllowed({
    adminClient,
    department: profileAdminFields.department ?? null,
    estimatedCostUsd: readDeepResearchEstimatedUsd(),
    isAdmin: isAdminUser,
  })
  if (!budgetGate.ok) {
    return jsonResponse({ ok: false, error: budgetGate.message }, 402)
  }

  const anthropicKey = readEnv("ANTHROPIC_API_KEY")
  const openaiKey = readEnv("OPENAI_API_KEY")
  const googleKey = readGoogleApiKey()

  type TaskSpec = {
    label: ModelLabel
    run: () => Promise<ResearchSuccess>
  }

  const tasks: TaskSpec[] = []

  if (anthropicKey) {
    tasks.push({
      label: "Claude",
      run: () => runClaudeResearch(prompt, anthropicKey),
    })
  }
  if (openaiKey) {
    tasks.push({
      label: "GPT",
      run: () => runOpenAiResearch(prompt, openaiKey),
    })
  }
  if (googleKey) {
    tasks.push({
      label: "Gemini",
      run: () => runGeminiResearch(prompt, googleKey),
    })
  }

  if (tasks.length === 0) {
    return jsonResponse(
      {
        ok: false,
        error:
          "ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY(또는 GEMINI_API_KEY) 중 하나 이상이 필요합니다.",
      },
      503,
    )
  }

  const settled = await Promise.allSettled(tasks.map((t) => t.run()))

  const successes: ResearchSuccess[] = []
  const failures: string[] = []

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i]
    const label = tasks[i].label
    if (outcome.status === "fulfilled") {
      if (outcome.value.text.length > 0) {
        successes.push(outcome.value)
      } else {
        failures.push(`${label}: empty_response`)
      }
    } else {
      const msg = outcome.reason instanceof Error
        ? outcome.reason.message
        : String(outcome.reason)
      console.error(`[deep-research] ${label} failed:`, msg)
      failures.push(`${label}: ${msg}`)
    }
  }

  if (successes.length === 0) {
    return jsonResponse(
      {
        ok: false,
        error: "모든 AI 모델 호출에 실패했습니다.",
        failures,
      },
      502,
    )
  }

  const modelsUsed = successes.map((s) => s.label)

  if (!anthropicKey) {
    const merged = successes
      .map((s) => `## [${s.label}]\n${s.text}`)
      .join("\n\n---\n\n")
    return jsonResponse({
      ok: true,
      content: merged,
      modelsUsed,
      note: "편집장(Claude) 키가 없어 개별 분석 결과를 이어 붙였습니다.",
    })
  }

  try {
    const anthropic = createAnthropic({ apiKey: anthropicKey })
    const editorPrompt = buildEditorPrompt(prompt, successes)
    const { text: fused } = await generateText({
      model: anthropic(CLAUDE_MODEL),
      system: EDITOR_SYSTEM,
      prompt: editorPrompt,
      maxOutputTokens: 8192,
    })

    const content = fused.trim()
    if (!content.length) {
      return jsonResponse(
        { ok: false, error: "편집장 융합 결과가 비어 있습니다." },
        502,
      )
    }

    return jsonResponse({
      ok: true,
      content,
      modelsUsed,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[deep-research] editor pass failed:", msg)
    const fallback = successes
      .map((s) => `## [${s.label}]\n${s.text}`)
      .join("\n\n---\n\n")
    return jsonResponse({
      ok: true,
      content: fallback,
      modelsUsed,
      note: `편집장 융합 실패로 개별 결과를 반환합니다: ${msg}`,
    })
  }
})
