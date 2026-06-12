/**
 * [29단계] 7일 지연 DLP 마스킹 배치
 *
 * 매일 실행 — created_at 이 7일 이상 경과하고 is_dlp_checked = false 인
 * chat_messages 행의 content 를 마스킹 후 is_dlp_checked = true 로 갱신합니다.
 *
 * 환경 변수 (Supabase Dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CRON_SECRET — 선택: x-cron-secret 헤더 검증
 *
 * 수동 트리거 (service_role):
 *   curl -X POST "$SUPABASE_URL/functions/v1/daily-dlp-masking" \
 *     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
 *     -H "Content-Type: application/json" \
 *     -d '{"dryRun":false,"batchSize":200}'
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createClient } from "npm:@supabase/supabase-js@2.49.8"

import { contentWasMasked, maskSensitiveText } from "../_shared/dlpHelper.ts"

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
}

const RETENTION_DAYS = 7
const DEFAULT_BATCH_SIZE = 200
const MAX_BATCH_SIZE = 1000

type ChatMessageRow = {
  id: string
  content: string
  created_at: string
}

type MaskJobBody = {
  dryRun?: boolean
  batchSize?: number
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

function retentionCutoffIso(): string {
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS)
  return cutoff.toISOString()
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "POST 만 허용됩니다." }, 405)
  }

  const supabaseUrl = readEnv("SUPABASE_URL")
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ ok: false, error: "서버 설정 오류" }, 500)
  }

  if (!assertCronOrServiceAuth(req, serviceKey)) {
    return jsonResponse({ ok: false, error: "인증 실패" }, 401)
  }

  let body: MaskJobBody = {}
  try {
    const raw = await req.text()
    if (raw.trim().length > 0) {
      body = JSON.parse(raw) as MaskJobBody
    }
  } catch {
    return jsonResponse({ ok: false, error: "JSON 본문 형식 오류" }, 400)
  }

  const dryRun = body.dryRun === true
  const batchSize = Math.min(
    MAX_BATCH_SIZE,
    Math.max(1, body.batchSize ?? DEFAULT_BATCH_SIZE),
  )

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const cutoffIso = retentionCutoffIso()

  const { data: rows, error: fetchErr } = await admin
    .from("chat_messages")
    .select("id, content, created_at")
    .eq("is_dlp_checked", false)
    .lte("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(batchSize)

  if (fetchErr) {
    console.error("[daily-dlp-masking] fetch", fetchErr.message)
    return jsonResponse(
      {
        ok: false,
        error: fetchErr.message,
        hint: "chat_messages.is_dlp_checked 컬럼 마이그레이션 적용 여부를 확인하세요.",
      },
      500,
    )
  }

  const candidates = (rows ?? []) as ChatMessageRow[]
  if (candidates.length === 0) {
    return jsonResponse({
      ok: true,
      dryRun,
      retentionDays: RETENTION_DAYS,
      cutoffIso,
      scanned: 0,
      updated: 0,
      maskedCount: 0,
      message: "마스킹 대상 메시지가 없습니다.",
    })
  }

  let updated = 0
  let maskedCount = 0
  const errors: string[] = []

  for (const row of candidates) {
    const original = row.content ?? ""
    const masked = maskSensitiveText(original)
    const wasMasked = contentWasMasked(original, masked)

    if (wasMasked) maskedCount += 1

    if (dryRun) {
      updated += 1
      continue
    }

    const { error: updateErr } = await admin
      .from("chat_messages")
      .update({
        content: masked,
        is_dlp_checked: true,
      })
      .eq("id", row.id)

    if (updateErr) {
      errors.push(`${row.id}: ${updateErr.message}`)
      continue
    }

    updated += 1
  }

  if (errors.length > 0) {
    console.error("[daily-dlp-masking] partial errors", errors)
  }

  return jsonResponse({
    ok: errors.length === 0 || updated > 0,
    dryRun,
    retentionDays: RETENTION_DAYS,
    cutoffIso,
    scanned: candidates.length,
    updated,
    maskedCount,
    uncheckedRemaining: candidates.length - updated,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  })
})
