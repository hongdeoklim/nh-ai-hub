import type { AiModelProvider } from '../types/ai-models'

export type PortalAiModelCatalogEntry = {
  api_id: string
  provider: AiModelProvider
  display_name: string
  hint: string
  sort_order: number
}

/** 포털 채팅 모델 드롭다운 SSOT — 정확히 5개 텍스트 모델 */
export const PORTAL_AI_MODEL_CATALOG: readonly PortalAiModelCatalogEntry[] = [
  {
    api_id: 'gemini-2.5-flash',
    provider: 'google',
    display_name: 'Gemini 2.5 Flash (초가성비)',
    hint:
      '⚡ 실시간 구글 검색 및 해외 지도·상호 검색 최적화. 대량의 사내 문서(RAG) 초고속 요약에 적합하며 비용이 매우 저렴해 상시 업무용으로 가장 추천합니다.',
    sort_order: 10,
  },
  {
    api_id: 'gemini-2.5-pro',
    provider: 'google',
    display_name: 'Gemini 2.5 Pro (전문 분석)',
    hint:
      '🔍 구글 맵 기반의 정밀 지리/좌표 분석 및 대규모 복합 문서 심층 비교 분석용. 고성능과 비용의 균형이 우수한 전문 연구 모델입니다.',
    sort_order: 20,
  },
  {
    api_id: 'claude-3.5-sonnet',
    provider: 'anthropic',
    display_name: 'Claude 3.5 Sonnet (최고 성능)',
    hint:
      '🏆 Exa 연동 국내 실시간 뉴스 심층 분석 및 국내 도로명 주소·상호 매핑 원탑. 수석 개발자급 코딩 및 계약서 독소조항 검토에 특화되어 있으나, 프리미엄 비용이 발생하므로 필요한 고난도 작업에만 추천합니다.',
    sort_order: 30,
  },
  {
    api_id: 'gpt-4o',
    provider: 'openai',
    display_name: 'GPT-4o (범용 마스터)',
    hint:
      '📊 Exa 연동 국내 실시간 정보 수집 및 보고서 작성을 위한 정형 표(Table) 데이터 가공 원탑. 다국어 번역 및 범용 비즈니스 기획에 추천합니다.',
    sort_order: 40,
  },
  {
    api_id: 'gpt-4o-mini',
    provider: 'openai',
    display_name: 'GPT-4o-mini (단순 요약)',
    hint:
      '📝 간단한 이메일 회신 초안 작성 및 단문 맞춤법 교정용. 가장 비용이 안 드는 초저가 일상 비서 모델입니다.',
    sort_order: 50,
  },
  {
    api_id: 'dify-ax',
    provider: 'google',
    display_name: 'Dify Chat (RAG)',
    hint: '사내 RAG 시스템을 통해 문서를 기반으로 정확한 답변을 제공합니다.',
    sort_order: 60,
  },
] as const

export const PORTAL_AI_MODEL_CATALOG_API_IDS = new Set(
  PORTAL_AI_MODEL_CATALOG.map((entry) => entry.api_id),
)

export const PORTAL_AI_MODEL_CATALOG_BY_API_ID = new Map(
  PORTAL_AI_MODEL_CATALOG.map((entry) => [entry.api_id, entry]),
)

export const PORTAL_AUTO_MODEL_OPTION = {
  id: 'auto',
  label: '자동 · Gemini 2.5 Flash 기본',
  hint:
    '기본은 Gemini 2.5 Flash(초가성비)입니다. 분석·코딩·표 작성 등 작업 유형에 따라 Pro·Claude·GPT 모델로 자동 전환됩니다.',
} as const

export function buildPortalModelSelectRows(
  selectedModel: string,
): { id: string; label: string; hint: string }[] {
  const rows: { id: string; label: string; hint: string }[] = [
    { ...PORTAL_AUTO_MODEL_OPTION },
  ]

  const providerLabels: Record<AiModelProvider, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Google (Gemini)',
  }

  const providerOrder: AiModelProvider[] = ['anthropic', 'openai', 'google']
  const grouped = new Map<AiModelProvider, PortalAiModelCatalogEntry[]>()

  for (const entry of PORTAL_AI_MODEL_CATALOG) {
    const list = grouped.get(entry.provider) ?? []
    list.push(entry)
    grouped.set(entry.provider, list)
  }

  for (const provider of providerOrder) {
    const list = grouped.get(provider) ?? []
    list.sort((a, b) => a.sort_order - b.sort_order)
    for (const entry of list) {
      rows.push({
        id: entry.api_id,
        label: `${providerLabels[provider]} · ${entry.display_name}`,
        hint: entry.hint,
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
    })
  }

  return rows
}
