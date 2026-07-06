/**
 * Phase 6 — cad-job-gateway Edge Function
 *
 * 역할:
 *   1. Anthropic tool_use 블록 또는 직접 요청을 받아 cad_jobs에 INSERT
 *   2. 요청 전 allowed_programs 테이블로 화이트리스트 검증
 *   3. risk_tier='destructive'는 즉시 거부, pending_approval 상태로 큐잉
 *   4. project_classification='confidential' 시 전송 경고 메시지 포함
 *
 * 인증: dify-sync-webhook과 동일한 패턴
 *   - SUPABASE_SERVICE_ROLE_KEY 직접 일치
 *   - CAD_GATEWAY_SECRET (전용 웹훅 시크릿)
 *   - 관리자 JWT
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts"

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

interface ToolUseBlock {
  type: "tool_use"
  id: string
  name: string
  input: Record<string, unknown>
}

interface CadJobRequest {
  /** Anthropic tool_use 블록 (단일) */
  tool_use?: ToolUseBlock
  /** 또는 직접 지정 */
  command?: string
  params?: Record<string, unknown>
  project_classification?: "general" | "confidential"
  requested_by?: string
}

interface AllowedProgram {
  command_name: string
  exe_path: string
  arg_template: string[]
  allowed_input_roots: string[]
  risk_tier: "safe" | "destructive"
  enabled: boolean
}

// ---------------------------------------------------------------------------
// 인증 (dify-sync-webhook 패턴 동일)
// ---------------------------------------------------------------------------

async function authorize(
  req: Request,
  admin: ReturnType<typeof createClient>,
  anonKey: string,
  serviceKey: string,
): Promise<boolean> {
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? ""

  if (bearer === serviceKey) return true

  const gatewaySecret = Deno.env.get("CAD_GATEWAY_SECRET")
  if (gatewaySecret && bearer === gatewaySecret) return true

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const { data } = await createClient(supabaseUrl, anonKey).auth.getUser(bearer)
  if (!data.user) return false

  const { data: profile } = await admin
    .from("users")
    .select("is_admin")
    .eq("id", data.user.id)
    .maybeSingle()

  return profile?.is_admin === true
}

// ---------------------------------------------------------------------------
// 화이트리스트 검증
// ---------------------------------------------------------------------------

interface ValidationResult {
  ok: boolean
  program?: AllowedProgram
  errorMessage?: string
  requiresApproval?: boolean
}

async function validateCommand(
  admin: ReturnType<typeof createClient>,
  command: string,
  params: Record<string, unknown>,
  riskTierOverride?: string,
): Promise<ValidationResult> {
  // allowed_programs 조회
  const { data, error } = await admin
    .from("allowed_programs")
    .select("*")
    .eq("command_name", command)
    .eq("enabled", true)
    .maybeSingle()

  if (error) {
    return { ok: false, errorMessage: `DB 오류: ${error.message}` }
  }

  if (!data) {
    return { ok: false, errorMessage: `허용되지 않은 명령: '${command}'` }
  }

  const program = data as AllowedProgram

  // risk_tier 판정 (job 요청값과 DB값 중 더 위험한 쪽 적용)
  const effectiveTier =
    riskTierOverride === "destructive" || program.risk_tier === "destructive"
      ? "destructive"
      : "safe"

  if (effectiveTier === "destructive") {
    return {
      ok: false,
      requiresApproval: true,
      program,
      errorMessage: `파괴적 명령 '${command}'은 사람 승인이 필요합니다.`,
    }
  }

  // 경로 탈출 검증
  const pathParams = extractPaths(params)
  const allowedRoots: string[] = program.allowed_input_roots ?? []

  if (allowedRoots.length > 0) {
    for (const p of pathParams) {
      if (!isUnderAllowedRoot(p, allowedRoots)) {
        return {
          ok: false,
          errorMessage: `경로 '${p}'는 허용된 입력 경로 밖입니다.`,
        }
      }
    }
  }

  return { ok: true, program }
}

function extractPaths(params: Record<string, unknown>): string[] {
  const paths: string[] = []
  for (const v of Object.values(params)) {
    if (typeof v === "string" && (v.endsWith(".dwg") || v.endsWith(".dxf") || v.includes("\\"))) {
      paths.push(v)
    }
  }
  return paths
}

function isUnderAllowedRoot(filePath: string, roots: string[]): boolean {
  const norm = filePath.replace(/\//g, "\\").toLowerCase()
  return roots.some((root) => norm.startsWith(root.replace(/\//g, "\\").toLowerCase()))
}

// ---------------------------------------------------------------------------
// 메인 핸들러
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== "POST") return jsonResponse({ error: "POST required." }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  if (!(await authorize(req, admin, anonKey, serviceKey))) {
    return jsonResponse({ error: "Forbidden." }, 403)
  }

  // 요청 파싱
  const body = await req.json().catch(() => ({})) as CadJobRequest

  // Anthropic tool_use 블록 → command/params로 변환
  let command: string
  let params: Record<string, unknown>

  if (body.tool_use) {
    command = body.tool_use.name
    params = body.tool_use.input ?? {}
  } else if (body.command) {
    command = body.command
    params = body.params ?? {}
  } else {
    return jsonResponse({ error: "command 또는 tool_use 블록이 필요합니다." }, 400)
  }

  const classification = body.project_classification ?? "general"
  const requestedBy = body.requested_by ?? null
  const riskTierOverride = (params._risk_tier as string | undefined)

  // 화이트리스트 검증
  const validation = await validateCommand(admin, command, params, riskTierOverride)

  if (!validation.ok) {
    if (validation.requiresApproval) {
      // destructive → pending_approval로 큐잉
      const { data: job, error: insertErr } = await admin
        .from("cad_jobs")
        .insert({
          command,
          params,
          status: "pending_approval",
          risk_tier: "destructive",
          project_classification: classification,
          requested_by: requestedBy,
        })
        .select("id")
        .single()

      if (insertErr) {
        return jsonResponse({ error: insertErr.message }, 500)
      }

      const approvalMessage = [
        `⚠️ **승인 필요**: \`${command}\`은 파괴적 명령입니다.`,
        `작업 ID \`${job.id}\`가 **승인 대기** 상태로 등록되었습니다.`,
        `관리자가 승인하면 자동으로 실행됩니다.`,
        classification === "confidential"
          ? "\n🔒 **기밀 프로젝트**: 도면 데이터가 외부로 전송될 수 있습니다."
          : "",
      ].filter(Boolean).join("\n")

      return jsonResponse({
        status: "pending_approval",
        job_id: job.id,
        message: approvalMessage,
      }, 202)
    }

    return jsonResponse({ error: validation.errorMessage }, 400)
  }

  // 정상 → pending으로 큐잉
  const effectiveRisk = validation.program?.risk_tier ?? "safe"

  const { data: job, error: insertErr } = await admin
    .from("cad_jobs")
    .insert({
      command,
      params,
      status: "pending",
      risk_tier: effectiveRisk,
      project_classification: classification,
      requested_by: requestedBy,
    })
    .select("id")
    .single()

  if (insertErr) {
    return jsonResponse({ error: insertErr.message }, 500)
  }

  const responseMessage = classification === "confidential"
    ? `✅ 작업 \`${job.id}\`가 등록되었습니다.\n🔒 기밀 프로젝트: 전송 전 민감 메타데이터가 마스킹됩니다.`
    : `✅ 작업 \`${job.id}\`가 등록되었습니다.`

  return jsonResponse({
    status: "pending",
    job_id: job.id,
    command,
    message: responseMessage,
  }, 201)
})
