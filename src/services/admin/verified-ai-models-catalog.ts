import type { AiModelProvider, AiModelType } from '../../types/ai-models'

export type VerifiedAiModelCatalogEntry = {
  provider: AiModelProvider
  display_name: string
  api_id: string
  model_type: AiModelType
  hint: string
  cost_info: string
  description: string
  sort_order: number
  is_active?: boolean
}

/**
 * Google AI · Anthropic · OpenAI 공식 문서 기준 검증 카탈로그 (2026-05).
 * AI 동기화는 이 목록만 upsert 하며, Google 항목은 live API 목록과 교차 검증합니다.
 */
export const VERIFIED_AI_MODELS_CATALOG: readonly VerifiedAiModelCatalogEntry[] = [
  {
    provider: 'anthropic',
    display_name: 'Opus 4.7',
    api_id: 'claude-opus-4-7',
    model_type: 'text',
    hint: '최상급 추론·에이전트·장문 분석',
    cost_info: '높음',
    description:
      '추천: 복잡 계약·장문 시방·다단계 에이전트. Anthropic 최상급 모델.',
    sort_order: 10,
  },
  {
    provider: 'anthropic',
    display_name: 'Sonnet 4.6',
    api_id: 'claude-sonnet-4-6',
    model_type: 'text',
    hint: '속도·품질 균형 · 시방·계약·코드 보조',
    cost_info: '보통',
    description:
      '추천: 시방서·계약 검토·코드 보조·한글 업무 문서. 일상 업무 기본형.',
    sort_order: 20,
  },
  {
    provider: 'anthropic',
    display_name: 'Haiku 4.5',
    api_id: 'claude-haiku-4-5-20251001',
    model_type: 'text',
    hint: '초저지연·요약·단답형',
    cost_info: '저렴',
    description: '추천: 뉴스·알림 요약, 짧은 Q&A, 대량 분류·추출.',
    sort_order: 30,
  },
  {
    provider: 'openai',
    display_name: 'GPT-5.5',
    api_id: 'gpt-5.5',
    model_type: 'text',
    hint: 'OpenAI 최신 프론티어 · 복잡 추론·코드',
    cost_info: '높음',
    description: '추천: 복잡 추론·코드 리팩터·다단계 기획.',
    sort_order: 110,
  },
  {
    provider: 'openai',
    display_name: 'GPT-5.4',
    api_id: 'gpt-5.4',
    model_type: 'text',
    hint: '전문 업무 균형 · 멀티모달',
    cost_info: '보통',
    description: '추천: 전문 업무·표·이미지 첨부 분석.',
    sort_order: 120,
  },
  {
    provider: 'openai',
    display_name: 'GPT-5.4 mini',
    api_id: 'gpt-5.4-mini',
    model_type: 'text',
    hint: '고성능 소형 · 대량·빠른 응답',
    cost_info: '저렴',
    description: '추천: 대량 요약·분류·간단 보고.',
    sort_order: 130,
  },
  {
    provider: 'openai',
    display_name: 'GPT-4o',
    api_id: 'gpt-4o',
    model_type: 'text',
    hint: '범용 마스터 · 레거시 호환',
    cost_info: '보통',
    description: '추천: 범용 비즈니스·다국어·표 가공.',
    sort_order: 150,
  },
  {
    provider: 'openai',
    display_name: 'GPT-4o mini',
    api_id: 'gpt-4o-mini',
    model_type: 'text',
    hint: '경량 · 저지연 요약',
    cost_info: '저렴',
    description: '추천: 이메일 초안·단문 교정·간단 Q&A.',
    sort_order: 160,
  },
  {
    provider: 'google',
    display_name: 'Gemini 3.5 Flash',
    api_id: 'gemini-3.5-flash',
    model_type: 'text',
    hint: 'Google 최신 Stable · 에이전트·코딩',
    cost_info: '보통',
    description:
      '추천: 최신 Gemini Stable. 에이전트·코딩·일반 업무 기본.',
    sort_order: 205,
  },
  {
    provider: 'google',
    display_name: 'Gemini 3.1 Pro Preview',
    api_id: 'gemini-3.1-pro-preview',
    model_type: 'text',
    hint: 'Gemini 3 최상급(프리뷰)·멀티모달',
    cost_info: '높음',
    description: '추천: 복잡 추론·멀티모달 분석·고난도 기획.',
    sort_order: 210,
  },
  {
    provider: 'google',
    display_name: 'Gemini 3 Flash Preview',
    api_id: 'gemini-3-flash-preview',
    model_type: 'text',
    hint: '3세대 속도형(프리뷰)',
    cost_info: '보통',
    description: '추천: 빠른 초안·뉴스 큐레이션·일반 채팅.',
    sort_order: 220,
  },
  {
    provider: 'google',
    display_name: 'Gemini 3.1 Flash-Lite',
    api_id: 'gemini-3.1-flash-lite',
    model_type: 'text',
    hint: '3.x Stable · 초경량·고빈도',
    cost_info: '저렴',
    description: '추천: 한글 자동화·고빈도 호출·짧은 응답.',
    sort_order: 230,
  },
  {
    provider: 'google',
    display_name: 'Gemini 2.5 Pro',
    api_id: 'gemini-2.5-pro',
    model_type: 'text',
    hint: '2.5 최상급 추론(Stable)',
    cost_info: '보통',
    description: '추천: 안정적인 장문 분석·기술 검토.',
    sort_order: 240,
  },
  {
    provider: 'google',
    display_name: 'Gemini 2.5 Flash',
    api_id: 'gemini-2.5-flash',
    model_type: 'text',
    hint: '2.5 Stable · 가성비·멀티모달',
    cost_info: '저렴',
    description: '추천: 일반 업무·표·이미지 첨부. 포털 자동 라우팅 폴백.',
    sort_order: 250,
  },
  {
    provider: 'google',
    display_name: 'Gemini 2.5 Flash-Lite',
    api_id: 'gemini-2.5-flash-lite',
    model_type: 'text',
    hint: '2.5 초경량 · 최저지연',
    cost_info: '저렴',
    description: '추천: 초저지연 요약·FAQ·간단 질의.',
    sort_order: 260,
  },
  {
    provider: 'google',
    display_name: 'Nano Banana (2.5 Flash Image)',
    api_id: 'gemini-2.5-flash-image',
    model_type: 'image',
    hint: 'Google 네이티브 이미지 생성',
    cost_info: '보통',
    description: '추천: 빠른 이미지 시안·일러스트·편집.',
    sort_order: 310,
  },
  {
    provider: 'google',
    display_name: 'Nano Banana 2 Preview',
    api_id: 'gemini-3.1-flash-image-preview',
    model_type: 'image',
    hint: 'Gemini 3 고효율 이미지 생성',
    cost_info: '보통',
    description: '추천: 고품질·대량 비주얼 생성.',
    sort_order: 320,
  },
  {
    provider: 'google',
    display_name: 'Imagen 3',
    api_id: 'imagen-3.0-generate-002',
    model_type: 'image',
    hint: 'Imagen 3 REST · Edge 미디어 라우터 연동',
    cost_info: '보통',
    description: '추천: 홍보물·포스터·배너. 현재 Edge 이미지 엔진.',
    sort_order: 330,
  },
  {
    provider: 'openai',
    display_name: 'DALL·E 3',
    api_id: 'dall-e-3',
    model_type: 'image',
    hint: 'OpenAI DALL·E 3',
    cost_info: '높음',
    description: '추천: 마케팅 비주얼·제품 목업.',
    sort_order: 340,
  },
  {
    provider: 'google',
    display_name: 'Veo 3.1 Preview',
    api_id: 'veo-3.1-generate-preview',
    model_type: 'video',
    hint: 'Google Veo 3.1 · 시네마틱',
    cost_info: '높음',
    description: '추천: 홍보 영상·5~8초 시네마틱 클립.',
    sort_order: 410,
  },
  {
    provider: 'google',
    display_name: 'Veo 3.1 Lite Preview',
    api_id: 'veo-3.1-lite-generate-preview',
    model_type: 'video',
    hint: 'Veo Lite · 숏폼·저지연',
    cost_info: '보통',
    description: '추천: SNS 숏폼·빠른 프리뷰.',
    sort_order: 420,
  },
]

export const VERIFIED_OFFICIAL_API_IDS = new Set(
  VERIFIED_AI_MODELS_CATALOG.map((entry) => entry.api_id),
)
