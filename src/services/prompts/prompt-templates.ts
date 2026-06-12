import type { SupabaseClient } from '@supabase/supabase-js'

import type { StaticOrgPromptItem } from '../../data/org-static-prompts'
import { ORG_PROMPT_CARD_DESCRIPTION_BY_TITLE } from '../../data/org-static-prompts'
import type { PromptTemplateRow } from '../../types/prompt-templates'

function truncateCardHint(text: string, max = 96): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

/** 활성 템플릿만 반환(Supabase RLS). 유저 부서는 호출 측에서 추가 필터. */
export async function fetchActivePromptTemplates(
  supabase: SupabaseClient,
): Promise<{ ok: true; rows: PromptTemplateRow[] } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .from('prompt_templates')
    .select(
      'id, target_department, title, prompt_content, is_active, created_at, updated_at',
    )
    .eq('is_active', true)
    .order('target_department', { ascending: true })
    .order('title', { ascending: true })

  if (error) {
    console.error('[prompt-templates] 활성 목록 조회 실패', error)
    return { ok: false, message: error.message }
  }

  const rows = (data ?? []) as PromptTemplateRow[]
  return { ok: true, rows }
}

export function filterTemplatesForUserDepartment(
  rows: PromptTemplateRow[],
  userDepartment: string | null | undefined,
): PromptTemplateRow[] {
  const dept = userDepartment?.trim() ?? ''
  return rows.filter((row) => {
    if (row.target_department === '공통') return true
    if (!dept) return false
    return row.target_department.trim() === dept
  })
}

export function promptTemplateRowToOrgItem(row: PromptTemplateRow): StaticOrgPromptItem {
  const hint =
    ORG_PROMPT_CARD_DESCRIPTION_BY_TITLE[row.title] ??
    truncateCardHint(row.prompt_content.replace(/^\[템플릿\]\s*[^\n]*\n*/i, ''))

  return {
    id: row.id,
    title: row.title,
    description: hint,
    content: row.prompt_content,
  }
}
