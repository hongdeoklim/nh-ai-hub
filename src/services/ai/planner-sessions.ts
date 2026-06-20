import type { CoreMessage } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '../../lib/supabase'
import type { PlannerFullResult } from './planner-client'

export const PLANNER_SESSIONS_UPDATED_EVENT = 'nh-ai:planner-sessions-updated'

export interface PlannerSessionRow {
  id: string
  user_id: string
  title: string
  preferred_model: string
  messages: CoreMessage[]
  plan_result: PlannerFullResult | null
  created_at: string
  updated_at: string
}

export interface PlannerSessionSummary {
  id: string
  title: string
  updated_at: string
  message_count: number
  has_plan: boolean
}

function notifyPlannerSessionsUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PLANNER_SESSIONS_UPDATED_EVENT))
  }
}

function normalizeMessages(raw: unknown): CoreMessage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const role = (item as { role?: string }).role
      const content = (item as { content?: unknown }).content
      if (role !== 'user' && role !== 'assistant' && role !== 'system') return null
      if (typeof content !== 'string' || !content.trim()) return null
      return { role, content: content.trim() } as CoreMessage
    })
    .filter(Boolean) as CoreMessage[]
}

function normalizePlanResult(raw: unknown): PlannerFullResult | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Partial<PlannerFullResult>
  if (
    !row.prdMarkdown &&
    !row.specMarkdown &&
    !row.mermaidFlow &&
    !row.wireframeHtml
  ) {
    return null
  }
  return {
    prdMarkdown: row.prdMarkdown ?? '',
    specMarkdown: row.specMarkdown ?? '',
    mermaidFlow: row.mermaidFlow ?? '',
    wireframeHtml: row.wireframeHtml ?? '',
  }
}

export function derivePlannerSessionTitle(messages: CoreMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  if (!firstUser || typeof firstUser.content !== 'string') return '새 기획'
  const trimmed = firstUser.content.trim().replace(/\s+/g, ' ')
  if (!trimmed) return '새 기획'
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed
}

export async function fetchPlannerSessionSummaries(
  client: SupabaseClient = supabase,
  limit = 40,
): Promise<PlannerSessionSummary[]> {
  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user) return []

  const { data, error } = await client
    .from('planner_sessions')
    .select('id, title, updated_at, messages, plan_result')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.warn('[planner-sessions] list failed', error.message)
    return []
  }

  return (data ?? []).map((row) => {
    const messages = normalizeMessages(row.messages)
    return {
      id: row.id,
      title: row.title?.trim() || '새 기획',
      updated_at: row.updated_at,
      message_count: messages.length,
      has_plan: Boolean(normalizePlanResult(row.plan_result)),
    }
  })
}

export async function fetchPlannerSession(
  client: SupabaseClient,
  sessionId: string,
): Promise<{ ok: true; session: PlannerSessionRow } | { ok: false; message: string }> {
  const { data, error } = await client
    .from('planner_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (error) {
    return { ok: false, message: error.message }
  }
  if (!data) {
    return { ok: false, message: 'not_found' }
  }

  return {
    ok: true,
    session: {
      ...data,
      messages: normalizeMessages(data.messages),
      plan_result: normalizePlanResult(data.plan_result),
    } as PlannerSessionRow,
  }
}

export async function createPlannerSession(
  client: SupabaseClient = supabase,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user) {
    return { ok: false, message: '로그인이 필요합니다.' }
  }

  const { data, error } = await client
    .from('planner_sessions')
    .insert({
      user_id: user.id,
      title: '새 기획',
      preferred_model: 'auto',
      messages: [],
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    return { ok: false, message: error?.message ?? '세션 생성 실패' }
  }

  notifyPlannerSessionsUpdated()
  return { ok: true, id: data.id }
}

export async function savePlannerSession(
  client: SupabaseClient,
  sessionId: string,
  payload: {
    messages: CoreMessage[]
    preferredModel?: string
    planResult?: PlannerFullResult | null
    title?: string
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const messages = payload.messages
    .filter((m) => typeof m.content === 'string' && m.content.trim())
    .map((m) => ({
      role: m.role,
      content: (m.content as string).trim().slice(0, 32000),
    }))

  const title =
    payload.title?.trim() ||
    (messages.some((m) => m.role === 'user')
      ? derivePlannerSessionTitle(messages as CoreMessage[])
      : '새 기획')

  const update: Record<string, unknown> = {
    title,
    messages,
    updated_at: new Date().toISOString(),
  }

  if (payload.preferredModel) {
    update.preferred_model = payload.preferredModel
  }
  if (payload.planResult !== undefined) {
    update.plan_result = payload.planResult
  }

  const { error } = await client
    .from('planner_sessions')
    .update(update)
    .eq('id', sessionId)

  if (error) {
    return { ok: false, message: error.message }
  }

  notifyPlannerSessionsUpdated()
  return { ok: true }
}

export async function renamePlannerSession(
  client: SupabaseClient,
  sessionId: string,
  title: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const next = title.trim()
  if (!next) {
    return { ok: false, message: '제목을 입력해 주세요.' }
  }

  const { error } = await client
    .from('planner_sessions')
    .update({ title: next.slice(0, 120), updated_at: new Date().toISOString() })
    .eq('id', sessionId)

  if (error) {
    return { ok: false, message: error.message }
  }

  notifyPlannerSessionsUpdated()
  return { ok: true }
}

export async function deletePlannerSession(
  client: SupabaseClient,
  sessionId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await client.from('planner_sessions').delete().eq('id', sessionId)

  if (error) {
    return { ok: false, message: error.message }
  }

  notifyPlannerSessionsUpdated()
  return { ok: true }
}
