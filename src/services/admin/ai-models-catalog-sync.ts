import type { SupabaseClient } from '@supabase/supabase-js'

import { inferCostInfoFromHint } from '../ai/ai-models-client'
import {
  fetchLiveGoogleModelIds,
  isGoogleModelLive,
} from './fetch-live-google-models'
import {
  deactivateAiModelsNotInApiIds,
  upsertAiModelsAdmin,
} from './ai-models-admin'
import { invokeAiChat } from '../ai/invoke-chat'
import {
  adminSortOrderForCatalogEntry,
  sortCatalogEntriesForAdmin,
} from './sort-ai-model-rows'
import type { AiModelProvider, AiModelType } from '../../types/ai-models'
import {
  VERIFIED_AI_MODELS_CATALOG,
  VERIFIED_OFFICIAL_API_IDS,
} from './verified-ai-models-catalog'

/** AI 최신 동기화에 사용하는 모델 (Google AI 공식 Stable) */
export const AI_MODELS_SYNC_MODEL_ID = 'gemini-3.5-flash'

export type AiModelCatalogEntry = {
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

/** @deprecated VERIFIED_AI_MODELS_CATALOG 사용 */
export const LATEST_AI_MODELS_CATALOG = VERIFIED_AI_MODELS_CATALOG

export { VERIFIED_OFFICIAL_API_IDS }

function catalogEntryToPayload(entry: AiModelCatalogEntry) {
  const cost_info =
    entry.cost_info?.trim() ||
    inferCostInfoFromHint(entry.hint, entry.api_id, entry.display_name)
  const description = entry.description?.trim() || entry.hint
  const sort_order = adminSortOrderForCatalogEntry(
    entry.provider,
    entry.model_type,
    entry.api_id,
  )

  return {
    provider: entry.provider,
    display_name: entry.display_name,
    model_name: entry.display_name,
    model_id: entry.api_id,
    api_id: entry.api_id,
    model_type: entry.model_type,
    hint: entry.hint,
    cost_info,
    description,
    is_active: entry.is_active ?? true,
    sort_order,
  }
}

export function catalogEntryToFormState(
  entry: AiModelCatalogEntry,
): {
  provider: AiModelProvider
  display_name: string
  api_id: string
  model_type: AiModelType
  hint: string
  cost_info: string
  description: string
  is_active: boolean
  sort_order: number
} {
  const payload = catalogEntryToPayload(entry)
  return {
    provider: payload.provider,
    display_name: payload.display_name,
    api_id: payload.api_id,
    model_type: payload.model_type,
    hint: payload.hint,
    cost_info: payload.cost_info,
    description: payload.description,
    is_active: payload.is_active,
    sort_order: payload.sort_order,
  }
}

export type SyncLatestAiModelsResult =
  | {
      ok: true
      upserted: number
      deactivated: number
      source: 'gemini' | 'verified'
      liveGoogleChecked: boolean
    }
  | { ok: false; message: string }

export type SyncLatestAiModelsOptions = {
  userId: string
  accessToken?: string
  tokenLimit?: number
  currentTokenUsage?: number
}

function asProvider(value: unknown): AiModelProvider | null {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (raw === 'anthropic' || raw === 'openai' || raw === 'google') return raw
  return null
}

function asModelType(value: unknown): AiModelType | null {
  if (value === 'text' || value === 'image' || value === 'video') return value
  return null
}

function normalizeCatalogEntry(
  raw: unknown,
  fallback?: AiModelCatalogEntry,
): AiModelCatalogEntry | null {
  if (!raw || typeof raw !== 'object') return fallback ?? null
  const row = raw as Record<string, unknown>
  const api_id =
    (typeof row.api_id === 'string' && row.api_id.trim()) ||
    fallback?.api_id ||
    ''
  if (!api_id || !VERIFIED_OFFICIAL_API_IDS.has(api_id)) return null

  const provider = asProvider(row.provider) ?? fallback?.provider ?? 'google'
  const model_type = asModelType(row.model_type) ?? fallback?.model_type ?? 'text'
  const display_name =
    (typeof row.display_name === 'string' && row.display_name.trim()) ||
    fallback?.display_name ||
    api_id
  const hint =
    (typeof row.hint === 'string' && row.hint.trim()) ||
    fallback?.hint ||
    ''
  const cost_info =
    (typeof row.cost_info === 'string' && row.cost_info.trim()) ||
    fallback?.cost_info ||
    inferCostInfoFromHint(hint, api_id, display_name)
  const description =
    (typeof row.description === 'string' && row.description.trim()) ||
    fallback?.description ||
    hint ||
    '안내 준비 중'
  const sort_order =
    typeof row.sort_order === 'number' && Number.isFinite(row.sort_order)
      ? row.sort_order
      : (fallback?.sort_order ?? 500)

  return {
    provider,
    display_name,
    api_id,
    model_type,
    hint,
    cost_info,
    description,
    sort_order,
    is_active: row.is_active !== false,
  }
}

function parseCatalogJsonFromAi(text: string): unknown[] | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const fenced =
    /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1]?.trim() ?? trimmed
  const arrayStart = fenced.indexOf('[')
  const arrayEnd = fenced.lastIndexOf(']')
  if (arrayStart < 0 || arrayEnd <= arrayStart) return null

  try {
    const parsed = JSON.parse(fenced.slice(arrayStart, arrayEnd + 1)) as unknown
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** 검증 카탈로그 메타만 갱신 — api_id 추가/삭제 금지 */
function enrichVerifiedCatalogMetadata(
  seed: readonly AiModelCatalogEntry[],
  aiRows: unknown[],
): AiModelCatalogEntry[] {
  const seedByApiId = new Map(seed.map((entry) => [entry.api_id, { ...entry }]))

  for (const raw of aiRows) {
    const apiIdRaw =
      raw &&
      typeof raw === 'object' &&
      typeof (raw as Record<string, unknown>).api_id === 'string'
        ? (raw as Record<string, unknown>).api_id.trim()
        : ''
    if (!apiIdRaw || !seedByApiId.has(apiIdRaw)) continue

    const fallback = seedByApiId.get(apiIdRaw)
    const normalized = normalizeCatalogEntry(raw, fallback)
    if (normalized) {
      seedByApiId.set(normalized.api_id, normalized)
    }
  }

  return sortCatalogEntriesForAdmin([...seedByApiId.values()])
}

function filterCatalogByLiveGoogleModels(
  catalog: readonly AiModelCatalogEntry[],
  liveGoogleIds: Set<string> | null,
): AiModelCatalogEntry[] {
  return catalog.filter((entry) => {
    if (entry.provider !== 'google') return true
    return isGoogleModelLive(entry.api_id, liveGoogleIds)
  })
}

async function enrichCatalogViaGemini(
  client: SupabaseClient,
  baseCatalog: readonly AiModelCatalogEntry[],
  options: SyncLatestAiModelsOptions,
): Promise<AiModelCatalogEntry[] | null> {
  const seedJson = JSON.stringify(
    baseCatalog.map((entry) => ({
      provider: entry.provider,
      display_name: entry.display_name,
      api_id: entry.api_id,
      model_type: entry.model_type,
      hint: entry.hint,
      cost_info: entry.cost_info,
      description: entry.description,
      sort_order: entry.sort_order,
      is_active: entry.is_active ?? true,
    })),
  )

  const systemPrompt = `You are the NH-AX-HUB model registry assistant.
Return ONLY a JSON array (no markdown prose). Each object must include:
provider, display_name, api_id, model_type, hint (short Korean),
cost_info (저렴|보통|높음|프리미엄), description (Korean workplace guide),
sort_order (number), is_active (boolean).
CRITICAL RULES:
- ONLY update metadata for the exact api_id values in the input.
- NEVER add new api_id values.
- NEVER invent model names or versions.
- Keep api_id strings identical to the input.`

  const userPrompt = `Update Korean workplace metadata for this verified official catalog:\n${seedJson}`

  let rawText = ''
  const outcome = await invokeAiChat({
    supabase: client,
    messages: [{ role: 'user', content: userPrompt }],
    activeModel: AI_MODELS_SYNC_MODEL_ID,
    tokenLimit: options.tokenLimit ?? 1_000_000,
    currentTokenUsage: options.currentTokenUsage ?? 0,
    billingUserId: options.userId,
    experimental_lab: {
      system_prompt: systemPrompt,
      system_prompt_mode: 'replace',
    },
    onTextDelta: (delta) => {
      rawText += delta
    },
  })

  if (!outcome.ok) {
    console.warn('[ai-models-sync] Gemini metadata enrich failed:', outcome.message)
    return null
  }

  const aiRows = parseCatalogJsonFromAi(rawText)
  if (!aiRows?.length) {
    console.warn('[ai-models-sync] Gemini metadata JSON parse failed')
    return null
  }

  return enrichVerifiedCatalogMetadata(baseCatalog, aiRows)
}

/** 공식 검증 카탈로그 + Google live API 교차검증 후 ai_models upsert */
export async function syncLatestAiModelsCatalog(
  client: SupabaseClient,
  options?: SyncLatestAiModelsOptions,
): Promise<SyncLatestAiModelsResult> {
  let liveGoogleIds: Set<string> | null = null
  if (options?.accessToken) {
    liveGoogleIds = await fetchLiveGoogleModelIds(options.accessToken)
  }

  let catalog = filterCatalogByLiveGoogleModels(
    VERIFIED_AI_MODELS_CATALOG,
    liveGoogleIds,
  )
  let source: 'gemini' | 'verified' = 'verified'

  if (options?.userId) {
    const enriched = await enrichCatalogViaGemini(client, catalog, options)
    if (enriched?.length) {
      catalog = enriched
      source = 'gemini'
    }
  }

  const apiIds = catalog.map((entry) => entry.api_id)
  const payloads = catalog.map(catalogEntryToPayload)

  try {
    const result = await upsertAiModelsAdmin(payloads)
    const deactivated = await deactivateAiModelsNotInApiIds(apiIds)
    return {
      ok: true,
      upserted: result.upserted,
      deactivated,
      source,
      liveGoogleChecked: liveGoogleIds != null,
    }
  } catch (syncErr) {
    const message =
      syncErr instanceof Error ? syncErr.message : 'AI 모델 동기화에 실패했습니다.'
    return { ok: false, message }
  }
}
