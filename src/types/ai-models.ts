export type AiModelProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'deepseek'
  | 'hermes'

/** 채팅 UI — 공급자 드롭다운 + 라우팅 선호. 'auto' 는 자동 라우팅 */
export type AiProviderPreference = AiModelProvider | 'auto'

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
  deepseek: 'DeepSeek',
  hermes: 'Hermes',
}

/** 포털·관리자·모델 선택: Gemini → GPT → Claude → DeepSeek → Hermes */
export const AI_MODEL_PROVIDER_ORDER: AiModelProvider[] = [
  'google',
  'openai',
  'anthropic',
  'deepseek',
  'hermes',
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
