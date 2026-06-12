import { streamText, stepCountIs, type StreamTextResult } from 'ai'

import { routePromptToModelId } from '../../lib/auto-model-route'
import { getLowCostRoutingModel, resolvePreferredLanguageModel } from './config'
import { evaluatePromptGuardrail } from './guardrail'
import { nhPortalPluginTools } from './tools'

type PortalToolSet = typeof nhPortalPluginTools

/** streamText 기본 텍스트 출력 모드에 대응하는 결과 타입 */
// AI SDK의 기본 Output 제네릭이 패키지 타입만으로는 깔끔히 표현되지 않음
export type RouteAiStreamResult = StreamTextResult<
  PortalToolSet,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK 기본 텍스트 스트림 Output
  any
>

export type RouteAiFailureReason =
  | 'guardrail_block'
  | 'token_exhausted'
  | 'configuration_error'

export type RouteAiRequestParams = {
  /** 사용자 입력 프롬프트 */
  prompt: string
  /** DB users.preferred_ai 에 저장된 선호 모델 식별 문자열 */
  preferredAi: string
  /** 월간 토큰 상한 */
  tokenLimit: number
  /** 현재까지 집계된 사용량 */
  currentTokenUsage: number
  /** 메인 대화 시스템 프롬프트(선택) */
  systemPrompt?: string
  abortSignal?: AbortSignal
}

export type RouteAiResult =
  | {
      ok: false
      reason: RouteAiFailureReason
      message: string
    }
  | {
      ok: true
      /** 실제 호출에 사용된 모델 ID 문자열 */
      modelUsed: string
      /** 예산 10% 미만으로 저비용 모델로 강등되었는지 여부 */
      fallbackApplied: boolean
      /** Vercel AI SDK streamText 결과 (스트림 소비는 호출자 책임) */
      result: RouteAiStreamResult
    }

const GUARDRAIL_BLOCK_MESSAGE =
  '업무와 직접 관련되지 않은 요청으로, 사내 정책에 따라 응답할 수 없습니다.'

const TOKEN_EXHAUSTED_MESSAGE =
  '월간 토큰 한도를 초과하여 AI 요청을 처리할 수 없습니다. 관리자에게 문의하세요.'

/**
 * 가드레일 → 토큰 예산 검사 → (필요 시) 저비용 강등 → streamText 호출 순으로 처리합니다.
 */
export async function routeAiRequest(
  params: RouteAiRequestParams,
): Promise<RouteAiResult> {
  const trimmedPrompt = params.prompt.trim()
  if (trimmedPrompt.length === 0) {
    return {
      ok: false,
      reason: 'guardrail_block',
      message: GUARDRAIL_BLOCK_MESSAGE,
    }
  }

  const verdict = await evaluatePromptGuardrail(trimmedPrompt)
  if (verdict === 'BLOCK') {
    return {
      ok: false,
      reason: 'guardrail_block',
      message: GUARDRAIL_BLOCK_MESSAGE,
    }
  }

  if (params.tokenLimit > 0) {
    const remaining = params.tokenLimit - params.currentTokenUsage
    if (remaining <= 0) {
      return {
        ok: false,
        reason: 'token_exhausted',
        message: TOKEN_EXHAUSTED_MESSAGE,
      }
    }
  }

  let fallbackApplied = false
  let modelUsed: string
  let model: ReturnType<typeof resolvePreferredLanguageModel>['model']

  const preferredForResolution =
    params.preferredAi.trim().toLowerCase() === 'auto'
      ? routePromptToModelId(trimmedPrompt, false)
      : params.preferredAi.trim()

  const isExplicitManualModel =
    params.preferredAi.trim().length > 0 &&
    params.preferredAi.trim().toLowerCase() !== 'auto'

  try {
    if (
      !isExplicitManualModel &&
      params.tokenLimit > 0 &&
      params.tokenLimit - params.currentTokenUsage < params.tokenLimit * 0.1
    ) {
      const low = getLowCostRoutingModel()
      modelUsed = low.modelId
      model = low.model
      fallbackApplied = true
    } else {
      const resolved = resolvePreferredLanguageModel(preferredForResolution)
      modelUsed = resolved.modelId
      model = resolved.model
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'AI 라우팅 설정 오류가 발생했습니다.'
    return {
      ok: false,
      reason: 'configuration_error',
      message,
    }
  }

  try {
    const result = streamText({
      model,
      system:
        params.systemPrompt ??
        '당신은 농협네트웍스 임직원을 돕는 전문 업무 보조 AI입니다. 정확하고 실무에 도움이 되도록 간결하게 답변합니다.',
      prompt: trimmedPrompt,
      tools: nhPortalPluginTools,
      stopWhen: stepCountIs(8),
      abortSignal: params.abortSignal,
    })

    return {
      ok: true,
      modelUsed,
      fallbackApplied,
      result,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'streamText 호출에 실패했습니다.'
    return {
      ok: false,
      reason: 'configuration_error',
      message,
    }
  }
}
