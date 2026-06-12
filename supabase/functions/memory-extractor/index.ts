import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google@3.0.75"
import { generateText } from "npm:ai@6.0.184"

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  // 이 함수는 백엔드 내부(혹은 인증된 요청)로만 호출되어야 하므로 서비스키로 검증하거나 내부 로직으로 보호
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Auth" }), { status: 401, headers: corsHeaders })
  }

  const supabaseUrl = readEnv("SUPABASE_URL")
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")
  const geminiKey = readEnv("GEMINI_API_KEY")

  if (!supabaseUrl || !serviceKey || !geminiKey) {
    return new Response(JSON.stringify({ error: "Server config missing" }), { status: 500, headers: corsHeaders })
  }

  let body
  try {
    body = await req.json()
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders })
  }

  const { userId, messages } = body
  if (!userId || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "Missing userId or messages" }), { status: 400, headers: corsHeaders })
  }

  const admin = createClient(supabaseUrl, serviceKey)

  // 1. 대화 내역 포맷팅
  const chatLog = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content : '[복합 컨텐츠]'}`)
    .join('\n\n')

  // 2. Gemini를 통한 기억 추출
  const google = createGoogleGenerativeAI({ apiKey: geminiKey })
  const model = google("gemini-1.5-flash")

  const prompt = `다음은 사용자와 AI의 최근 대화 내역입니다. 
당신은 AI 시스템의 '장기 기억 관리자(Long-term Memory Extractor)'입니다.
이 대화에서 사용자의 명시적인 선호도, 취향, 팩트(직무, 역할 등), 지시사항(예: "앞으로 보고서는 개조식으로 써줘")이 발견되면 그것을 추출하십시오.
단기적인 인사말이나, 흔한 대화, 특정 일회성 업무 지시는 추출하지 마십시오. 오직 '앞으로의 대화에서도 계속 기억해야 할 영구적인 사실/규칙'만 추출하십시오.

추출할 내용이 있다면, 아래 JSON 형식으로 응답하십시오. 추출할 내용이 전혀 없다면 빈 배열을 반환하십시오.

응답 형식:
[
  {
    "memory_type": "preference" | "fact" | "style",
    "content": "추출한 구체적인 사실 또는 규칙 한 문장"
  }
]

대화 내역:
${chatLog}
`

  try {
    const { text } = await generateText({
      model,
      prompt,
    })

    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim()
    const extracted = JSON.parse(cleanedText)

    if (Array.isArray(extracted) && extracted.length > 0) {
      for (const item of extracted) {
        if (item.content && item.memory_type) {
          // DB에 삽입 (중복 방지를 위한 로직은 단순화: 그냥 삽입)
          await admin.from("user_long_term_memory").insert({
            user_id: userId,
            memory_type: item.memory_type,
            content: item.content
          })
        }
      }
    }
    
    return new Response(JSON.stringify({ ok: true, extracted_count: extracted.length }), { headers: corsHeaders })

  } catch (e: any) {
    console.error("[memory-extractor] Error:", e)
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
  }
})
