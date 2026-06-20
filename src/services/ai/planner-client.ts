import type { CoreMessage } from 'ai'

import { supabase } from '../../lib/supabase'
import { AI_PLANNER_FUNCTION, fetchEdgeFunction } from './api'

export interface PlannerFullResult {
  prdMarkdown: string
  specMarkdown: string
  mermaidFlow: string
  wireframeHtml: string
}

async function invokePlanner(params: {
  mode: 'chat' | 'generate'
  messages: CoreMessage[]
  preferredModel?: string
}): Promise<
  | { ok: true; text?: string; result?: PlannerFullResult }
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

  return { ok: true, text: body.text, result: body.result }
}

export async function chatWithPlanner(
  messages: CoreMessage[],
  preferredModel: string = 'auto',
): Promise<string> {
  const result = await invokePlanner({
    mode: 'chat',
    messages,
    preferredModel,
  })

  if (!result.ok) {
    throw new Error(result.message)
  }

  return result.text ?? ''
}

export async function generateProductPlan(
  messages: CoreMessage[],
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

  return (
    result.result ?? {
      prdMarkdown: '',
      specMarkdown: '',
      mermaidFlow: '',
      wireframeHtml: '',
    }
  )
}
