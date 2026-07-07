import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { verifyInternalBridgeSecret } from "../_shared/plugin-bridge-auth.ts"

/**
 * GitHub REST API 브릿지 — `nh.plugin.github` 플러그인의 endpoint_url.
 * (원래 마켓플레이스 시드에서는 extension_type='mcp'였지만, 실제 GitHub MCP 서버를
 * 별도로 호스팅해야 하는 부담 없이 동일 가치를 제공하기 위해 일반 plugin 타입
 * REST 브릿지로 구현함 — 2026-07-07 마이그레이션에서 전환.)
 * 인증: 사용자가 연결한 GitHub Personal Access Token 이
 * `Authorization: Bearer <token>` 헤더로 전달된다(auth_type='bearer').
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type, x-nh-internal-secret",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    })
  }

  const unauthorized = verifyInternalBridgeSecret(req)
  if (unauthorized) return unauthorized

  let body: { arguments?: { query?: string; per_page?: number } }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400)
  }

  const pat = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim()
  if (!pat) return json({ ok: false, error: "GitHub Personal Access Token 이 연결되지 않았습니다. /marketplace 에서 먼저 연결하세요." }, 400)

  const query = body.arguments?.query?.trim()
  if (!query) {
    return json({
      ok: false,
      error: "query 인자가 필요합니다 (GitHub 검색 문법 사용 가능, 예: 'repo:org/name is:open label:bug').",
    }, 400)
  }
  const perPage = Math.min(Math.max(body.arguments?.per_page ?? 10, 1), 30)

  const searchUrl = "https://api.github.com/search/issues?" + new URLSearchParams({
    q: query,
    per_page: String(perPage),
  })

  try {
    const res = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15_000),
    })
    const text = await res.text()
    if (!res.ok) {
      return json({ ok: false, status: res.status, error: text.slice(0, 1000) || `GitHub API 오류 (${res.status})` }, 502)
    }
    const payload = JSON.parse(text) as {
      total_count?: number
      items?: Array<{
        number: number
        title: string
        state: string
        html_url: string
        pull_request?: unknown
        user?: { login?: string }
        updated_at?: string
        repository_url?: string
      }>
    }
    const items = (payload.items ?? []).map((item) => ({
      number: item.number,
      title: item.title,
      state: item.state,
      type: item.pull_request ? "pull_request" : "issue",
      author: item.user?.login ?? "",
      updated_at: item.updated_at ?? "",
      repo: item.repository_url?.replace("https://api.github.com/repos/", "") ?? "",
      url: item.html_url,
    }))
    return json({ ok: true, total: payload.total_count ?? items.length, items })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ ok: false, error: msg }, 502)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  })
}
