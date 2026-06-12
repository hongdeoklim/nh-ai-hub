export const PROMPT_TEMPLATE_DEPARTMENTS = [
  '공통',
  '시설공사부',
  'IT개발부',
  '농업연수부',
  '경영지원부',
] as const

export type PromptTemplateDepartment = (typeof PROMPT_TEMPLATE_DEPARTMENTS)[number]

export type PromptTemplateRow = {
  id: string
  target_department: PromptTemplateDepartment
  title: string
  prompt_content: string
  is_active: boolean
  created_at: string
  updated_at: string
}
