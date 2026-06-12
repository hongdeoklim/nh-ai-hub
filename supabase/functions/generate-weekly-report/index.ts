import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createAnthropic } from "npm:@ai-sdk/anthropic@3.0.78"
import { createOpenAI } from "npm:@ai-sdk/openai@3.0.64"
import { generateText } from "npm:ai@6.0.184"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
}

const MAX_SAMPLES = 400
const MAX_CHARS_PER_LINE = 600
const MAX_CORPUS_CHARS = 48_000

const SYSTEM_PROMPT =
  "너는 사내 AI 시스템 분석가야. 다음 로그들을 보고 가장 많이 나온 키워드 5개와 전체적인 직원들의 활용 트렌드를 3줄로 요약해 줘."

type CorpusLine = {
  source: string
  created_at: string
  text: string
}

type WeeklyReportLlmResult = {
  top_keywords: string[]
  summary: string
}

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function truncateText(text: string, max = MAX_CHARS_PER_LINE): string {
  const t = text.trim().replace(/\s+/g, " ")
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

function sampleLines(lines: CorpusLine[], maxSamples: number): CorpusLine[] {
  if (lines.length <= maxSamples) return lines
  const step = Math.ceil(lines.length / maxSamples)
  const out: CorpusLine[] = []
  for (let i = 0; i < lines.length; i += step) {
    out.push(lines[i])
    if (out.length >= maxSamples) break
  }
  return out
}

function mondayReportDate(d: Date): Date {
  const copy = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  )
  const day = copy.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setUTCDate(copy.getUTCDate() + diff)
  return copy
}

function periodForReportMonday(monday: Date): {
  reportDate: string
  periodStart: string
  periodEnd: string
} {
  const end = new Date(monday)
  end.setUTCHours(0, 0, 0, 0)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 7)
  const reportDate = end.toISOString().slice(0, 10)
  return {
    reportDate,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
  }
}

function buildCorpusText(lines: CorpusLine[]): string {
  const sampled = sampleLines(lines, MAX_SAMPLES)
  let body = sampled
    .map(
      (l, i) =>
        `[${i + 1}] (${l.source} · ${l.created_at})\n${truncateText(l.text)}`,
    )
    .join("\n\n")
  if (body.length > MAX_CORPUS_CHARS) {
    body = `${body.slice(0, MAX_CORPUS_CHARS)}\n\n…(truncated)`
  }
  return body
}

function parseLlmJson(raw: string): WeeklyReportLlmResult | null {
  const trimmed = raw.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed)
  const candidate = fence ? fence[1].trim() : trimmed
  try {
    const parsed = JSON.parse(candidate) as WeeklyReportLlmResult
    if (!Array.isArray(parsed.top_keywords) || typeof parsed.summary !== "string") {
      return null
    }
    const keywords = parsed.top_keywords
      .map((k) => String(k).trim())
      .filter((k) => k.length > 0)
      .slice(0, 5)
    const summary = parsed.summary.trim()
    if (!keywords.length || !summary.length) return null
    return { top_keywords: keywords, summary }
  } catch {
    return null
  }
}

function assertCronOrServiceAuth(
  req: Request,
  serviceKey: string,
): boolean {
  const cronSecret = readEnv("CRON_SECRET")
  if (cronSecret) {
    const header = req.headers.get("x-cron-secret")
    if (header === cronSecret) return true
  }

  const auth = req.headers.get("Authorization") ?? ""
  if (auth === `Bearer ${serviceKey}`) return true

  const apiKey = req.headers.get("apikey")
  if (apiKey === serviceKey) return true

  return false
}

async function fetchWeeklyCorpus(
  supabaseAdmin: ReturnType<typeof createClient>,
  periodStart: string,
  periodEnd: string,
): Promise<CorpusLine[]> {
  const lines: CorpusLine[] = []

  const [teamMsgs, sessionMsgs, sessions] = await Promise.all([
    supabaseAdmin
      .from("chat_messages")
      .select("content, role, created_at, conversation_id")
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd)
      .eq("role", "user")
      .order("created_at", { ascending: true })
      .limit(5000),
    supabaseAdmin
      .from("chat_session_messages")
      .select("content, role, created_at, session_id")
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd)
      .eq("role", "user")
      .order("created_at", { ascending: true })
      .limit(5000),
    supabaseAdmin
      .from("chat_sessions")
      .select("id, title, created_at")
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd)
      .order("created_at", { ascending: true })
      .limit(500),
  ])

  if (teamMsgs.error) console.error("[weekly-report] chat_messages", teamMsgs.error)
  if (sessionMsgs.error) {
    console.error("[weekly-report] chat_session_messages", sessionMsgs.error)
  }
  if (sessions.error) console.error("[weekly-report] chat_sessions", sessions.error)

  for (const row of teamMsgs.data ?? []) {
    const content = String((row as { content?: string }).content ?? "").trim()
    if (!content.length) continue
    lines.push({
      source: "team_chat_messages",
      created_at: String((row as { created_at: string }).created_at),
      text: content,
    })
  }

  for (const row of sessionMsgs.data ?? []) {
    const content = String((row as { content?: string }).content ?? "").trim()
    if (!content.length) continue
    lines.push({
      source: "chat_session_messages",
      created_at: String((row as { created_at: string }).created_at),
      text: content,
    })
  }

  for (const row of sessions.data ?? []) {
    const title = String((row as { title?: string }).title ?? "").trim()
    if (!title.length) continue
    lines.push({
      source: "chat_sessions",
      created_at: String((row as { created_at: string }).created_at),
      text: `[세션] ${title}`,
    })
  }

  lines.sort((a, b) => a.created_at.localeCompare(b.created_at))
  return lines
}

async function analyzeWithLlm(corpus: string): Promise<WeeklyReportLlmResult> {
  const anthropicKey = readEnv("ANTHROPIC_API_KEY")
  const openaiKey = readEnv("OPENAI_API_KEY")

  const modelId =
    readEnv("WEEKLY_REPORT_MODEL") ??
    "claude-3-5-sonnet-20241022"

  const userPrompt = `${SYSTEM_PROMPT}

반드시 아래 JSON 형식만 출력하세요(다른 설명 금지):
{"top_keywords":["키워드1","키워드2","키워드3","키워드4","키워드5"],"summary":"3줄 이내 종합 요약"}

--- 대화 로그 (${corpus.length} chars) ---
${corpus}`

  if (anthropicKey) {
    const anthropic = createAnthropic({ apiKey: anthropicKey })
    const { text } = await generateText({
      model: anthropic(modelId),
      system:
        "You are an internal analytics assistant. Respond with valid JSON only.",
      prompt: userPrompt,
      maxOutputTokens: 1024,
    })
    const parsed = parseLlmJson(text)
    if (parsed) return parsed
    throw new Error("LLM JSON parse failed (anthropic)")
  }

  if (openaiKey) {
    const openai = createOpenAI({ apiKey: openaiKey })
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system:
        "You are an internal analytics assistant. Respond with valid JSON only.",
      prompt: userPrompt,
      maxOutputTokens: 1024,
    })
    const parsed = parseLlmJson(text)
    if (parsed) return parsed
    throw new Error("LLM JSON parse failed (openai)")
  }

  throw new Error("ANTHROPIC_API_KEY or OPENAI_API_KEY required")
}

function fallbackReport(lines: CorpusLine[]): WeeklyReportLlmResult {
  const freq = new Map<string, number>()
  const stop = new Set([
    "그리고",
    "하지만",
    "입니다",
    "합니다",
    "please",
    "the",
    "and",
    "for",
  ])
  for (const line of lines) {
    const tokens = line.text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !stop.has(t))
    for (const t of tokens) {
      freq.set(t, (freq.get(t) ?? 0) + 1)
    }
  }
  const top_keywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k)

  const summary =
    lines.length === 0
      ? "분석 기간 내 DB에 수집된 대화 로그가 없습니다. 팀 채팅 또는 chat_sessions 동기화 후 다시 실행하세요."
      : `총 ${lines.length}건의 사용자 발화를 집계했습니다.\n팀 공유 채팅과 개인 세션 로그를 기반으로 키워드를 추출했습니다.\nLLM 키 미설정 시 규칙 기반 요약이 적용되었습니다.`

  return {
    top_keywords: top_keywords.length ? top_keywords : ["(데이터 부족)"],
    summary,
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "POST only" }, 405)
  }

  const supabaseUrl = readEnv("SUPABASE_URL")
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ ok: false, error: "server_config" }, 500)
  }

  if (!assertCronOrServiceAuth(req, serviceKey)) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401)
  }

  let body: { report_date?: string; force?: boolean } = {}
  try {
    const raw = await req.text()
    if (raw.trim().length) body = JSON.parse(raw) as typeof body
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400)
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const monday = body.report_date
    ? mondayReportDate(new Date(`${body.report_date}T00:00:00.000Z`))
    : mondayReportDate(new Date())

  const { reportDate, periodStart, periodEnd } = periodForReportMonday(monday)

  if (!body.force) {
    const { data: existing } = await supabaseAdmin
      .from("weekly_ai_reports")
      .select("id")
      .eq("report_date", reportDate)
      .maybeSingle()
    if (existing?.id) {
      return jsonResponse({
        ok: true,
        skipped: true,
        report_date: reportDate,
        message: "Report already exists. Use force=true to regenerate.",
      })
    }
  }

  try {
    const corpusLines = await fetchWeeklyCorpus(
      supabaseAdmin,
      periodStart,
      periodEnd,
    )
    const corpusText = buildCorpusText(corpusLines)

    let result: WeeklyReportLlmResult
    let generatedByAi = true
    try {
      result = corpusText.length
        ? await analyzeWithLlm(corpusText)
        : fallbackReport(corpusLines)
    } catch (llmErr) {
      console.error("[weekly-report] LLM failed, using fallback", llmErr)
      result = fallbackReport(corpusLines)
      generatedByAi = false
    }

    const topKeywordsJson = result.top_keywords.map((keyword, index) => ({
      rank: index + 1,
      keyword,
    }))

    if (body.force) {
      await supabaseAdmin
        .from("weekly_ai_reports")
        .delete()
        .eq("report_date", reportDate)
    }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("weekly_ai_reports")
      .insert({
        report_date: reportDate,
        period_start: periodStart,
        period_end: periodEnd,
        top_keywords: topKeywordsJson,
        summary: result.summary,
        generated_by_ai: generatedByAi,
      })
      .select("id, report_date")
      .single()

    if (insErr || !inserted) {
      return jsonResponse(
        { ok: false, error: insErr?.message ?? "insert_failed" },
        500,
      )
    }

    return jsonResponse({
      ok: true,
      id: inserted.id,
      report_date: inserted.report_date,
      sample_count: corpusLines.length,
      generated_by_ai: generatedByAi,
      period_start: periodStart,
      period_end: periodEnd,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[weekly-report]", msg)
    return jsonResponse({ ok: false, error: msg }, 500)
  }
})
