import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { verifyInternalBridgeSecret } from "../_shared/plugin-bridge-auth.ts"

/**
 * Higgsfield AI 이미지 생성 브릿지 — `nh.plugin.higgsfield` 플러그인의 endpoint_url.
 *
 * Higgsfield REST API (platform.higgsfield.ai):
 *   - 인증: `Authorization: Key {KEY_ID}:{KEY_SECRET}`
 *   - 제출: POST /v1/text2image/soul  { prompt, width_and_height, quality, batch_size }
 *   - 상태: GET  /requests/{request_id}/status
 * 사용자가 /marketplace 에서 연결한 자격증명(`KEY_ID:KEY_SECRET`)이
 * `X-Higgsfield-Key` 헤더로 전달된다(auth_type='api_key'). 브릿지가 이를
 * `Authorization: Key ...` 로 변환해 호출한다(원문 키는 응답에 노출하지 않음).
 *
 * 생성은 비동기라 제출 후 상태를 몇 차례 폴링한다. 시간 내 완료되면 이미지 URL을,
 * 아직 처리 중이면 request_id를 돌려준다.
 */

const HF_BASE = "https://platform.higgsfield.ai"
const POLL_INTERVAL_MS = 3000
const POLL_MAX_ATTEMPTS = 16 // ~48s

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-nh-internal-secret, x-higgsfield-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })
}

const ASPECT_TO_WH: Record<string, string> = {
  "1:1": "SQUARE_1536x1536",
  square: "SQUARE_1536x1536",
  "16:9": "WIDESCREEN_1536x864",
  "9:16": "PORTRAIT_864x1536",
  "4:3": "LANDSCAPE_1536x1152",
  "3:4": "PORTRAIT_1152x1536",
}

/** JSON 트리를 재귀 탐색해 이미지/미디어 URL로 보이는 문자열을 모은다(응답 스키마 변화에 견고). */
function collectMediaUrls(node: unknown, out: Set<string>) {
  if (!node) return
  if (typeof node === "string") {
    if (/^https?:\/\/\S+\.(png|jpe?g|webp|gif|mp4|webm)(\?\S*)?$/i.test(node)) out.add(node)
    return
  }
  if (Array.isArray(node)) {
    for (const v of node) collectMediaUrls(v, out)
    return
  }
  if (typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) collectMediaUrls(v, out)
  }
}

function extractStatus(payload: unknown): string {
  const p = payload as Record<string, unknown> | null
  const s = (p?.status ?? p?.state ?? (p?.job as Record<string, unknown>)?.status) as string | undefined
  return String(s ?? "").toLowerCase()
}

function extractRequestId(payload: unknown): string | null {
  const p = payload as Record<string, unknown> | null
  const id = p?.request_id ?? p?.id ?? p?.requestId ?? (p?.job as Record<string, unknown>)?.id
  return id ? String(id) : null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors })

  const unauthorized = verifyInternalBridgeSecret(req)
  if (unauthorized) return unauthorized

  let body: { arguments?: { prompt?: string; aspect_ratio?: string; quality?: string; seed?: number } }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400)
  }

  const key = req.headers.get("X-Higgsfield-Key")?.trim()
  if (!key || !key.includes(":")) {
    return json({
      ok: false,
      error: "Higgsfield API 키가 연결되지 않았습니다. /marketplace 에서 KEY_ID:KEY_SECRET 형식으로 먼저 연결하세요.",
    }, 400)
  }

  const prompt = body.arguments?.prompt?.trim()
  if (!prompt) return json({ ok: false, error: "prompt 인자가 필요합니다 (생성할 이미지 설명)." }, 400)

  const aspect = body.arguments?.aspect_ratio?.trim().toLowerCase() ?? "1:1"
  const width_and_height = ASPECT_TO_WH[aspect] ?? ASPECT_TO_WH["1:1"]
  const quality = body.arguments?.quality?.trim() || "1080p"

  const authHeader = { Authorization: `Key ${key}`, "Content-Type": "application/json" }

  // 1) 생성 제출
  let submitPayload: unknown
  try {
    const res = await fetch(`${HF_BASE}/v1/text2image/soul`, {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        prompt,
        width_and_height,
        quality,
        batch_size: "SINGLE",
        ...(typeof body.arguments?.seed === "number" ? { seed: body.arguments.seed } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    })
    const text = await res.text()
    if (!res.ok) {
      return json({ ok: false, status: res.status, error: text.slice(0, 800) || `Higgsfield 제출 실패 (${res.status})` }, 502)
    }
    submitPayload = text.length ? JSON.parse(text) : {}
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502)
  }

  const requestId = extractRequestId(submitPayload)
  if (!requestId) {
    // 일부 응답은 제출 즉시 결과를 담기도 하므로 URL을 바로 시도
    const urls = new Set<string>()
    collectMediaUrls(submitPayload, urls)
    if (urls.size > 0) return json({ ok: true, status: "completed", images: [...urls] })
    return json({ ok: false, error: "request_id 를 응답에서 찾지 못했습니다.", raw: submitPayload }, 502)
  }

  // 2) 상태 폴링
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    try {
      const res = await fetch(`${HF_BASE}/requests/${encodeURIComponent(requestId)}/status`, {
        headers: { Authorization: `Key ${key}` },
        signal: AbortSignal.timeout(15_000),
      })
      const text = await res.text()
      if (!res.ok) continue
      const payload = text.length ? JSON.parse(text) : {}
      const status = extractStatus(payload)

      if (status.includes("fail") || status.includes("error") || status.includes("cancel")) {
        return json({ ok: false, status, error: "생성에 실패했습니다.", raw: payload }, 502)
      }
      const urls = new Set<string>()
      collectMediaUrls(payload, urls)
      if (status.includes("complet") || status.includes("succeed") || status.includes("done") || urls.size > 0) {
        if (urls.size > 0) return json({ ok: true, status: "completed", request_id: requestId, images: [...urls] })
      }
    } catch {
      /* transient — keep polling */
    }
  }

  return json({
    ok: true,
    status: "processing",
    request_id: requestId,
    note: "아직 생성 중입니다. 잠시 후 다시 시도하거나 Higgsfield 대시보드에서 결과를 확인하세요.",
  })
})
