import { supabase } from '../lib/supabase'

export type WorkflowActionKey =
  | 'gmail_unread_summary'
  | 'calendar_upcoming_summary'

export type StepType = 'trigger' | 'data' | 'ai' | 'action' | 'condition' | 'save'

export type TriggerType = 'manual' | 'schedule' | 'email' | 'webhook'

export interface WorkflowStep {
  id: string
  type: StepType
  name: string
  config: Record<string, unknown>
}

export interface WorkflowRow {
  id: string
  user_id: string
  title: string
  description: string | null
  category: string
  system_prompt: string
  action_key: WorkflowActionKey | null
  action_config: Record<string, unknown>
  steps: WorkflowStep[]
  trigger_type: TriggerType
  trigger_config: Record<string, unknown>
  is_active: boolean
  last_run_at: string | null
  run_count: number
  created_at: string
  updated_at: string
}

export interface WorkflowRunRow {
  id: string
  workflow_id: string
  action_key: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  output: Record<string, unknown> | null
  error_message: string | null
  created_at: string
}

export interface StepRunRow {
  id: string
  run_id: string
  step_id: string
  step_type: string
  step_name: string
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  error_message: string | null
  started_at: string | null
  finished_at: string | null
}

export async function fetchMyWorkflows(): Promise<WorkflowRow[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('user_workflows')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return []
  return (data ?? []).map((r: any) => ({
    ...r,
    steps: r.steps ?? [],
    trigger_type: r.trigger_type ?? 'manual',
    trigger_config: r.trigger_config ?? {},
    last_run_at: r.last_run_at ?? null,
    run_count: r.run_count ?? 0,
  })) as WorkflowRow[]
}

export async function createWorkflow(payload: {
  title: string
  description?: string
  category: string
  system_prompt?: string
  action_key?: WorkflowActionKey | null
  action_config?: Record<string, unknown>
  steps?: WorkflowStep[]
  trigger_type?: TriggerType
  trigger_config?: Record<string, unknown>
}): Promise<WorkflowRow | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('user_workflows')
    .insert({
      user_id: user.id,
      title: payload.title,
      description: payload.description || null,
      category: payload.category,
      system_prompt: payload.system_prompt || '',
      action_key: payload.action_key ?? null,
      action_config: payload.action_config ?? {},
      steps: payload.steps ?? [],
      trigger_type: payload.trigger_type ?? 'manual',
      trigger_config: payload.trigger_config ?? {},
      is_active: true,
    })
    .select()
    .single()
  if (error) { console.error('createWorkflow:', error); return null }
  return data as WorkflowRow
}

export async function updateWorkflow(
  id: string,
  patch: Partial<Pick<WorkflowRow, 'title' | 'description' | 'steps' | 'trigger_type' | 'trigger_config' | 'is_active' | 'system_prompt' | 'category'>>,
): Promise<boolean> {
  const { error } = await supabase
    .from('user_workflows')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  return !error
}

export async function deleteWorkflow(id: string): Promise<boolean> {
  const { error } = await supabase.from('user_workflows').delete().eq('id', id)
  return !error
}

export async function executeWorkflow(
  workflowId: string,
  input: Record<string, unknown> = {},
): Promise<{ run_id: string; status: 'succeeded' | 'failed'; result?: unknown }> {
  const { data, error } = await supabase.functions.invoke('workflow-execute', {
    body: { workflow_id: workflowId, input },
  })
  if (error) throw new Error(error.message)
  const row = data as { run_id?: string; status?: string; result?: unknown; error?: string }
  if (!row.run_id || (row.status !== 'succeeded' && row.status !== 'failed')) {
    throw new Error(row.error || '워크플로우 실행 결과가 올바르지 않습니다.')
  }
  if (row.status === 'failed') {
    const resultError = row.result && typeof row.result === 'object' && 'error' in row.result
      ? String((row.result as { error?: unknown }).error ?? '')
      : ''
    throw new Error(resultError || row.error || '워크플로우 실행에 실패했습니다.')
  }
  return row as { run_id: string; status: 'succeeded'; result?: unknown }
}

export async function fetchWorkflowRuns(limit = 20): Promise<WorkflowRunRow[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('workflow_runs')
    .select('id, workflow_id, action_key, status, output, error_message, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return (data ?? []) as WorkflowRunRow[]
}
