/**
 * Edge Function — ai_models 레지스트리 조회·동적 라우팅
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.8"

import { normalizePreferredAiToResolvedModel } from "./normalize-preferred-ai-model.ts"

export type AiModelRegistryEntry = {
  provider: "anthropic" | "openai" | "google"
  api_id: string
  model_type: "text" | "image"
  is_active: boolean
}

export type ProviderKind = "openai" | "anthropic" | "google"

const REGISTRY_TTL_MS = 60_000

let registryCache:
  | { loadedAt: number; byApiId: Map<string, AiModelRegistryEntry> }
  | null = null

function providerToKind(provider: string): ProviderKind {
  if (provider === "google") return "google"
  if (provider === "anthropic") return "anthropic"
  return "openai"
}

export async function loadAiModelRegistry(
  adminClient: SupabaseClient,
): Promise<Map<string, AiModelRegistryEntry>> {
  const now = Date.now()
  if (registryCache && now - registryCache.loadedAt < REGISTRY_TTL_MS) {
    return registryCache.byApiId
  }

  const { data, error } = await adminClient
    .from("ai_models")
    .select("provider, api_id, model_type, is_active")

  if (error) {
    console.warn("[ai-chat] ai_models registry load failed:", error.message)
    return registryCache?.byApiId ?? new Map()
  }

  const byApiId = new Map<string, AiModelRegistryEntry>()
  for (const row of data ?? []) {
    const api_id = typeof row.api_id === "string" ? row.api_id.trim() : ""
    if (!api_id.length) continue
    const providerRaw = typeof row.provider === "string"
      ? row.provider.trim().toLowerCase()
      : "openai"
    const provider = providerRaw === "google" || providerRaw === "anthropic"
      ? providerRaw
      : "openai"
    const model_type = row.model_type === "image" ? "image" : "text"
    byApiId.set(api_id.toLowerCase(), {
      provider,
      api_id,
      model_type,
      is_active: row.is_active !== false,
    })
  }

  registryCache = { loadedAt: now, byApiId }
  return byApiId
}

export type ResolvedRegistryModel = {
  kind: ProviderKind
  modelId: string
  fromRegistry: boolean
  registryActive: boolean
}

/**
 * 레지스트리 우선 → 없으면 normalizePreferredAiToResolvedModel 휴리스틱(유연 폴백).
 */
export async function resolveRequestedChatModel(
  adminClient: SupabaseClient,
  requestedModel: string,
): Promise<ResolvedRegistryModel> {
  const trimmed = requestedModel.trim()
  if (!trimmed.length || trimmed.toLowerCase() === "auto") {
    const fallback = normalizePreferredAiToResolvedModel("gemini-2.5-flash")
    return {
      kind: fallback.kind,
      modelId: fallback.modelId,
      fromRegistry: false,
      registryActive: true,
    }
  }

  const registry = await loadAiModelRegistry(adminClient)
  const entry = registry.get(trimmed.toLowerCase())

  if (entry) {
    if (!entry.is_active) {
      console.warn(
        "[ai-chat] inactive model in registry, heuristic fallback:",
        trimmed,
      )
    } else if (entry.model_type === "image") {
      console.warn(
        "[ai-chat] image model requested for text chat, heuristic fallback:",
        trimmed,
      )
    } else {
      return {
        kind: providerToKind(entry.provider),
        modelId: entry.api_id,
        fromRegistry: true,
        registryActive: entry.is_active,
      }
    }
  }

  const heuristic = normalizePreferredAiToResolvedModel(trimmed)
  return {
    kind: heuristic.kind,
    modelId: heuristic.modelId,
    fromRegistry: false,
    registryActive: true,
  }
}

export async function isActiveTextModelInRegistry(
  adminClient: SupabaseClient,
  apiId: string,
): Promise<boolean | null> {
  const trimmed = apiId.trim()
  if (!trimmed.length) return false
  const registry = await loadAiModelRegistry(adminClient)
  const entry = registry.get(trimmed.toLowerCase())
  if (!entry) return null
  return entry.is_active && entry.model_type === "text"
}
