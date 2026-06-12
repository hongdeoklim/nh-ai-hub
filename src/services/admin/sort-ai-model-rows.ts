import type { AiModelProvider, AiModelRow, AiModelType } from '../../types/ai-models'

/** 관리자 테이블: Gemini → GPT → Anthropic */
export const ADMIN_MODEL_PROVIDER_ORDER: AiModelProvider[] = [
  'google',
  'openai',
  'anthropic',
]

function providerRank(provider: AiModelProvider): number {
  const index = ADMIN_MODEL_PROVIDER_ORDER.indexOf(provider)
  return index >= 0 ? index : ADMIN_MODEL_PROVIDER_ORDER.length
}

function modelTypeRank(type: AiModelType): number {
  if (type === 'text') return 0
  if (type === 'image') return 1
  return 2
}

/** api_id 기준 버전·티어 점수 (낮을수록 구버전/경량) */
export function modelVersionScore(
  apiId: string,
  provider: AiModelProvider,
): number {
  const id = apiId.trim().toLowerCase()

  if (provider === 'google') {
    if (id.startsWith('imagen')) {
      const version = Number(id.match(/(\d+(?:\.\d+)?)/)?.[1] ?? 3)
      return 7000 + version * 10
    }
    if (id.startsWith('veo')) {
      const version = Number(id.match(/(\d+(?:\.\d+)?)/)?.[1] ?? 3)
      const lite = id.includes('lite') ? 0 : 10
      return 7100 + version * 10 + lite
    }
    if (id.includes('image')) {
      const version = Number(id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 2.5)
      return 6000 + version * 100
    }

    const version = Number(id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0)
    let tier = 30
    if (id.includes('flash-lite') || id.endsWith('-lite')) tier = 10
    else if (id.includes('flash')) tier = 20
    else if (id.includes('pro')) tier = 40
    if (id.includes('preview')) tier += 5
    return version * 1000 + tier
  }

  if (provider === 'openai') {
    if (id.startsWith('dall-e')) {
      return 7000 + Number(id.match(/dall-e-(\d+)/)?.[1] ?? 3) * 10
    }

    const version = Number(id.match(/gpt-(\d+(?:\.\d+)?)/)?.[1] ?? 0)
    let tier = 30
    if (id.includes('nano')) tier = 10
    else if (id.includes('mini')) tier = 20
    else if (/gpt-4o(?!-)/.test(id)) tier = 25
    else if (version >= 5.5) tier = 50
    else if (version >= 5.4) tier = 40
    return version * 1000 + tier
  }

  if (provider === 'anthropic') {
    const matched = id.match(/claude-(?:opus|sonnet|haiku)-(\d+)-(\d+)/)
    if (matched) {
      const version = Number(`${matched[1]}.${matched[2]}`)
      let tier = 30
      if (id.includes('haiku')) tier = 10
      else if (id.includes('sonnet')) tier = 20
      else if (id.includes('opus')) tier = 40
      return version * 1000 + tier
    }
  }

  return 0
}

export function compareAiModelRowsForAdmin(a: AiModelRow, b: AiModelRow): number {
  const byProvider = providerRank(a.provider) - providerRank(b.provider)
  if (byProvider !== 0) return byProvider

  const byType = modelTypeRank(a.model_type) - modelTypeRank(b.model_type)
  if (byType !== 0) return byType

  const byVersion =
    modelVersionScore(a.api_id, a.provider) -
    modelVersionScore(b.api_id, b.provider)
  if (byVersion !== 0) return byVersion

  return a.display_name.localeCompare(b.display_name, 'ko')
}

export function sortAiModelRowsForAdmin(rows: AiModelRow[]): AiModelRow[] {
  return [...rows].sort(compareAiModelRowsForAdmin)
}

type CatalogSortable = {
  provider: AiModelProvider
  model_type: AiModelType
  api_id: string
  display_name: string
}

export function sortCatalogEntriesForAdmin<T extends CatalogSortable>(
  entries: T[],
): T[] {
  return [...entries].sort((a, b) =>
    compareAiModelRowsForAdmin(
      {
        id: '',
        provider: a.provider,
        model_type: a.model_type,
        api_id: a.api_id,
        display_name: a.display_name,
        hint: null,
        cost_info: null,
        description: null,
        is_active: true,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      },
      {
        id: '',
        provider: b.provider,
        model_type: b.model_type,
        api_id: b.api_id,
        display_name: b.display_name,
        hint: null,
        cost_info: null,
        description: null,
        is_active: true,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      },
    ),
  )
}

/** 동기화 upsert용 sort_order (공급사·버전 순) */
export function adminSortOrderForCatalogEntry(
  provider: AiModelProvider,
  modelType: AiModelType,
  apiId: string,
): number {
  const providerBase =
    provider === 'google' ? 1000 : provider === 'openai' ? 2000 : 3000
  const typeBase =
    modelType === 'text' ? 0 : modelType === 'image' ? 100 : 200
  const versionPart = Math.min(
    99,
    Math.floor(modelVersionScore(apiId, provider) % 1000),
  )
  return providerBase + typeBase + versionPart
}
