import { supabase } from '../../lib/supabase'
import {
  fetchAllAiModelsAdmin,
} from '../ai/ai-models-client'
import type { AiModelProvider, AiModelRow, AiModelType } from '../../types/ai-models'
import { sortAiModelRowsForAdmin } from './sort-ai-model-rows'

export type AiModelWriteInput = {
  provider: AiModelProvider
  display_name: string
  api_id: string
  model_type: AiModelType
  hint: string | null
  cost_info: string
  description: string | null
  is_active: boolean
  sort_order: number
}

function sortAiModelRows(rows: AiModelRow[]): AiModelRow[] {
  return sortAiModelRowsForAdmin(rows)
}

export function buildAiModelWritePayload(
  input: AiModelWriteInput,
): Record<string, unknown> {
  const display_name = input.display_name.trim()
  const api_id = input.api_id.trim()
  const cost_info = input.cost_info.trim() || '보통'

  return {
    provider: input.provider,
    display_name,
    model_name: display_name,
    model_id: api_id,
    api_id,
    model_type: input.model_type,
    hint: input.hint,
    cost_info,
    description: input.description,
    is_active: input.is_active,
    sort_order: input.sort_order,
  }
}

type AdminUpsertRpcResult = {
  ok: boolean
  error?: string
  upserted?: number
}

function isRpcMissing(error: { code?: string; message?: string }): boolean {
  const message = error.message ?? ''
  return (
    error.code === '42883' ||
    error.code === 'PGRST202' ||
    /Could not find the function public\.admin_upsert_ai_models/i.test(message) ||
    /function public\.admin_upsert_ai_models\(.*\) does not exist/i.test(message)
  )
}

function isConflictError(error: { code?: string; message?: string }): boolean {
  const message = error.message ?? ''
  return (
    error.code === '23505' ||
    error.code === '409' ||
    /duplicate key/i.test(message) ||
    /Conflict/i.test(message)
  )
}

function isForbiddenError(message: string): boolean {
  return (
    /403/i.test(message) ||
    /forbidden/i.test(message) ||
    /permission denied/i.test(message) ||
    /42501/i.test(message)
  )
}

function forbiddenMessage(): string {
  return '관리자 DB 권한이 없습니다. users.is_admin 또는 role=admin 설정과 supabase db push(20260532200000) 적용을 확인해 주세요.'
}

async function findSavedAiModel(
  input: AiModelWriteInput,
  editingId?: string,
): Promise<AiModelRow> {
  const refreshed = await fetchAllAiModelsAdmin()
  const apiId = input.api_id.trim()
  const match =
    (editingId ? refreshed.find((item) => item.id === editingId) : undefined) ??
    refreshed.find((item) => item.api_id === apiId)

  if (match) return match
  throw new Error('저장은 완료됐지만 반영된 행을 확인하지 못했습니다.')
}

export async function upsertAiModelsAdmin(
  payloads: Record<string, unknown>[],
): Promise<{ upserted: number }> {
  const { data, error } = await supabase.rpc('admin_upsert_ai_models', {
    p_models: payloads,
  })

  if (!error) {
    const result = data as AdminUpsertRpcResult | null
    if (!result?.ok) {
      if (result?.error === 'forbidden') {
        throw new Error(forbiddenMessage())
      }
      if (result?.error?.includes('model_type_check_violation')) {
        throw new Error(
          '동영상 타입은 DB 마이그레이션(20260531900000) 적용 후 사용할 수 있습니다.',
        )
      }
      throw new Error(result?.error ?? 'AI 모델 저장에 실패했습니다.')
    }
    return { upserted: result.upserted ?? payloads.length }
  }

  if (isRpcMissing(error)) {
    throw new Error(
      'admin_upsert_ai_models RPC가 없습니다. Supabase SQL Editor에서 20260532200000·20260532300000 마이그레이션을 적용해 주세요.',
    )
  }

  if (isForbiddenError(error.message ?? '')) {
    throw new Error(forbiddenMessage())
  }

  if (isConflictError(error)) {
    throw new Error(
      '기존 모델과 api_id/model_id가 충돌했습니다. Supabase SQL Editor에서 20260532300000 마이그레이션 적용 후 다시 시도해 주세요.',
    )
  }

  throw new Error(error.message)
}

async function mutateAiModelWithSchemaFallback(
  input: AiModelWriteInput,
  editingId?: string,
): Promise<AiModelRow> {
  await upsertAiModelsAdmin([buildAiModelWritePayload(input)])
  return findSavedAiModel(input, editingId)
}

export async function createAiModelAdmin(
  input: AiModelWriteInput,
): Promise<AiModelRow> {
  return mutateAiModelWithSchemaFallback(input)
}

export async function updateAiModelAdmin(
  id: string,
  input: AiModelWriteInput,
): Promise<AiModelRow> {
  return mutateAiModelWithSchemaFallback(input, id)
}

export async function listAiModelsAdmin(): Promise<AiModelRow[]> {
  const rows = await fetchAllAiModelsAdmin()
  return sortAiModelRows(rows)
}

export async function deactivateAiModelsNotInApiIds(
  apiIds: readonly string[],
): Promise<number> {
  const keep = new Set(apiIds.map((id) => id.trim()).filter((id) => id.length > 0))
  if (keep.size === 0) return 0

  const rows = await fetchAllAiModelsAdmin()
  const staleIds = rows
    .filter((row) => row.is_active && !keep.has(row.api_id))
    .map((row) => row.id)

  if (staleIds.length === 0) return 0

  const { data, error } = await supabase
    .from('ai_models')
    .update({ is_active: false })
    .in('id', staleIds)
    .select('id')

  if (error) {
    console.warn('[ai-models-admin] deactivate stale models failed:', error.message)
    return 0
  }

  return data?.length ?? 0
}

export async function deleteAiModelAdmin(id: string): Promise<void> {
  const { error } = await supabase.from('ai_models').delete().eq('id', id)
  if (error) {
    if (isForbiddenError(error.message ?? '')) {
      throw new Error(forbiddenMessage())
    }
    throw new Error(error.message)
  }
}

export { sortAiModelRows }
