import { supabase } from '../lib/supabase'

export type AssistantStatus = 'mock' | 'partial' | 'ready' | 'deprecated'
export type AssistantCostLevel = 'low' | 'medium' | 'high'

export interface AssistantRegistryEntry {
  id: string
  assistant_id: string
  name: string
  description: string | null
  category: string
  function_name: string
  status: AssistantStatus
  enabled: boolean
  default_model: string | null
  fallback_model: string | null
  cost_level: AssistantCostLevel
  permission_scopes: string[]
  task_types: string[]
  max_execution_ms: number
  sort_order: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface AssistantLog {
  id: string
  user_id: string
  assistant_name: string
  task_description: string
  result_text: string | null
  created_at: string
}

export interface FetchAssistantRegistryOptions {
  includeUnavailable?: boolean
}

const ASSISTANT_REGISTRY_COLUMNS = [
  'id',
  'assistant_id',
  'name',
  'description',
  'category',
  'function_name',
  'status',
  'enabled',
  'default_model',
  'fallback_model',
  'cost_level',
  'permission_scopes',
  'task_types',
  'max_execution_ms',
  'sort_order',
  'metadata',
  'created_at',
  'updated_at',
].join(',')

/**
 * Reads Assistant metadata only. This does not route or invoke an Assistant.
 * RLS limits non-admin users to enabled Assistants that are ready for use.
 */
export async function fetchAssistantRegistry(
  options: FetchAssistantRegistryOptions = {}
): Promise<AssistantRegistryEntry[]> {
  let query = supabase
    .from('assistant_registry')
    .select(ASSISTANT_REGISTRY_COLUMNS)
    .order('sort_order', { ascending: true })

  if (!options.includeUnavailable) {
    query = query.eq('enabled', true).in('status', ['partial', 'ready'])
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch assistant registry: ${error.message}`)
  }

  return (data ?? []) as unknown as AssistantRegistryEntry[]
}

export async function invokeAssistant<T = unknown>(
  assistantName: string,
  payload?: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(assistantName, {
    body: payload ?? {},
  })

  if (error) {
    throw new Error(error.message)
  }

  return data as T
}

export async function fetchAssistantLogs(limit = 10): Promise<AssistantLog[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('ai_assistant_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Failed to fetch assistant logs:', error)
    return []
  }

  return data as AssistantLog[]
}
