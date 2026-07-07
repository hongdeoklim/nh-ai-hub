/**
 * 플러그인 브릿지 함수(plugin-*-bridge) 공용 내부 인증.
 * 이 함수들은 `verify_jwt=false`(Authorization 헤더를 Jira/Slack/GitHub 등
 * 실제 3rd-party 자격증명 전달용으로 쓰기 때문)라서, Supabase 게이트웨이의
 * JWT 검증 대신 별도의 공유 시크릿으로 "우리 ai-chat 서버가 호출한 요청"인지
 * 확인해 임의 인터넷 요청이 우리 서버를 익명 프록시로 악용하지 못하게 막는다.
 */
export function verifyInternalBridgeSecret(req: Request): Response | null {
  const expected = Deno.env.get("PLUGIN_BRIDGE_INTERNAL_SECRET")?.trim()
  const provided = req.headers.get("X-NH-Internal-Secret")?.trim()
  if (!expected || !provided || provided !== expected) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized bridge caller" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }
  return null
}
