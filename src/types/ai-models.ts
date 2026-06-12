export type AiModelProvider = 'anthropic' | 'openai' | 'google'

export type AiModelType = 'text' | 'image' | 'video'

export type AiModelRow = {
  id: string
  provider: AiModelProvider
  display_name: string
  api_id: string
  model_type: AiModelType
  hint: string | null
  cost_info: string | null
  description: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export const AI_MODEL_PROVIDER_LABELS: Record<AiModelProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google (Gemini)',
}

/** 포털·관리자 공통: Gemini → GPT → Anthropic */
export const AI_MODEL_PROVIDER_ORDER: AiModelProvider[] = [
  'google',
  'openai',
  'anthropic',
]

export type ModelSelectOption = {
  id: string
  label: string
  hint: string
  costInfo: string
  description: string
}

export type ModelSelectVersionRow = {
  id: string
  label: string
  hint?: string
  costInfo?: string
  description?: string
}
