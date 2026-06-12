import type { SupabaseClient } from '@supabase/supabase-js'

export type TokenBulkScope = 'selected' | 'all' | 'department'

type RpcOk = { ok: true; updated_count?: number; delta?: number; scope?: string }
type RpcFail = { ok: false; error?: string }
type RpcPayload = RpcOk | RpcFail

function parseRpc(data: unknown): RpcPayload {
  if (data && typeof data === 'object' && 'ok' in data) {
    return data as RpcPayload
  }
  return { ok: false, error: 'invalid_response' }
}

export type OrgTokenPolicy = {
  reset_day_of_month: number | null
  last_auto_reset_at: string | null
  updated_at: string | null
}

export async function fetchOrgTokenPolicy(
  client: SupabaseClient,
): Promise<OrgTokenPolicy | null> {
  const { data, error } = await client
    .from('org_token_policy')
    .select('reset_day_of_month, last_auto_reset_at, updated_at')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    console.warn('[token-admin] org_token_policy load failed', error.message)
    return null
  }

  if (!data) return { reset_day_of_month: null, last_auto_reset_at: null, updated_at: null }

  return {
    reset_day_of_month:
      typeof data.reset_day_of_month === 'number' ? data.reset_day_of_month : null,
    last_auto_reset_at:
      typeof data.last_auto_reset_at === 'string' ? data.last_auto_reset_at : null,
    updated_at: typeof data.updated_at === 'string' ? data.updated_at : null,
  }
}

export async function adminBulkGrantTokenLimit(
  client: SupabaseClient,
  params: {
    delta: number
    scope: TokenBulkScope
    userIds?: string[]
    department?: string | null
  },
): Promise<{ ok: true; updatedCount: number } | { ok: false; message: string }> {
  const { data, error } = await client.rpc('admin_bulk_grant_token_limit', {
    p_delta: params.delta,
    p_scope: params.scope,
    p_user_ids: params.scope === 'selected' ? params.userIds ?? [] : null,
    p_department: params.scope === 'department' ? params.department?.trim() || null : null,
  })

  if (error) return { ok: false, message: error.message }

  const payload = parseRpc(data)
  if (!payload.ok) {
    return { ok: false, message: payload.error ?? '토큰 부여 실패' }
  }

  return { ok: true, updatedCount: payload.updated_count ?? 0 }
}

export async function adminBulkResetTokenUsage(
  client: SupabaseClient,
  params: {
    scope: TokenBulkScope
    userIds?: string[]
    department?: string | null
  },
): Promise<{ ok: true; updatedCount: number } | { ok: false; message: string }> {
  const { data, error } = await client.rpc('admin_bulk_reset_token_usage', {
    p_scope: params.scope,
    p_user_ids: params.scope === 'selected' ? params.userIds ?? [] : null,
    p_department: params.scope === 'department' ? params.department?.trim() || null : null,
  })

  if (error) return { ok: false, message: error.message }

  const payload = parseRpc(data)
  if (!payload.ok) {
    return { ok: false, message: payload.error ?? '사용량 초기화 실패' }
  }

  return { ok: true, updatedCount: payload.updated_count ?? 0 }
}

export async function adminSetTokenResetDay(
  client: SupabaseClient,
  resetDayOfMonth: number | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await client.rpc('admin_set_token_reset_day', {
    p_reset_day_of_month: resetDayOfMonth,
  })

  if (error) return { ok: false, message: error.message }

  const payload = parseRpc(data)
  if (!payload.ok) {
    return { ok: false, message: payload.error ?? '정책 저장 실패' }
  }

  return { ok: true }
}

/** 관리자 화면 진입 시 due면 자동 초기화 실행 */
export async function runAutoTokenUsageResetIfDue(
  client: SupabaseClient,
): Promise<void> {
  try {
    await client.rpc('run_auto_token_usage_reset_if_due')
  } catch {
    /* policy/RPC 미적용 DB — 무시 */
  }
}

export function dayOfMonthFromDateInput(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const day = Number(trimmed.split('-')[2])
  if (!Number.isFinite(day) || day < 1 || day > 28) return null
  return day
}

export function dateInputFromResetDay(day: number | null): string {
  if (day == null || day < 1 || day > 28) return ''
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatNextResetLabel(resetDay: number | null): string {
  if (resetDay == null) return '자동 초기화 꺼짐'
  const now = new Date()
  const kstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  let year = kstNow.getFullYear()
  let month = kstNow.getMonth()
  const today = kstNow.getDate()
  if (today > resetDay) {
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
  }
  return `매월 ${resetDay}일 00:00(KST) · 다음: ${year}-${String(month + 1).padStart(2, '0')}-${String(resetDay).padStart(2, '0')}`
}
