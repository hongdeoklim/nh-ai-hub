import { supabase } from '../lib/supabase'

export interface AssistantLog {
  id: string
  user_id: string
  assistant_name: string
  task_description: string
  result_text: string | null
  created_at: string
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
