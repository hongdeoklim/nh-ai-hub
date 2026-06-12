/**
 * NH-AX-HUB — AI 제공자 설정 및 환경 변수 로드
 *
 * API 키는 반드시 서버(Supabase Edge Functions 등)에서만 주입해 사용하세요.
 * Vite 클라이언트 번들에 키가 포함되지 않도록 주의합니다.
 */

import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'

import { normalizePreferredAiToResolvedModel } from '../../lib/normalize-preferred-ai-model'

export type ClientAiEnvStatus = {
  configured: boolean
  missing: string[]
  transport: 'edge' | 'direct'
  warnings: string[]
}

/** Vite 브라우저 빌드에서 Edge ai-chat 경로 사용에 필요한 최소 환경 변수 */
export function validateClientAiEnv(): ClientAiEnvStatus {
  const missing: string[] = []
  const warnings: string[] = []

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL')
  if (!anonKey) missing.push('VITE_SUPABASE_ANON_KEY')

  const transportRaw = import.meta.env.VITE_AI_TRANSPORT?.trim().toLowerCase()
  const transport: 'edge' | 'direct' =
    transportRaw === 'direct' ? 'direct' : 'edge'

  if (transport === 'direct' && import.meta.env.PROD) {
    warnings.push(
      'VITE_AI_TRANSPORT=direct 는 프로덕션에서 API 키 노출 위험이 있습니다. edge 권장.',
    )
  }

  if (missing.length > 0) {
    const msg =
      `[nh-ai-hub] AI 클라이언트 환경 변수 누락: ${missing.join(', ')}. ` +
      '채팅·Edge Function 호출이 실패할 수 있습니다.'
    if (import.meta.env.PROD) console.error(msg)
    else console.warn(msg)
  }

  for (const w of warnings) {
    console.warn(`[nh-ai-hub] ${w}`)
  }

  return {
    configured: missing.length === 0,
    missing,
    transport,
    warnings,
  }
}

/** 모듈 로드 시 1회 검증 — 런타임 크래시 방지용 안전벨트 */
export const clientAiEnvStatus: ClientAiEnvStatus = validateClientAiEnv()

/** 비어 있지 않은 환경 변수 문자열을 읽습니다 (Node / Edge / Vite 브라우저). */
export function readEnv(name: string): string | undefined {
  try {
    const record = import.meta.env as Record<string, string | undefined>
    const viteKey = `VITE_${name}`
    const fromVite = record[viteKey]
    if (fromVite !== undefined && fromVite !== '') {
      return fromVite
    }
  } catch {
    /* import.meta 없음 */
  }

  const proc = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> }
    }
  ).process
  if (!proc?.env) {
    return undefined
  }
  const value = proc.env[name]
  if (value === undefined || value === '') {
    return undefined
  }
  return value
}

let openaiSingleton: ReturnType<typeof createOpenAI> | undefined
let googleSingleton: ReturnType<typeof createGoogleGenerativeAI> | undefined
let anthropicSingleton: ReturnType<typeof createAnthropic> | undefined

/** OpenAI 제공자 인스턴스 (@ai-sdk/openai). `OPENAI_API_KEY` 사용. */
export function getOpenAIProvider(): ReturnType<typeof createOpenAI> {
  if (!openaiSingleton) {
    openaiSingleton = createOpenAI({
      apiKey: readEnv('OPENAI_API_KEY'),
    })
  }
  return openaiSingleton
}

/** Google Generative AI 제공자 인스턴스. `GOOGLE_GENERATIVE_AI_API_KEY` 사용. */
export function getGoogleProvider(): ReturnType<typeof createGoogleGenerativeAI> {
  if (!googleSingleton) {
    googleSingleton = createGoogleGenerativeAI({
      apiKey: readEnv('GOOGLE_GENERATIVE_AI_API_KEY'),
    })
  }
  return googleSingleton
}

/** Anthropic 제공자 인스턴스. `ANTHROPIC_API_KEY` 사용. */
export function getAnthropicProvider(): ReturnType<typeof createAnthropic> {
  if (!anthropicSingleton) {
    anthropicSingleton = createAnthropic({
      apiKey: readEnv('ANTHROPIC_API_KEY'),
    })
  }
  return anthropicSingleton
}

/**
 * 가드레일 전용 초경량 모델.
 * `NH_AI_GUARDRAIL_PROVIDER` 로 openai | google 선택 (기본 openai).
 */
export function getGuardrailLanguageModel(): LanguageModel {
  const which = (readEnv('NH_AI_GUARDRAIL_PROVIDER') ?? 'openai').toLowerCase()
  if (which === 'google') {
    return getGoogleProvider()('gemini-2.5-flash-lite')
  }
  return getOpenAIProvider()('gpt-4o-mini')
}

/** 저비용 강등 라우팅용 모델 (Google 키가 있으면 Flash Lite, 없으면 GPT-4o mini). */
export function getLowCostRoutingModel(): { modelId: string; model: LanguageModel } {
  const googleKey = readEnv('GOOGLE_GENERATIVE_AI_API_KEY')
  const openaiKey = readEnv('OPENAI_API_KEY')

  if (googleKey) {
    const modelId = 'gemini-2.5-flash-lite'
    return { modelId, model: getGoogleProvider()(modelId) }
  }

  if (openaiKey) {
    const modelId = 'gpt-4o-mini'
    return { modelId, model: getOpenAIProvider()(modelId) }
  }

  throw new Error(
    '저비용 모델 라우팅을 위해 GOOGLE_GENERATIVE_AI_API_KEY 또는 OPENAI_API_KEY 가 필요합니다.',
  )
}

/**
 * 사용자 프로필의 `preferred_ai` 문자열을 실제 LanguageModel 로 매핑합니다.
 * `auto` 또는 비어 있으면 OpenAI `gpt-5.4` 로 대체합니다(직접 라우팅 전 `routePromptToModelId` 권장).
 */
export function resolvePreferredLanguageModel(preferredAi: string): {
  modelId: string
  model: LanguageModel
} {
  const { kind, modelId } = normalizePreferredAiToResolvedModel(preferredAi)

  if (kind === 'google') {
    return { modelId, model: getGoogleProvider()(modelId) }
  }
  if (kind === 'anthropic') {
    return { modelId, model: getAnthropicProvider()(modelId) }
  }
  return { modelId, model: getOpenAIProvider()(modelId) }
}
