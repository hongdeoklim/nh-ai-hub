/**
 * 플러그인 브릿지 함수(plugin-*-bridge) 공용 내부 인증.
 * 이 함수들은 `verify_jwt=false`(Authorization 헤더를 Jira/Slack/GitHub 등
 * 실제 3rd-party 자격증명 전달용으로 쓰기 때문)라서, Supabase 게이트웨이의
 * JWT 검증 대신 별도의 공유 시크릿으로 "우리 서버가 호출한 요청"인지
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

/** 내부 시크릿을 받아도 되는 호스트: 이 프로젝트의 SUPABASE_URL + (로컬 개발용) PLUGIN_BRIDGE_INTERNAL_HOSTS */
function trustedFunctionHosts(): Set<string> {
  const hosts = new Set<string>()
  const base = Deno.env.get("SUPABASE_URL")?.trim()
  if (base) {
    try {
      hosts.add(new URL(base).host.toLowerCase())
    } catch {
      /* 잘못된 SUPABASE_URL 은 무시 */
    }
  }
  for (const host of (Deno.env.get("PLUGIN_BRIDGE_INTERNAL_HOSTS") ?? "").split(",")) {
    const trimmed = host.trim().toLowerCase()
    if (trimmed) hosts.add(trimmed)
  }
  return hosts
}

/**
 * 우리 Supabase 프로젝트의 Edge Function 주소인지.
 * 관리자가 등록한 제3자 플러그인 URL 로 시크릿이 나가면, 그 한 값으로 모든 브릿지와
 * CAD 게이트웨이를 통과할 수 있으므로 반드시 이 검사를 거친 뒤에만 붙인다.
 */
export function isInternalFunctionUrl(target: string): boolean {
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return false
  }
  if (!url.pathname.startsWith("/functions/v1/")) return false
  return trustedFunctionHosts().has(url.host.toLowerCase())
}

/** 내부 함수 주소일 때만 `X-NH-Internal-Secret` 헤더를 만든다 (그 밖에는 빈 객체) */
export function internalBridgeHeaders(target: string): Record<string, string> {
  const secret = Deno.env.get("PLUGIN_BRIDGE_INTERNAL_SECRET")?.trim()
  if (!secret || !isInternalFunctionUrl(target)) return {}
  return { "X-NH-Internal-Secret": secret }
}

/**
 * plugin-connections 의 연결 테스트 요청인지 (`{ health_check: true }`).
 * 브릿지는 이때 실제 작업(메시지 전송·이미지 생성 등) 대신 자격 증명만 가볍게 확인해야 한다.
 */
export function isHealthCheckRequest(body: unknown): boolean {
  return Boolean(
    body && typeof body === "object" && (body as { health_check?: unknown }).health_check === true,
  )
}
