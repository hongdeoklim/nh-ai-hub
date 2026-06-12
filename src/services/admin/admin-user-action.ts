import { supabase } from '../../lib/supabase'

export type AppUserRole = 'admin' | 'user'

export type AdminUserCreatePayload = {
  email: string
  display_name: string
  department: string | null
  job_title: string | null
  role: AppUserRole
  password?: string
}

export type AdminUserUpdatePayload = {
  user_id: string
  email?: string
  display_name?: string
  department?: string | null
  job_title?: string | null
  role?: AppUserRole
}

type AdminUserActionResponse =
  | {
      ok: true
      user_id?: string
      temporary_password?: string
    }
  | {
      ok: false
      error: string
    }

async function invokeAdminUserAction(
  body: Record<string, unknown>,
): Promise<AdminUserActionResponse> {
  const { data, error } = await supabase.functions.invoke('admin-user-action', {
    body,
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  const payload = data as AdminUserActionResponse | null
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: '응답 형식 오류' }
  }

  if ('ok' in payload && payload.ok === false) {
    return { ok: false, error: payload.error ?? '요청 실패' }
  }

  return payload as Extract<AdminUserActionResponse, { ok: true }>
}

export async function adminCreateUser(
  payload: AdminUserCreatePayload,
): Promise<
  | { ok: true; user_id: string; temporary_password?: string }
  | { ok: false; error: string }
> {
  const result = await invokeAdminUserAction({
    action: 'create',
    email: payload.email.trim().toLowerCase(),
    display_name: payload.display_name.trim(),
    department: payload.department?.trim() || null,
    job_title: payload.job_title?.trim() || null,
    role: payload.role,
    password: payload.password?.trim() || undefined,
  })

  if (!result.ok) return result
  return {
    ok: true,
    user_id: result.user_id ?? '',
    temporary_password: result.temporary_password,
  }
}

export async function adminUpdateUser(
  payload: AdminUserUpdatePayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await invokeAdminUserAction({
    action: 'update',
    user_id: payload.user_id,
    email: payload.email?.trim().toLowerCase(),
    display_name: payload.display_name?.trim(),
    department: payload.department,
    job_title: payload.job_title,
    role: payload.role,
  })

  if (!result.ok) return result
  return { ok: true }
}

export async function adminDeleteUser(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await invokeAdminUserAction({
    action: 'delete',
    user_id: userId,
  })

  if (!result.ok) return result
  return { ok: true }
}
