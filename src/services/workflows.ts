import { supabase } from '../lib/supabase'

export interface WorkflowRow {
  id: string
  user_id: string
  title: string
  description: string | null
  category: string
  system_prompt: string
  created_at: string
}

export async function fetchMyWorkflows(): Promise<WorkflowRow[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('user_workflows')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch workflows:', error)
    return []
  }
  return data as WorkflowRow[]
}

export async function createWorkflow(payload: {
  title: string
  description?: string
  category: string
  system_prompt: string
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
      system_prompt: payload.system_prompt
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create workflow:', error)
    return null
  }
  return data as WorkflowRow
}
