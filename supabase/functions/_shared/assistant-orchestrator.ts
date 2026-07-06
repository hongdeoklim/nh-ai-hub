import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8'

import type { NHAssistantPlan } from './nh-smart-routing.ts'

export type AssistantOrchestrationResult =
  | { ok: true; assistantId: string; context: string; raw: unknown }
  | { ok: false; reason: string }

export async function executeSingleAssistant(input: {
  admin: SupabaseClient
  supabaseUrl: string
  serviceKey: string
  userId: string
  plan: NHAssistantPlan
  payload?: Record<string, unknown>
}): Promise<AssistantOrchestrationResult> {
  if (input.plan.selectionMode !== 'single' || input.plan.selectedAssistants.length !== 1) {
    return { ok: false, reason: 'single_assistant_only' }
  }
  const selected = input.plan.selectedAssistants[0]
  if (!selected.functionName || !/^assistant-\d{2}-[a-z0-9-]+$/.test(selected.functionName)) {
    return { ok: false, reason: 'invalid_function_name' }
  }

  if (selected.permissionScopes.some((scope) => scope.startsWith('gmail.') || scope.startsWith('calendar.'))) {
    const { data } = await input.admin
      .from('user_integration_accounts')
      .select('provider')
      .eq('user_id', input.userId)
      .eq('provider', 'google')
      .maybeSingle()
    if (!data) return { ok: false, reason: 'google_integration_required' }
  }

  try {
    const response = await fetch(`${input.supabaseUrl.replace(/\/$/, '')}/functions/v1/${selected.functionName}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(input.payload ?? {}), user_id: input.userId }),
      signal: AbortSignal.timeout(25_000),
    })
    const result = await response.json().catch(() => ({ success: false, error: 'invalid_assistant_response' })) as {
      success?: boolean
      message?: string
      error?: string
    }
    if (!response.ok || result.success === false) {
      return { ok: false, reason: result.error || `assistant_http_${response.status}` }
    }
    return {
      ok: true,
      assistantId: selected.assistantId,
      context: result.message?.trim() || JSON.stringify(result),
      raw: result,
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'assistant_execution_failed' }
  }
}
