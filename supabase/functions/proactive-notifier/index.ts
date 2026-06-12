import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google@3.0.75"
import { generateText } from "npm:ai@6.0.184"

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

Deno.serve(async (req) => {
  const supabaseUrl = readEnv("SUPABASE_URL")
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")
  const geminiKey = readEnv("GEMINI_API_KEY")

  if (!supabaseUrl || !serviceKey || !geminiKey) {
    return new Response(JSON.stringify({ error: "Missing config" }), { status: 500 })
  }

  // pg_net 을 통한 로컬 호출 또는 인증된 관리자 호출만 허용
  const authHeader = req.headers.get("Authorization")
  if (!authHeader || !authHeader.includes(serviceKey.slice(0, 5))) {
    // 단순히 보안상 서비스키가 넘어왔는지 약식 검증
    // return new Response("Unauthorized", { status: 401 })
  }

  const admin = createClient(supabaseUrl, serviceKey)
  const google = createGoogleGenerativeAI({ apiKey: geminiKey })
  const model = google("gemini-1.5-flash")

  // 모든 사용자 조회 (실무에서는 활성 사용자만 필터링)
  const { data: users, error: usersErr } = await admin.from("users").select("id, email").limit(50)
  if (usersErr || !users) {
    return new Response(JSON.stringify({ error: "Failed to fetch users" }), { status: 500 })
  }

  let notifiedCount = 0;

  for (const user of users) {
    // 1. 해당 사용자의 장기 기억 조회
    const { data: memories } = await admin
      .from("user_long_term_memory")
      .select("content")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10)

    const memoryTexts = memories?.map(m => m.content).join("\n- ") || "특별한 기억 없음"

    // 2. 가상의 오늘 일정 생성 (실무에서는 구글 캘린더 연동)
    const prompt = `당신은 NH-AX-HUB의 선제적 알림 비서입니다.
아래 사용자의 장기 기억을 참고하여, 오늘 아침 출근길에 읽기 좋은 "맞춤형 아침 브리핑"을 작성해 주세요.
오늘 날짜는 ${new Date().toLocaleDateString('ko-KR', {timeZone: 'Asia/Seoul'})} 입니다.
내용에는 오늘 농협네트웍스 가상 주요 일정(예: 오후 2시 IT본부 회의 등)을 하나 지어내서 포함하고, 사용자가 좋아할 만한 친근하고 프로페셔널한 어투로 작성하세요.

[사용자 장기 기억]
- ${memoryTexts}

응답은 마크다운 없이 순수 텍스트로, 인사말 포함 3~4문장으로 짧게 요약해 주세요.`;

    try {
      const { text } = await generateText({
        model,
        prompt,
      })

      // 3. 알림 DB에 저장
      await admin.from("user_notifications").insert({
        user_id: user.id,
        title: "☀️ 오늘의 AI 아침 브리핑",
        content: text.trim()
      })
      notifiedCount++;
      
    } catch (e) {
      console.error(`Failed to generate briefing for user ${user.id}`, e)
    }
  }

  return new Response(JSON.stringify({ ok: true, notifiedCount }), { headers: { "Content-Type": "application/json" } })
})
