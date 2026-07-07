import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"

/**
 * cad-convert — 브라우저 CAD 에디터가 DWG를 열 때 호출.
 * 로그인 사용자의 JWT를 검증한 뒤, 그 사용자 소유로 dwg_to_dxf 작업을 cad_jobs에 큐잉한다.
 * 로컬 에이전트가 변환 후 result.dxf_text 로 DXF를 돌려주면 브라우저가 그것을 연다.
 *
 * verify_jwt=false (config.toml) — 내부에서 사용자 JWT를 직접 검증한다.
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })
}

const WORKSPACE = "C:\\NH-AI-HUB-workspace\\"

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors })
  if (req.method !== "POST") return json({ error: "POST required" }, 405)

  const url = Deno.env.get("SUPABASE_URL") ?? ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  const { data: userData } = await createClient(url, anonKey).auth.getUser(bearer)
  if (!userData.user) return json({ error: "unauthorized" }, 401)

  let body: { filename?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: "invalid json" }, 400)
  }

  const filename = String(body.filename ?? "").trim()
  // 경로 탈출 차단: 파일명만 허용(구분자·상위경로 금지), .dwg 확장자.
  if (!filename || /[\\/]|\.\./.test(filename) || !/\.dwg$/i.test(filename)) {
    return json({ error: "작업 폴더의 .dwg 파일명만 입력하세요 (경로 불가)." }, 400)
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: job, error } = await admin
    .from("cad_jobs")
    .insert({
      command: "dwg_to_dxf",
      params: { path: WORKSPACE + filename },
      status: "pending",
      risk_tier: "safe",
      project_classification: "general",
      requested_by: userData.user.id,
    })
    .select("id")
    .single()

  if (error) return json({ error: error.message }, 500)
  return json({ job_id: job.id })
})
