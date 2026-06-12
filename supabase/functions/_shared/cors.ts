/** Supabase Edge Function 브라우저 CORS (프리플라이트 + 스트리밍 응답 공통) */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
}

/** OPTIONS 프리플라이트 — 204 No Content + CORS 헤더 */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  return null
}

export function withCors(
  extra: Record<string, string> = {},
): Record<string, string> {
  return { ...corsHeaders, ...extra }
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: withCors({
      "Content-Type": "application/json",
      ...extraHeaders,
    }),
  })
}
