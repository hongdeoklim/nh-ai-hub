/**
 * 자동 모델 라우팅 · 토큰 추정(참고용)
 * 서버(`supabase/functions/_shared/auto-route.ts`)와 규칙을 맞춰 주세요.
 */

export const ORG_PROMPT_ROUTE_STORAGE_KEY = 'nh-ai:org-prompt-route-v1'

export function routePromptToModelId(prompt: string, hasImages: boolean): string {
  const t = prompt.trim()
  if (hasImages) {
    return 'gemini-2.5-flash'
  }

  if (/균열|현장\s*사진|현장\s*이미지/i.test(t)) {
    return 'gemini-2.5-flash'
  }

  if (/시방|계약|견적|안전점검|체크리스트|분석|검토/i.test(t)) {
    if (t.length > 500) return 'claude-sonnet-4-6'
    return 'gpt-5.4'
  }

  if (/여행|패키지|환불/i.test(t)) {
    return 'gpt-5.4-mini'
  }

  if (/공문|행정|문안/i.test(t)) {
    return 'gpt-5.4-mini'
  }

  if (t.length > 4000) {
    return 'claude-sonnet-4-6'
  }

  if (t.length < 100) {
    return 'gemini-2.5-flash-lite'
  }

  return 'gemini-2.5-flash'
}

/** 한글·혼합 텍스트 가정의 매우 느슨한 입력 토큰 추정(참고용, 실제와 다를 수 있음) */
export function estimateRoughInputTokens(text: string): number {
  const t = text.trim()
  if (!t) return 0
  return Math.max(1, Math.ceil(t.length / 2.5))
}

export const MODEL_TYPICAL_COMPLETION_TOKENS: Record<
  string,
  readonly [number, number]
> = {
  'claude-opus-4-7': [900, 5000],
  'claude-opus-4-5': [800, 4500],
  'claude-sonnet-4-6': [520, 3400],
  'claude-sonnet-4-5': [500, 3200],
  'claude-haiku-4-5': [200, 1200],
  'gpt-5.5': [650, 4200],
  'gpt-5.4': [500, 3500],
  'gpt-5.4-mini': [280, 1800],
  'gpt-5.4-nano': [120, 800],
  'gpt-4o': [400, 2400],
  'gpt-4o-mini': [200, 900],
  'gpt-5-mini': [250, 1400],
  'gemini-3.5-flash': [380, 2400],
  'gemini-3.1-pro-preview': [700, 4200],
  'gemini-3-flash-preview': [400, 2600],
  'gemini-3.1-flash-lite': [220, 1100],
  'gemini-2.5-pro': [600, 3800],
  'gemini-2.5-flash': [350, 2200],
  'gemini-2.5-flash-lite': [150, 800],
}

export function getTypicalCompletionRange(
  modelId: string,
): readonly [number, number] {
  return MODEL_TYPICAL_COMPLETION_TOKENS[modelId] ?? [300, 2000]
}

/** deep-research Edge Function 과 동일한 3모델 + 편집장 패스 기준(참고용) */
const DEEP_RESEARCH_AGENT_MODELS = [
  'claude-sonnet-4-6',
  'gpt-4o',
  'gemini-2.5-flash',
] as const

const DEEP_RESEARCH_EDITOR_MODEL = 'claude-sonnet-4-6'

export function getDeepResearchTypicalCompletionRange(): readonly [number, number] {
  let lo = 0
  let hi = 0
  for (const modelId of DEEP_RESEARCH_AGENT_MODELS) {
    const [modelLo, modelHi] = getTypicalCompletionRange(modelId)
    lo += modelLo
    hi += modelHi
  }
  const [editorLo, editorHi] = getTypicalCompletionRange(DEEP_RESEARCH_EDITOR_MODEL)
  return [lo + editorLo, hi + editorHi]
}

export function estimateDeepResearchInputTokens(text: string): number {
  const base = estimateRoughInputTokens(text)
  const systemOverhead = 180
  const researchInput =
    (base + systemOverhead) * DEEP_RESEARCH_AGENT_MODELS.length

  let editorContext = base
  for (const modelId of DEEP_RESEARCH_AGENT_MODELS) {
    const [lo, hi] = getTypicalCompletionRange(modelId)
    editorContext += Math.round((lo + hi) / 2)
  }

  return researchInput + editorContext + systemOverhead
}

export const MODEL_ID_LABEL: Record<string, string> = {
  'claude-opus-4-7': 'Claude Opus 4.7',
  'claude-opus-4-5': 'Claude Opus 4.5',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-sonnet-4-5': 'Claude Sonnet 4.5',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  'gpt-5.5': 'GPT-5.5',
  'gpt-5.4': 'GPT-5.4',
  'gpt-5.4-mini': 'GPT-5.4 mini',
  'gpt-5.4-nano': 'GPT-5.4 nano',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o mini',
  'gpt-5-mini': 'GPT-5 mini (구)',
  'gemini-3.5-flash': 'Gemini 3.5 Flash',
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro Preview',
  'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash-Lite',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite',
}

export function readOrgPromptRouteMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ORG_PROMPT_ROUTE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

export function writeOrgPromptRouteMap(map: Record<string, string>) {
  try {
    localStorage.setItem(ORG_PROMPT_ROUTE_STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* quota / private mode */
  }
}

/** 카탈로그에 없는 ID는 건너뛰지 않고 분석 결과를 채웁니다. */
export function seedOrgPromptRoutesFromCatalog(
  items: readonly { id: string; content: string }[],
) {
  const existing = readOrgPromptRouteMap()
  let changed = false
  for (const item of items) {
    if (existing[item.id] === undefined) {
      existing[item.id] = routePromptToModelId(item.content, false)
      changed = true
    }
  }
  if (changed) writeOrgPromptRouteMap(existing)
}

export function upsertOrgPromptRoute(promptId: string, content: string) {
  const map = readOrgPromptRouteMap()
  map[promptId] = routePromptToModelId(content, false)
  writeOrgPromptRouteMap(map)
}
