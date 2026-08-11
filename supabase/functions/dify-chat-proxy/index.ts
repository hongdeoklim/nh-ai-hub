import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { handleCorsPreflight, jsonResponse, withCors } from "../_shared/cors.ts"
import { getTokenWeight } from "../_shared/token-costs.ts"

/**
 * NH AI Inside Hub - Dify Chat Proxy
 * 프론트엔드 통신 에러 방지 및 사내 토큰 한도/비용 통제를 수행합니다.
 */

// DIFY_API_URL 시크릿(베이스 URL)로 오버라이드 가능 — dify-sync-webhook 과 동일 규약.
// TODO: Dify 서버에 TLS 인증서 적용 후 기본값을 https 로 전환할 것 (현재 서버가 HTTPS 미지원).
const DIFY_BASE_URL = (Deno.env.get("DIFY_API_URL") || "http://dify.nhnetworks.co.kr").replace(/\/$/, "")
const DIFY_API_URL = `${DIFY_BASE_URL}/v1/chat-messages`

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  try {
    const authHeader = req.headers.get("Authorization")
    const difyKeyHeader = req.headers.get("x-dify-key")
    const requestBody = await req.text()

    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401)
    }

    // 1. JWT 기반 사용자 인증
    const token = authHeader.replace(/^Bearer\s+/i, "")
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser()
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized or invalid session" }, 401)
    }

    const adminClient = createClient(supabaseUrl, svcKey)

    // 2. 사용자 토큰 잔액 검사
    const { data: profile } = await adminClient
      .from("users")
      .select("token_limit, current_token_usage")
      .eq("id", user.id)
      .single()

    if (profile) {
      // token_limit 0 = 무제한 (ai-chat 과 동일 정책)
      const limit = Number(profile.token_limit ?? 0)
      if (limit > 0 && Number(profile.current_token_usage ?? 0) >= limit) {
        return jsonResponse(
          { error: "월간 토큰 한도를 초과하여 AI 요청을 처리할 수 없습니다. 관리자에게 문의하세요." },
          403
        )
      }
    }

    // 3. 실제 사내 Dify 서버로 포워딩
    const difyKey = difyKeyHeader || Deno.env.get("DIFY_API_KEY") || ""
    const difyResponse = await fetch(DIFY_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${difyKey}`,
        "Content-Type": "application/json",
      },
      body: requestBody,
    })

    if (!difyResponse.ok) {
      const errorText = await difyResponse.text()
      console.error("[dify-chat-proxy] Upstream Error:", difyResponse.status, errorText)
      return new Response(errorText, {
        status: difyResponse.status,
        headers: withCors({ "Content-Type": "application/json" }),
      })
    }

    // 4. SSE 스트림 가로채기 및 토큰 사용량 차감
    if (!difyResponse.body) {
      return new Response("No body in response", { status: 500 })
    }

    let promptWeight = getTokenWeight("dify-ax")
    let completionWeight = getTokenWeight("dify-ax")
    let promptText: string | null = null
    try {
      const parsedBody = JSON.parse(requestBody)
      if (parsedBody.query) {
        promptText = parsedBody.query.substring(0, 200)
      }
      const { data: modelData } = await adminClient
        .from("ai_models")
        .select("prompt_weight, completion_weight")
        .eq("api_id", "dify-ax")
        .maybeSingle()
      if (modelData) {
        promptWeight = Number(modelData.prompt_weight) || promptWeight
        completionWeight = Number(modelData.completion_weight) || completionWeight
      }
    } catch (e) {
      console.error("Dify request parsing or weight fetch error", e)
    }

    // SSE 파싱용 버퍼 — 청크 경계에서 잘린 message_end 이벤트 유실(정산 누락)과
    // 멀티바이트 문자 깨짐을 막기 위해 단일 decoder + 줄 버퍼를 유지한다.
    const sseDecoder = new TextDecoder()
    let sseBuffer = ""
    const settleLine = (line: string) => {
      if (!line.trim().startsWith("data: ")) return
      try {
        const data = JSON.parse(line.trim().slice(6))
        if (data.event === "message_end" && data.metadata?.usage) {
          const promptTokens = data.metadata.usage.prompt_tokens || 0
          const completionTokens = data.metadata.usage.completion_tokens || 0
          const costTokens = (promptTokens * promptWeight) + (completionTokens * completionWeight)

          const settlement = Promise.all([
            adminClient.rpc("increment_token_usage", {
              target_user_id: user.id,
              amount: costTokens
            }).then(({ error }) => {
              if (error) {
                return adminClient.from("users")
                  .update({ current_token_usage: (profile?.current_token_usage || 0) + costTokens })
                  .eq("id", user.id)
              }
            }),
            adminClient.from("token_logs").insert({
              user_id: user.id,
              ai_model: "dify-ax",
              prompt_tokens: promptTokens * promptWeight,
              completion_tokens: completionTokens * completionWeight,
              total_cost: costTokens,
              prompt_text: promptText
            })
          ]).catch(err => console.error("Token log error:", err))
          // 응답 종료 직후 워커가 회수돼도 정산 Promise 가 완료되도록 등록
          ;(globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
            .EdgeRuntime?.waitUntil?.(settlement)
        }
      } catch (_e) {
        // 불완전 청크 파싱 실패는 무시
      }
    }
    const transformStream = new TransformStream({
      flush() {
        // 스트림이 개행 없이 끝나면 버퍼에 남은 마지막 이벤트도 정산한다
        sseBuffer += sseDecoder.decode() // 멀티바이트 꼬리 바이트 최종 플러시
        if (sseBuffer.trim().length > 0) settleLine(sseBuffer)
      },
      transform(chunk, controller) {
        controller.enqueue(chunk)

        // 토큰 정산 (비동기)
        sseBuffer += sseDecoder.decode(chunk, { stream: true })
        const lines = sseBuffer.split("\n")
        sseBuffer = lines.pop() || ""
        for (const line of lines) {
          settleLine(line)
        }
      }
    })

    const stream = difyResponse.body.pipeThrough(transformStream)
    return new Response(stream, {
      status: difyResponse.status,
      headers: withCors({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }),
    })
  } catch (err: any) {
    console.error("[dify-chat-proxy] Fatal Error:", err.message)
    return jsonResponse({ error: err.message || "Proxy routing failed" }, 500)
  }
}

Deno.serve(handler)
