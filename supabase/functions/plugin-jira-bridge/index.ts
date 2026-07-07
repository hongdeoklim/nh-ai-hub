import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { verifyInternalBridgeSecret } from "../_shared/plugin-bridge-auth.ts"

/**
 * Jira Cloud REST API 브릿지 — dynamic-plugin-tools.ts 의 createHttpProxyTool 이
 * 이 함수를 `nh.plugin.jira` 플러그인의 endpoint_url 로 호출한다.
 *
 * 인증: 사용자가 /marketplace 에서 연결한 Jira API 토큰이
 * `X-Api-Token` 헤더로 전달된다(auth_type='api_key', auth_header_name='X-Api-Token').
 * Jira Cloud REST API는 Basic 인증(email:token)을 쓰므로, 설치 시 입력한
 * install_config.jira_email 과 조합해 Basic Authorization 헤더를 만든다.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type, x-nh-internal-secret, x-api-token",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    })
  }

  const unauthorized = verifyInternalBridgeSecret(req)
  if (unauthorized) return unauthorized

  let body: {
    arguments?: { jql?: string; max_results?: number }
    install_config?: { jira_url?: string; jira_email?: string }
  }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400)
  }

  const apiToken = req.headers.get("X-Api-Token")?.trim()
  const jiraUrl = body.install_config?.jira_url?.trim()?.replace(/\/$/, "")
  const jiraEmail = body.install_config?.jira_email?.trim()

  if (!apiToken) return json({ ok: false, error: "Jira API 토큰이 연결되지 않았습니다. /marketplace 에서 먼저 연결하세요." }, 400)
  if (!jiraUrl || !jiraEmail) {
    return json({
      ok: false,
      error: "Jira 사이트 URL 과 계정 이메일이 설정되지 않았습니다. /marketplace 설치 설정에서 jira_url, jira_email 을 입력하세요.",
    }, 400)
  }
  if (!jiraUrl.startsWith("https://")) {
    return json({ ok: false, error: "jira_url 은 https:// 로 시작해야 합니다 (예: https://yourcompany.atlassian.net)" }, 400)
  }

  const jql = body.arguments?.jql?.trim()
  if (!jql) return json({ ok: false, error: "jql 인자가 필요합니다." }, 400)
  const maxResults = Math.min(Math.max(body.arguments?.max_results ?? 10, 1), 50)

  const basicAuth = btoa(`${jiraEmail}:${apiToken}`)
  const searchUrl = `${jiraUrl}/rest/api/3/search?` + new URLSearchParams({
    jql,
    maxResults: String(maxResults),
    fields: "summary,status,assignee,priority,updated,issuetype",
  })

  try {
    const res = await fetch(searchUrl, {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    })
    const text = await res.text()
    if (!res.ok) {
      return json({ ok: false, status: res.status, error: text.slice(0, 1000) || `Jira API 오류 (${res.status})` }, 502)
    }
    const payload = JSON.parse(text) as {
      total?: number
      issues?: Array<{
        key: string
        fields?: { summary?: string; status?: { name?: string }; assignee?: { displayName?: string }; priority?: { name?: string }; updated?: string; issuetype?: { name?: string } }
      }>
    }
    const issues = (payload.issues ?? []).map((issue) => ({
      key: issue.key,
      summary: issue.fields?.summary ?? "",
      status: issue.fields?.status?.name ?? "",
      assignee: issue.fields?.assignee?.displayName ?? "미배정",
      priority: issue.fields?.priority?.name ?? "",
      issue_type: issue.fields?.issuetype?.name ?? "",
      updated: issue.fields?.updated ?? "",
      url: `${jiraUrl}/browse/${issue.key}`,
    }))
    return json({ ok: true, total: payload.total ?? issues.length, issues })
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
