import type { AiModelProvider, AiProviderPreference } from '../types/ai-models'
import { resolveAiModelProvider } from '../services/ai/ai-models-client'

/**
 * 대시보드(채팅) 수동 모델 선택 카탈로그 — Dashboard.tsx에서 분리 (3단계 모놀리스 분해).
 * 레지스트리(ai_models)가 비어 있거나 해당 공급자 모델이 없을 때의 폴백 SSOT.
 */

export type AiManualProviderId = Exclude<AiModelProvider, 'openrouter'>

/** 수동 선택 UI에 노출하는 공급자 — 레지스트리 밖 OpenRouter·Dify 포함 */
export type ManualProviderChoice = AiManualProviderId | 'openrouter' | 'dify'
export type DashboardProviderPreference = AiProviderPreference | 'dify'

export const MANUAL_PROVIDER_ORDER: ManualProviderChoice[] = [
  'google',
  'openai',
  'anthropic',
  'deepseek',
  'hermes',
  'openrouter',
  'dify',
]

export type FallbackModelEntry = {
  id: string
  label: string
  hint: string
  costInfo: string
  description: string
}

export const AI_MODELS_BY_PROVIDER: Record<
  ManualProviderChoice,
  readonly FallbackModelEntry[]
> = {
  dify: [
    {
      id: 'dify-ax',
      label: 'Dify Chat (RAG)',
      hint: '사내 RAG 시스템을 통해 문서를 기반으로 정확한 답변을 제공합니다.',
      costInfo: '보통',
      description:
        '사내 RAG 시스템을 통해 문서를 기반으로 정확한 답변을 제공합니다.',
    },
  ],
  openrouter: [
    {
      id: 'meta-llama/llama-3.3-70b-instruct',
      label: 'Llama 3.3 70B',
      hint: '오픈소스 대형 · 범용 대화·요약',
      costInfo: '저렴',
      description: 'OpenRouter 경유 Meta Llama 3.3 70B Instruct.',
    },
    {
      id: 'qwen/qwen-2.5-72b-instruct',
      label: 'Qwen 2.5 72B',
      hint: '다국어·코드에 강한 오픈소스 대형',
      costInfo: '저렴',
      description: 'OpenRouter 경유 Qwen 2.5 72B Instruct.',
    },
    {
      id: 'mistralai/mistral-large-2411',
      label: 'Mistral Large',
      hint: '유럽권 플래그십 · 추론·요약 균형',
      costInfo: '보통',
      description: 'OpenRouter 경유 Mistral Large 2411.',
    },
  ],
  deepseek: [
    {
      id: 'deepseek-chat',
      label: 'DeepSeek Chat',
      hint: '반복 처리, 요약 및 비용 효율적인 일반 업무',
      costInfo: '낮음',
      description: '반복 처리, 요약 및 비용 효율적인 일반 업무에 적합합니다.',
    },
    {
      id: 'deepseek-reasoner',
      label: 'DeepSeek Reasoner',
      hint: '수학, 분석 및 단계적 추론',
      costInfo: '보통',
      description: '복잡한 계산과 단계적 추론 작업에 적합합니다.',
    },
  ],
  hermes: [
    {
      id: 'hermes-default',
      label: 'Hermes',
      hint: '회사 내부 특화 업무 및 배치 처리',
      costInfo: '낮음',
      description: '관리자가 구성한 Hermes API의 기본 모델을 사용합니다.',
    },
  ],
  anthropic: [
    {
      id: 'claude-opus-4-7',
      label: 'Opus 4.7',
      hint: '최상급 추론·에이전트·장문 분석(공식 최신 Opus)',
      costInfo: '높음',
      description: '최상급 추론·에이전트·장문 분석(공식 최신 Opus)',
    },
    {
      id: 'claude-sonnet-4-6',
      label: 'Sonnet 4.6',
      hint: '속도·품질 균형 · 시방·계약·코드 보조에 적합',
      costInfo: '보통',
      description: '속도·품질 균형 · 시방·계약·코드 보조에 적합',
    },
    {
      id: 'claude-haiku-4-5',
      label: 'Haiku 4.5',
      hint: '초저지연·요약·단답형',
      costInfo: '저렴',
      description: '초저지연·요약·단답형',
    },
    {
      id: 'claude-opus-4-5',
      label: 'Opus 4.5 (레거시)',
      hint: '이전 스냅샷 호환 · 필요 시 유지보수용',
      costInfo: '높음',
      description: '이전 스냅샷 호환 · 필요 시 유지보수용',
    },
    {
      id: 'claude-sonnet-4-5',
      label: 'Sonnet 4.5 (레거시)',
      hint: '이전 저장 프로필과 동일 문자열 호환',
      costInfo: '보통',
      description: '이전 저장 프로필과 동일 문자열 호환',
    },
  ],
  openai: [
    {
      id: 'gpt-5.5',
      label: 'GPT-5.5',
      hint: '최신 프론티어 · 복잡 추론·코드(공식 플래그십 가이드)',
      costInfo: '높음',
      description: '최신 프론티어 · 복잡 추론·코드(공식 플래그십 가이드)',
    },
    {
      id: 'gpt-5.4',
      label: 'GPT-5.4',
      hint: '전문 업무 균형 · 멀티모달 텍스트/이미지 입력',
      costInfo: '보통',
      description: '전문 업무 균형 · 멀티모달 텍스트/이미지 입력',
    },
    {
      id: 'gpt-5.4-mini',
      label: 'GPT-5.4 mini',
      hint: '고성능 소형 · 대량·빠른 응답',
      costInfo: '저렴',
      description: '고성능 소형 · 대량·빠른 응답',
    },
    {
      id: 'gpt-5.4-nano',
      label: 'GPT-5.4 nano',
      hint: '최저비용 근거·추출·분류 작업에 적합',
      costInfo: '저렴',
      description: '최저비용 근거·추출·분류 작업에 적합',
    },
    {
      id: 'gpt-4o',
      label: 'GPT-4o',
      hint: '기존 워크로드·구 API 티어 호환',
      costInfo: '보통',
      description: '기존 워크로드·구 API 티어 호환',
    },
    {
      id: 'gpt-4o-mini',
      label: 'GPT-4o mini',
      hint: '경량 레거시 대안 · 저지연 요약',
      costInfo: '저렴',
      description: '경량 레거시 대안 · 저지연 요약',
    },
    {
      id: 'dall-e-3',
      label: 'DALL-E 3 (이미지 생성)',
      hint: '텍스트 프롬프트를 기반으로 고품질 이미지를 생성합니다.',
      costInfo: '높음',
      description: '텍스트 프롬프트를 기반으로 고품질 이미지를 생성합니다.',
    },
  ],
  google: [
    {
      id: 'gemini-3.1-pro-preview',
      label: 'Gemini 3.1 Pro Preview',
      hint: 'Gemini 3 최상급(프리뷰)·도구·멀티모달',
      costInfo: '높음',
      description: 'Gemini 3 최상급(프리뷰)·도구·멀티모달',
    },
    {
      id: 'gemini-3-flash-preview',
      label: 'Gemini 3 Flash Preview',
      hint: '3세대 속도형(프리뷰)·비용 대비 성능',
      costInfo: '보통',
      description: '3세대 속도형(프리뷰)·비용 대비 성능',
    },
    {
      id: 'gemini-3.1-flash-lite',
      label: 'Gemini 3.1 Flash‑Lite',
      hint: '3.x 안정·초경량·고빈도 호출용',
      costInfo: '저렴',
      description: '3.x 안정·초경량·고빈도 호출용',
    },
    {
      id: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      hint: '2.5 최상급 추론(안정)',
      costInfo: '보통',
      description: '2.5 최상급 추론(안정)',
    },
    {
      id: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      hint: '이미지·표 포함 일반 업무(안정)',
      costInfo: '보통',
      description: '이미지·표 포함 일반 업무(안정)',
    },
    {
      id: 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash‑Lite',
      hint: '최저지연 요약·간단 질의',
      costInfo: '저렴',
      description: '최저지연 요약·간단 질의',
    },
  ],
}

export function providerForModelId(modelId: string): AiManualProviderId {
  return resolveAiModelProvider(null, modelId)
}

/** UI 공급자 선택값 기준 판별 — Dify·OpenRouter 특례 포함 */
export function manualProviderChoiceForModelId(
  modelId: string,
): ManualProviderChoice {
  if (modelId === 'dify-ax') return 'dify'
  if (modelId.includes('/')) return 'openrouter'
  return providerForModelId(modelId)
}

export function chatInputPlaceholderForModelId(modelId: string): string {
  if (modelId === 'dify-ax') {
    return 'Dify 사내 RAG에게 문서 기반 질문을 입력하세요.'
  }
  if (modelId.includes('/')) {
    return 'OpenRouter 모델에게 업무 관련 질문을 입력하세요.'
  }
  switch (providerForModelId(modelId)) {
    case 'google':
      return 'Gemini에게 업무 관련 질문을 입력하세요.'
    case 'anthropic':
      return 'Claude에게 업무 관련 질문을 입력하세요.'
    case 'deepseek':
      return 'DeepSeek에게 업무 관련 질문을 입력하세요.'
    case 'hermes':
      return 'Hermes에게 내부 업무 관련 질문을 입력하세요.'
    default:
      return '챗GPT에게 업무 관련 질문을 입력하세요.'
  }
}

export function buildAllModelRows(
  selectedModel: string,
  selectedProvider: DashboardProviderPreference = 'auto',
) {
  const rows: {
    id: string
    label: string
    hint: string
    costInfo: string
    description: string
  }[] = []

  if (selectedProvider === 'auto') {
    rows.push({
      id: 'auto',
      label: '자동 · Gemini 2.5 Flash 기본',
      hint:
        '기본은 Gemini 2.5 Flash입니다. 프롬프트·첨부·길이에 따라 다른 모델로 전환될 수 있습니다.',
      costInfo: '저렴',
      description:
        '기본은 Gemini 2.5 Flash입니다. 프롬프트·첨부·길이에 따라 다른 모델로 전환될 수 있습니다.',
    })
  }

  for (const provider of MANUAL_PROVIDER_ORDER) {
    if (selectedProvider !== 'auto' && provider !== selectedProvider) continue
    for (const model of AI_MODELS_BY_PROVIDER[provider]) {
      rows.push({
        id: model.id,
        label: model.label,
        hint: model.hint,
        costInfo: model.costInfo,
        description: model.description,
      })
    }
  }

  if (
    selectedModel !== 'auto' &&
    !rows.some((row) => row.id === selectedModel)
  ) {
    rows.splice(1, 0, {
      id: selectedModel,
      label: selectedModel,
      hint: '프로필에 저장된 모델입니다.',
      costInfo: '보통',
      description: '프로필에 저장된 모델입니다.',
    })
  }

  return rows
}
