import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { handleCorsPreflight, jsonResponse, withCors } from "../_shared/cors.ts"
import { getTokenWeight } from "../_shared/token-costs.ts"

/**
 * NH AI Inside Hub - Dify Chat Proxy
 * 프론트엔드 통신 에러 방지 및 사내 토큰 한도/비용 통제를 수행합니다.
 */

const DIFY_API_URL = "http://dify.nhnetworks.co.kr/v1/chat-messages"

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
      if (profile.current_token_usage >= profile.token_limit) {
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

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk)
        
        // 토큰 정산 (비동기)
        const decoder = new TextDecoder()
        const text = decoder.decode(chunk)
        const lines = text.split("\n")
        for (const line of lines) {
          if (line.trim().startsWith("data: ")) {
            try {
              const data = JSON.parse(line.trim().slice(6))
              if (data.event === "message_end" && data.metadata?.usage) {
                const promptTokens = data.metadata.usage.prompt_tokens || 0
                const completionTokens = data.metadata.usage.completion_tokens || 0
                const totalRaw = promptTokens + completionTokens
                
                // 가중치 적용
                const costTokens = (promptTokens * promptWeight) + (completionTokens * completionWeight)

                // 백그라운드 DB 기록
                Promise.all([
                  adminClient.rpc("increment_token_usage", {
                    target_user_id: user.id,
                    amount: costTokens
                  }).then(({ error }) => {
                    if (error) {
                      // RPC 없으면 fallback
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
              }
            } catch (e) {
              // Parse error on incomplete chunk
            }
          }
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
