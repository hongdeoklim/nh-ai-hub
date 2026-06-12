import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createClient } from "npm:@supabase/supabase-js@2.49.8"

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

type UserRole = "admin" | "user"

type AdminUserActionBody = {
  action: "create" | "update" | "delete"
  user_id?: string
  email?: string
  display_name?: string
  department?: string | null
  job_title?: string | null
  role?: UserRole
  password?: string
}

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function normalizeRole(value: unknown): UserRole {
  const r = String(value ?? "user").trim().toLowerCase()
  return r === "admin" ? "admin" : "user"
}

function randomTempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return btoa(String.fromCharCode(...bytes))
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 16) + "Aa1!"
}

async function assertAdmin(
  supabaseAdmin: ReturnType<typeof createClient>,
  actorId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, role, is_admin")
    .eq("id", actorId)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, status: 403, error: "관리자 권한이 없습니다." }
  }

  const row = data as { role?: string | null; is_admin?: boolean | null }
  const isAdmin =
    row.is_admin === true || String(row.role ?? "").trim().toLowerCase() === "admin"

  if (!isAdmin) {
    return { ok: false, status: 403, error: "관리자 권한이 없습니다." }
  }

  return { ok: true }
}

async function logActivity(
  supabaseAdmin: ReturnType<typeof createClient>,
  actorId: string,
  actionType: string,
  description: string,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc("log_admin_activity_for_user", {
    p_actor_user_id: actorId,
    p_action_type: actionType,
    p_description: description,
  })
  if (error) {
    console.error("[admin-user-action] activity log failed", error)
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "POST 만 허용됩니다." }, 405)
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ ok: false, error: "인증이 필요합니다." }, 401)
  }

  const supabaseUrl = readEnv("SUPABASE_URL")
  const anonKey = readEnv("SUPABASE_ANON_KEY")
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ ok: false, error: "서버 설정 오류" }, 500)
  }

  const jwt = authHeader.replace(/^Bearer\s+/i, "")
  const supabaseUser = createClient(supabaseUrl, anonKey)
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return jsonResponse({ ok: false, error: "세션이 유효하지 않습니다." }, 401)
  }

  const actorId = userData.user.id
  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const adminCheck = await assertAdmin(supabaseAdmin, actorId)
  if (!adminCheck.ok) {
    return jsonResponse({ ok: false, error: adminCheck.error }, adminCheck.status)
  }

  let body: AdminUserActionBody
  try {
    body = (await req.json()) as AdminUserActionBody
  } catch {
    return jsonResponse({ ok: false, error: "JSON 본문이 필요합니다." }, 400)
  }

  const action = body.action
  if (action !== "create" && action !== "update" && action !== "delete") {
    return jsonResponse({ ok: false, error: "action 이 올바르지 않습니다." }, 400)
  }

  if (action === "create") {
    const email = body.email?.trim().toLowerCase() ?? ""
    const displayName = body.display_name?.trim() ?? ""
    const department = body.department?.trim() || null
    const jobTitle = body.job_title?.trim() || null
    const role = normalizeRole(body.role)
    const password = body.password?.trim() || randomTempPassword()

    if (!email.length || !displayName.length) {
      return jsonResponse(
        { ok: false, error: "이메일과 이름은 필수입니다." },
        400,
      )
    }

    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      })

    if (createErr || !created.user) {
      return jsonResponse(
        { ok: false, error: createErr?.message ?? "사용자 생성 실패" },
        400,
      )
    }

    const newUserId = created.user.id

    const { error: profileErr } = await supabaseAdmin
      .from("users")
      .update({
        display_name: displayName,
        department,
        job_title: jobTitle,
        role,
        is_admin: role === "admin",
        email,
      })
      .eq("id", newUserId)

    if (profileErr) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId)
      return jsonResponse({ ok: false, error: profileErr.message }, 400)
    }

    await logActivity(
      supabaseAdmin,
      actorId,
      "user_add",
      `직원 등록: ${displayName} <${email}> (${role})`,
    )

    return jsonResponse({
      ok: true,
      user_id: newUserId,
      temporary_password: body.password?.trim() ? undefined : password,
    })
  }

  const targetId = body.user_id?.trim() ?? ""
  if (!targetId.length) {
    return jsonResponse({ ok: false, error: "user_id 가 필요합니다." }, 400)
  }

  if (action === "delete") {
    if (targetId === actorId) {
      return jsonResponse(
        { ok: false, error: "본인 계정은 삭제할 수 없습니다." },
        400,
      )
    }

    const { data: targetRow } = await supabaseAdmin
      .from("users")
      .select("email, display_name")
      .eq("id", targetId)
      .maybeSingle()

    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(targetId)
    if (delErr) {
      return jsonResponse({ ok: false, error: delErr.message }, 400)
    }

    const label =
      (targetRow as { display_name?: string; email?: string } | null)
        ?.display_name ??
      (targetRow as { email?: string } | null)?.email ??
      targetId

    await logActivity(
      supabaseAdmin,
      actorId,
      "user_delete",
      `직원 삭제: ${label}`,
    )

    return jsonResponse({ ok: true })
  }

  // update
  const displayName = body.display_name?.trim()
  const department =
    body.department === undefined ? undefined : body.department?.trim() || null
  const jobTitle =
    body.job_title === undefined ? undefined : body.job_title?.trim() || null
  const role = body.role === undefined ? undefined : normalizeRole(body.role)
  const email = body.email?.trim().toLowerCase()

  if (email) {
    const { error: authUpdErr } = await supabaseAdmin.auth.admin.updateUserById(
      targetId,
      { email },
    )
    if (authUpdErr) {
      return jsonResponse({ ok: false, error: authUpdErr.message }, 400)
    }
  }

  const profilePatch: Record<string, unknown> = {}
  if (displayName !== undefined && displayName.length > 0) {
    profilePatch.display_name = displayName
  }
  if (department !== undefined) profilePatch.department = department
  if (jobTitle !== undefined) profilePatch.job_title = jobTitle
  if (role !== undefined) {
    profilePatch.role = role
    profilePatch.is_admin = role === "admin"
  }
  if (email) profilePatch.email = email

  if (Object.keys(profilePatch).length === 0) {
    return jsonResponse({ ok: false, error: "변경할 필드가 없습니다." }, 400)
  }

  const { error: updErr } = await supabaseAdmin
    .from("users")
    .update(profilePatch)
    .eq("id", targetId)

  if (updErr) {
    return jsonResponse({ ok: false, error: updErr.message }, 400)
  }

  await logActivity(
    supabaseAdmin,
    actorId,
    "user_edit",
    `직원 수정: ${targetId}${email ? ` → ${email}` : ""}${role ? ` role=${role}` : ""}`,
  )

  return jsonResponse({ ok: true, user_id: targetId })
})
