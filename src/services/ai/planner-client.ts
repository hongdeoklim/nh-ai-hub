import type { ModelMessage } from 'ai'

import { supabase } from '../../lib/supabase'
import { AI_PLANNER_FUNCTION, fetchEdgeFunction } from './api'

export interface PlannerFullResult {
  prdMarkdown: string
  specMarkdown: string
  mermaidFlow: string
  wireframeHtml: string
}

function isCompletePlannerResult(value: unknown): value is PlannerFullResult {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<Record<keyof PlannerFullResult, unknown>>
  return (
    typeof row.prdMarkdown === 'string' && Boolean(row.prdMarkdown.trim()) &&
    typeof row.specMarkdown === 'string' && Boolean(row.specMarkdown.trim()) &&
    typeof row.mermaidFlow === 'string' && Boolean(row.mermaidFlow.trim()) &&
    typeof row.wireframeHtml === 'string' && Boolean(row.wireframeHtml.trim())
  )
}

export interface PlannerChatResult {
  text: string
  truncated: boolean
}

async function invokePlanner(params: {
  mode: 'chat' | 'generate'
  messages: ModelMessage[]
  preferredModel?: string
}): Promise<
  | { ok: true; text?: string; truncated?: boolean; result?: PlannerFullResult }
  | { ok: false; message: string }
> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    return { ok: false, message: '로그인 세션이 없습니다. 다시 로그인해 주세요.' }
  }

  let res: Response
  try {
    res = await fetchEdgeFunction(AI_PLANNER_FUNCTION, {
      method: 'POST',
      accessToken: session.access_token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: params.mode,
        messages: params.messages,
        preferredAi: params.preferredModel ?? 'auto',
      }),
    })
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : 'AI Planner 요청에 실패했습니다.',
    }
  }

  let body: {
    ok?: boolean
    error?: string
    text?: string
    truncated?: boolean
    result?: PlannerFullResult
  } = {}

  try {
    body = (await res.json()) as typeof body
  } catch {
    return {
      ok: false,
      message: `AI Planner 오류 (${res.status})`,
    }
  }

  if (!res.ok || !body.ok) {
    return {
      ok: false,
      message: body.error ?? `AI Planner 오류 (${res.status})`,
    }
  }

  return { ok: true, text: body.text, truncated: body.truncated, result: body.result }
}

export async function chatWithPlanner(
  messages: ModelMessage[],
  preferredModel: string = 'auto',
): Promise<PlannerChatResult> {
  const result = await invokePlanner({
    mode: 'chat',
    messages,
    preferredModel,
  })

  if (!result.ok) {
    throw new Error(result.message)
  }

  const text = result.text?.trim()
  if (!text) {
    throw new Error('AI Planner가 빈 답변을 반환했습니다. 다시 시도해 주세요.')
  }
  return { text, truncated: Boolean(result.truncated) }
}

export async function generateProductPlan(
  messages: ModelMessage[],
  preferredModel: string = 'auto',
): Promise<PlannerFullResult> {
  const result = await invokePlanner({
    mode: 'generate',
    messages,
    preferredModel,
  })

  if (!result.ok) {
    throw new Error(result.message)
  }

  if (!isCompletePlannerResult(result.result)) {
    throw new Error(
      'AI Planner 응답에 PRD, 기능 명세, 유저 플로우 또는 와이어프레임이 누락됐습니다. 다시 생성해 주세요.',
    )
  }

  return result.result
}
