/**
 * `users.preferred_ai`/요청 바디 모델 문자열을 공급자·실제 API model id 로 정규화합니다.
 * 브라우저와 Supabase Edge(`_shared/normalize-preferred-ai-model.ts`) 내용을 동기화하세요.
 */

export type ResolvedChatModelKind = 'openai' | 'anthropic' | 'google'

export type ResolvedChatModel = {
  kind: ResolvedChatModelKind
  modelId: string
}

/** OpenAI Chat Completions 호환 플래그십 계열 (2026 공식 스냅샷 별칭 포함) */
const OPENAI_KNOWN = new Set([
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gpt-4o',
  'gpt-4o-mini',
])

/** Anthropic Messages API (Sonnet 4.6·Opus 4.7 + 레거시 4.5 대비 저장값) */
const ANTHROPIC_KNOWN = new Set([
  'claude-opus-4-7',
  'claude-opus-4-5',
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'claude-haiku-4-5-20251001',
])

/** Google Generative AI (Gemini 3.5 Stable + 3 프리뷰 + 2.5 안정) */
const GOOGLE_KNOWN = new Set([
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
])

export function normalizePreferredAiToResolvedModel(
  preferredAi: string,
): ResolvedChatModel {
  const trimmed = preferredAi.trim()
  const raw = trimmed.toLowerCase()

  if (!raw) {
    return { kind: 'openai', modelId: 'gpt-5.4' }
  }

  if (raw === 'google' || raw === 'gemini') {
    return { kind: 'google', modelId: 'gemini-2.5-flash' }
  }

  if (raw.includes('/')) {
    return normalizePreferredAiToResolvedModel(raw.split('/').pop() ?? raw)
  }

  if (OPENAI_KNOWN.has(raw)) {
    return { kind: 'openai', modelId: raw }
  }

  if (ANTHROPIC_KNOWN.has(raw)) {
    return { kind: 'anthropic', modelId: raw }
  }

  if (GOOGLE_KNOWN.has(raw)) {
    return { kind: 'google', modelId: raw }
  }

  /** DB 등에 남은 구식 식별자 */
  if (raw === 'gpt-5-mini') {
    return { kind: 'openai', modelId: 'gpt-5.4-mini' }
  }

  if (raw.includes('gemini')) {
    let modelId = 'gemini-2.5-flash'
    if (raw.includes('3.1') && raw.includes('pro')) {
      modelId = 'gemini-3.1-pro-preview'
    } else if (raw.includes('3.1') && (raw.includes('flash-lite') || raw.includes('lite'))) {
      modelId = 'gemini-3.1-flash-lite'
    } else if (raw.includes('3-flash') || (raw.includes('3') && raw.includes('flash') && !raw.includes('lite'))) {
      modelId = 'gemini-3-flash-preview'
    } else if (raw.includes('flash-lite') || /\bflash[\s_-]*lite\b/.test(raw)) {
      modelId = 'gemini-2.5-flash-lite'
    } else if (raw.includes('pro')) {
      modelId = 'gemini-2.5-pro'
    }
    return { kind: 'google', modelId }
  }

  if (raw.includes('claude') || raw.includes('anthropic')) {
    if (raw.includes('haiku')) {
      return { kind: 'anthropic', modelId: 'claude-haiku-4-5' }
    }
    if (raw.includes('opus')) {
      if (raw.includes('4-7') || raw.includes('4.7')) {
        return { kind: 'anthropic', modelId: 'claude-opus-4-7' }
      }
      if (raw.includes('4-5') || raw.includes('4.5')) {
        return { kind: 'anthropic', modelId: 'claude-opus-4-5' }
      }
      return { kind: 'anthropic', modelId: 'claude-opus-4-7' }
    }
    if (raw.includes('sonnet')) {
      if (raw.includes('4-6') || raw.includes('4.6')) {
        return { kind: 'anthropic', modelId: 'claude-sonnet-4-6' }
      }
      if (raw.includes('4-5') || raw.includes('4.5')) {
        return { kind: 'anthropic', modelId: 'claude-sonnet-4-5' }
      }
      return { kind: 'anthropic', modelId: 'claude-sonnet-4-6' }
    }
    return { kind: 'anthropic', modelId: 'claude-sonnet-4-6' }
  }

  if (
    (raw.includes('o1') || raw.includes('o3') || raw.includes('o4')) &&
    !raw.includes('mini')
  ) {
    return { kind: 'openai', modelId: 'gpt-5.5' }
  }

  if (
    raw.includes('gpt') ||
    raw.includes('openai') ||
    raw.includes('o3') ||
    raw.includes('o4') ||
    raw.includes('o1')
  ) {
    if (raw.includes('nano')) {
      return { kind: 'openai', modelId: 'gpt-5.4-nano' }
    }
    if (raw.includes('mini')) {
      return {
        kind: 'openai',
        modelId: raw.includes('4o') ? 'gpt-4o-mini' : 'gpt-5.4-mini',
      }
    }
    if (raw.includes('gpt-5.5') || raw.includes('5.5')) {
      return { kind: 'openai', modelId: 'gpt-5.5' }
    }
    if (
      raw.includes('gpt-5.4') ||
      raw.includes('5.4')
    ) {
      return { kind: 'openai', modelId: 'gpt-5.4' }
    }
    if (raw.includes('gpt-5')) {
      return { kind: 'openai', modelId: 'gpt-5.4' }
    }
    if (raw.includes('gpt-4o')) {
      return { kind: 'openai', modelId: 'gpt-4o' }
    }
    return { kind: 'openai', modelId: 'gpt-5.4' }
  }

  return { kind: 'openai', modelId: 'gpt-5.4' }
}
