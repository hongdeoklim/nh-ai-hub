import { supabase } from '../../lib/supabase'
import {
  ADMIN_MODEL_PROVIDER_ORDER,
  sortAiModelRowsForAdmin,
} from '../admin/sort-ai-model-rows'
import {
  type AiModelProvider,
  type AiModelRow,
  type ModelSelectOption,
} from '../../types/ai-models'

const AI_MODEL_SELECT_COLUMNS_BASE =
  'id, provider, display_name, api_id, model_type, hint, is_active, sort_order, created_at, updated_at'

const AI_MODEL_SELECT_COLUMNS_EXTENDED =
  'id, provider, display_name, api_id, model_type, hint, cost_info, description, is_active, sort_order, created_at, updated_at'

const EXTENDED_COLUMNS_CACHE_KEY = 'nh_ai_models_extended_columns'

type ExtendedColumnStatus = 'available' | 'missing' | 'unknown'

function readExtendedColumnStatus(): ExtendedColumnStatus {
  try {
    const cached = sessionStorage.getItem(EXTENDED_COLUMNS_CACHE_KEY)
    // missing만 세션 간 신뢰 — available은 매 세션 extended 조회 성공 후에만 설정
    if (cached === 'missing') return 'missing'
  } catch {
    /* private browsing 등 */
  }
  return 'unknown'
}

function persistExtendedColumnStatus(status: 'available' | 'missing'): void {
  if (status !== 'missing') return
  try {
    sessionStorage.setItem(EXTENDED_COLUMNS_CACHE_KEY, status)
  } catch {
    /* ignore */
  }
}

let extendedColumnStatus: ExtendedColumnStatus = readExtendedColumnStatus()

function asProvider(value: unknown): AiModelProvider {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (raw === 'anthropic' || raw === 'openai' || raw === 'google') return raw
  return 'google'
}

function asModelType(value: unknown): AiModelRow['model_type'] {
  if (value === 'image') return 'image'
  if (value === 'video') return 'video'
  return 'text'
}

function asNullableText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** hint/api_id 키워드로 cost_info 추정 (마이그레이션 20260531700000과 동일 규칙) */
export function inferCostInfoFromHint(
  hint: string | null,
  apiId: string,
  displayName: string,
): string {
  const hintText = hint ?? ''
  const cheap =
    /초가성비|저렴|저비용|초저|최저비용|최저지연|경량|nano|mini|haiku|flash-lite|flash‑lite/i.test(
      hintText,
    ) ||
    /-mini|-nano|haiku|flash-lite/i.test(apiId)
  if (cheap) return '저렴'

  const expensive =
    /프리미엄|최상급|플래그십|프론티어|opus/i.test(hintText) ||
    /opus/i.test(apiId) ||
    /opus/i.test(displayName)
  if (expensive) return '높음'

  return '보통'
}

/** 레거시 ai_models 행(name/label 등) → 표준 AiModelRow */
export function normalizeAiModelRow(row: Record<string, unknown>): AiModelRow | null {
  const apiIdRaw =
    (typeof row.api_id === 'string' && row.api_id.trim()) ||
    (typeof row.model_id === 'string' && row.model_id.trim()) ||
    ''
  if (!apiIdRaw) return null

  const displayNameRaw =
    (typeof row.display_name === 'string' && row.display_name.trim()) ||
    (typeof row.model_name === 'string' && row.model_name.trim()) ||
    (typeof row.name === 'string' && row.name.trim()) ||
    (typeof row.label === 'string' && row.label.trim()) ||
    apiIdRaw

  const hint = asNullableText(row.hint)
  const cost_info =
    asNullableText(row.cost_info) ??
    inferCostInfoFromHint(hint, apiIdRaw, displayNameRaw)
  const description = asNullableText(row.description) ?? hint

  const id =
    typeof row.id === 'string' && row.id.trim().length > 0
      ? row.id
      : crypto.randomUUID()

  return {
    id,
    provider: asProvider(row.provider),
    display_name: displayNameRaw,
    api_id: apiIdRaw,
    model_type: asModelType(row.model_type),
    hint,
    cost_info,
    description,
    is_active: row.is_active !== false,
    sort_order: typeof row.sort_order === 'number' ? row.sort_order : 0,
    created_at:
      typeof row.created_at === 'string'
        ? row.created_at
        : new Date().toISOString(),
    updated_at:
      typeof row.updated_at === 'string'
        ? row.updated_at
        : new Date().toISOString(),
  }
}

function isMissingColumnError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /column .+ does not exist/i.test(error.message ?? '')
  )
}

function isMissingCostOrDescriptionColumn(error: { message?: string }): boolean {
  const msg = error.message ?? ''
  return /column ai_models\.(cost_info|description) does not exist/i.test(msg)
}

function mapAiModelRows(data: unknown[] | null): AiModelRow[] {
  return (data ?? [])
    .filter(
      (row): row is Record<string, unknown> =>
        row != null && typeof row === 'object',
    )
    .map((row) => normalizeAiModelRow(row))
    .filter((row): row is AiModelRow => row !== null)
}

/** 텍스트 채팅 드롭다운 — image/video 혼입 방지 */
export function filterActiveTextModels(
  models: readonly AiModelRow[] | null | undefined,
): AiModelRow[] {
  const safe = Array.isArray(models) ? models : []
  return safe.filter(
    (model) =>
      model != null &&
      model.model_type === 'text' &&
      model.is_active !== false &&
      typeof model.api_id === 'string' &&
      model.api_id.trim().length > 0,
  )
}

/** 미디어 엔진 패널 — 타입별 분리 */
export function filterActiveMediaModels(
  models: readonly AiModelRow[] | null | undefined,
  mediaType: 'image' | 'video',
): AiModelRow[] {
  const safe = Array.isArray(models) ? models : []
  return safe.filter(
    (model) =>
      model != null &&
      model.model_type === mediaType &&
      model.is_active !== false &&
      typeof model.api_id === 'string' &&
      model.api_id.trim().length > 0,
  )
}

function applyQueryResultFilters(
  rows: AiModelRow[],
  filters?: AiModelsQueryFilters,
): AiModelRow[] {
  if (filters?.activeTextOnly) {
    return filterActiveTextModels(rows)
  }
  return rows
}

type AiModelsQueryFilters = {
  activeTextOnly?: boolean
  adminAll?: boolean
}

async function queryAiModels(
  selectColumns: string,
  filters?: AiModelsQueryFilters,
): Promise<{ data: unknown[] | null; error: { code?: string; message?: string } | null }> {
  let query = supabase.from('ai_models').select(selectColumns)

  if (filters?.activeTextOnly) {
    query = query.eq('is_active', true).eq('model_type', 'text')
  }

  query = query.order('sort_order', { ascending: true })

  if (filters?.adminAll) {
    query = query
      .order('provider', { ascending: true })
      .order('display_name', { ascending: true })
  } else {
    query = query.order('display_name', { ascending: true })
  }

  const { data, error } = await query
  return { data, error }
}

async function fetchAiModelsWithColumnFallback(
  filters?: AiModelsQueryFilters,
): Promise<AiModelRow[]> {
  // 항상 extended 컬럼부터 시도 — sessionStorage 'missing' 캐시가 최신 DB를 가리지 않도록
  const extended = await queryAiModels(AI_MODEL_SELECT_COLUMNS_EXTENDED, filters)
  if (!extended.error) {
    extendedColumnStatus = 'available'
    return applyQueryResultFilters(mapAiModelRows(extended.data), filters)
  }

  if (isMissingCostOrDescriptionColumn(extended.error)) {
    extendedColumnStatus = 'missing'
    persistExtendedColumnStatus('missing')
    console.warn(
      '[ai-models] cost_info/description 컬럼 누락 → BASE 컬럼만 조회. supabase db push로 20260531700000 마이그레이션 적용을 권장합니다.',
      extended.error.message,
    )
  } else if (!isMissingColumnError(extended.error)) {
    throw extended.error
  }

  const base = await queryAiModels(AI_MODEL_SELECT_COLUMNS_BASE, filters)
  if (!base.error) {
    return applyQueryResultFilters(mapAiModelRows(base.data), filters)
  }

  if (!isMissingColumnError(base.error)) {
    throw base.error
  }

  console.warn(
    '[ai-models] display_name 등 컬럼 누락 → 레거시 스키마 폴백. supabase db push로 20260531500000 마이그레이션 적용을 권장합니다.',
    base.error.message,
  )
  return fetchAiModelsLegacyFallback(
    filters?.activeTextOnly ? { activeTextOnly: true } : undefined,
  )
}

async function fetchAiModelsLegacyFallback(
  filters?: { activeTextOnly?: boolean },
): Promise<AiModelRow[]> {
  const { data, error } = await supabase.from('ai_models').select('*')
  if (error) throw error

  let rows = mapAiModelRows(data)

  if (filters?.activeTextOnly) {
    rows = filterActiveTextModels(rows)
  }

  rows.sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.display_name.localeCompare(b.display_name, 'ko')
  })

  return rows
}

export async function fetchActiveTextAiModels(): Promise<AiModelRow[]> {
  const rows = await fetchAiModelsWithColumnFallback({ activeTextOnly: true })
  return sortAiModelRowsForAdmin(
    filterActiveTextModels(Array.isArray(rows) ? rows : []),
  )
}

export async function fetchActiveMediaAiModels(
  mediaType: 'image' | 'video',
): Promise<AiModelRow[]> {
  async function queryMedia(selectColumns: string) {
    return supabase
      .from('ai_models')
      .select(selectColumns)
      .eq('is_active', true)
      .eq('model_type', mediaType)
      .order('sort_order', { ascending: true })
      .order('display_name', { ascending: true })
  }

  const extended = await queryMedia(AI_MODEL_SELECT_COLUMNS_EXTENDED)
  if (!extended.error) {
    extendedColumnStatus = 'available'
    const rows = sortAiModelRowsForAdmin(
      filterActiveMediaModels(mapAiModelRows(extended.data), mediaType),
    )
    if (rows.length > 0) return rows
  } else if (isMissingCostOrDescriptionColumn(extended.error)) {
    extendedColumnStatus = 'missing'
    persistExtendedColumnStatus('missing')
  } else if (!isMissingColumnError(extended.error)) {
    throw extended.error
  }

  const base = await queryMedia(AI_MODEL_SELECT_COLUMNS_BASE)
  if (!base.error) {
    const rows = sortAiModelRowsForAdmin(
      filterActiveMediaModels(mapAiModelRows(base.data), mediaType),
    )
    if (rows.length > 0) return rows
  } else if (!isMissingColumnError(base.error)) {
    throw base.error
  }

  const legacy = await supabase.from('ai_models').select('*').eq('is_active', true)
  if (legacy.error && !isMissingColumnError(legacy.error)) throw legacy.error

  const legacyRows = sortAiModelRowsForAdmin(
    filterActiveMediaModels(mapAiModelRows(legacy.data), mediaType),
  )
  if (legacyRows.length > 0) return legacyRows

  return sortAiModelRowsForAdmin(
    mediaType === 'image'
      ? [...FALLBACK_MEDIA_IMAGE_MODELS]
      : [...FALLBACK_MEDIA_VIDEO_MODELS],
  )
}

export const FALLBACK_MEDIA_IMAGE_MODELS: AiModelRow[] = [
  {
    id: 'fallback-imagen-3',
    provider: 'google',
    display_name: 'Imagen 3.0 Pro',
    api_id: 'imagen-3.0-generate-002',
    model_type: 'image',
    hint: 'Google Imagen 3 · 고품질 일러스트·포스터',
    cost_info: '보통',
    description:
      '추천: 홍보물 일러스트 · 현장 안전 포스터 · 16:9 배너. Google Gemini 생태계 기본 이미지 엔진.',
    is_active: true,
    sort_order: 10,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'fallback-dalle-3',
    provider: 'openai',
    display_name: 'DALL·E 3',
    api_id: 'dall-e-3',
    model_type: 'image',
    hint: 'OpenAI DALL·E 3 · 사실적·창의적 합성',
    cost_info: '높음',
    description:
      '추천: 마케팅 비주얼 · 제품 목업 · 프리미엄 품질. 장당 비용이 상대적으로 높음.',
    is_active: true,
    sort_order: 20,
    created_at: '',
    updated_at: '',
  },
]

export const FALLBACK_MEDIA_VIDEO_MODELS: AiModelRow[] = [
  {
    id: 'fallback-veo-2',
    provider: 'google',
    display_name: 'Veo 2.0',
    api_id: 'veo-2.0-generate-001',
    model_type: 'video',
    hint: 'Google Veo 2 · 시네마틱 장면 생성',
    cost_info: '높음',
    description:
      '추천: 홍보 영상 기획 · 5~8초 시네마틱 클립 · Google AI Studio 연동.',
    is_active: true,
    sort_order: 10,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'fallback-sora-planning',
    provider: 'openai',
    display_name: 'Sora (기획·안내)',
    api_id: 'sora-planning',
    model_type: 'video',
    hint: 'OpenAI Sora · 스토리보드·기획 안내',
    cost_info: '보통',
    description:
      '추천: 스토리보드·3컷 구성 · REST 직접 생성 전 기획·라우팅 가이드.',
    is_active: true,
    sort_order: 20,
    created_at: '',
    updated_at: '',
  },
]

export async function fetchAllAiModelsAdmin(): Promise<AiModelRow[]> {
  try {
    const rows = await fetchAiModelsWithColumnFallback({ adminAll: true })
    return sortAiModelRowsForAdmin(rows)
  } catch (err) {
    console.warn(
      '[ai-models-admin] 컬럼별 조회 실패 → select(*) 폴백',
      err instanceof Error ? err.message : err,
    )
    const { data, error } = await supabase.from('ai_models').select('*')
    if (error) throw error
    return sortAiModelRowsForAdmin(mapAiModelRows(data))
  }
}

export function buildModelSelectOptions(
  models: readonly AiModelRow[] | null | undefined,
  selectedModel: string,
): ModelSelectOption[] {
  const safeModels = sortAiModelRowsForAdmin(
    Array.isArray(models) ? models.filter((m) => m?.model_type === 'text') : [],
  )
  const rows: ModelSelectOption[] = [
    {
      id: 'auto',
      label: '자동 · Gemini 2.5 Flash 기본',
      hint:
        '기본은 Gemini 2.5 Flash입니다. 프롬프트·첨부·길이에 따라 다른 모델로 전환될 수 있습니다.',
      costInfo: '저렴',
      description:
        '기본은 Gemini 2.5 Flash입니다. 프롬프트·첨부·길이에 따라 다른 모델로 전환될 수 있습니다.',
    },
  ]

  const grouped = new Map<string, AiModelRow[]>()
  for (const model of safeModels) {
    if (!model?.is_active || model.model_type !== 'text') continue
    const list = grouped.get(model.provider) ?? []
    list.push(model)
    grouped.set(model.provider, list)
  }

  for (const provider of ADMIN_MODEL_PROVIDER_ORDER) {
    const list = grouped.get(provider) ?? []
    for (const model of list) {
      if (model?.model_type !== 'text') continue
      const apiId = model?.api_id?.trim()
      if (!apiId) continue
      rows.push({
        id: apiId,
        label: model?.display_name?.trim() || apiId || '모델',
        hint: model?.hint?.trim() || '',
        costInfo: model?.cost_info?.trim() || '보통',
        description:
          model?.description?.trim() ||
          model?.hint?.trim() ||
          '안내 준비 중',
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

const AI_MODELS_REALTIME_CHANNEL = 'ai_models_changes'

type AiModelsChangeListener = () => void

let aiModelsChangeChannel: ReturnType<typeof supabase.channel> | null = null
const aiModelsChangeListeners = new Set<AiModelsChangeListener>()

function notifyAiModelsChangeListeners(): void {
  for (const listener of aiModelsChangeListeners) {
    try {
      listener()
    } catch (err) {
      console.warn('[ai-models] realtime listener failed', err)
    }
  }
}

function ensureAiModelsChangeChannel(): void {
  if (aiModelsChangeChannel) return

  aiModelsChangeChannel = supabase
    .channel(AI_MODELS_REALTIME_CHANNEL)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'ai_models' },
      () => notifyAiModelsChangeListeners(),
    )
    .subscribe()
}

function teardownAiModelsChangeChannelIfIdle(): void {
  if (aiModelsChangeListeners.size > 0) return
  if (!aiModelsChangeChannel) return
  void supabase.removeChannel(aiModelsChangeChannel)
  aiModelsChangeChannel = null
}

/** ai_models 테이블 변경 구독 — 채널은 프로세스당 1개, 콜백만 다중 등록 */
export function subscribeAiModelsChanges(onChange: () => void): () => void {
  aiModelsChangeListeners.add(onChange)
  ensureAiModelsChangeChannel()

  return () => {
    aiModelsChangeListeners.delete(onChange)
    teardownAiModelsChangeChannelIfIdle()
  }
}
