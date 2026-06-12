export type ActivityBadgeTone = 'create' | 'edit' | 'delete' | 'grant' | 'team' | 'neutral'

export type ActivityActionMeta = {
  label: string
  tone: ActivityBadgeTone
}

const ACTION_META: Record<string, ActivityActionMeta> = {
  user_add: { label: '직원 추가', tone: 'create' },
  user_edit: { label: '직원 수정', tone: 'edit' },
  user_delete: { label: '직원 삭제', tone: 'delete' },
  admin_prompt_create: { label: '프롬프트 생성', tone: 'create' },
  admin_prompt_edit: { label: '프롬프트 수정', tone: 'edit' },
  admin_prompt_delete: { label: '프롬프트 삭제', tone: 'delete' },
  token_grant: { label: '토큰 부여', tone: 'grant' },
  team_create: { label: '팀 생성', tone: 'team' },
  team_edit: { label: '팀 수정', tone: 'edit' },
  team_delete: { label: '팀 삭제', tone: 'delete' },
  team_member_add: { label: '팀원 추가', tone: 'team' },
  team_member_remove: { label: '팀원 제거', tone: 'delete' },
}

const TONE_CLASS: Record<ActivityBadgeTone, string> = {
  create:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
  edit: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200',
  delete: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200',
  grant:
    'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  team: 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200',
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

export function resolveActivityAction(actionType: string): ActivityActionMeta {
  const key = actionType.trim().toLowerCase()
  return (
    ACTION_META[key] ?? {
      label: key.replace(/_/g, ' '),
      tone: 'neutral',
    }
  )
}

export function activityBadgeClassName(actionType: string): string {
  const { tone } = resolveActivityAction(actionType)
  return `inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASS[tone]}`
}

export const KNOWN_ACTIVITY_ACTIONS = Object.keys(ACTION_META)
