import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.8"
import type {
  NHAssistantCostLevel,
  NHAssistantFallbackReasonCode,
  NHAssistantPlan,
  NHExtendedTaskType,
  NHSelectedAssistant,
} from "./nh-smart-routing.ts"

declare const EdgeRuntime:
  | { waitUntil(promise: Promise<unknown>): void }
  | undefined

const ROUTER_VERSION = "assistant-shadow-v1"

const ALLOWED_REASON_CODES = new Set<NHSelectedAssistant["reasonCode"]>([
  "task_match",
  "explicit_service_intent",
  "required_tool_match",
  "public_data_match",
  "compound_request",
])

const ALLOWED_FALLBACK_CODES = new Set<NHAssistantFallbackReasonCode>([
  "no_explicit_assistant_intent",
  "no_eligible_candidate",
  "registry_unavailable",
  "permission_unverified",
  "required_extension_unavailable",
  "cost_policy_blocked",
  "router_exception",
])

const ERROR_FALLBACK_CODES = new Set<NHAssistantFallbackReasonCode>([
  "registry_unavailable",
  "permission_unverified",
  "required_extension_unavailable",
  "cost_policy_blocked",
  "router_exception",
])

export interface AssistantRouterShadowLogInput {
  admin: SupabaseClient
  requestType: NHExtendedTaskType
  plan: NHAssistantPlan
  decisionLatencyMs?: number
}

function readEnv(name: string): string | undefined {
  try {
    return typeof Deno !== "undefined" ? Deno.env.get(name)?.trim() || undefined : undefined
  } catch {
    return undefined
  }
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = readEnv(name)?.toLowerCase()
  if (!value) return fallback
  return value === "1" || value === "true" || value === "yes" || value === "on"
}

function readSampleRate(): number {
  const parsed = Number(readEnv("ASSISTANT_ROUTER_SHADOW_LOG_SAMPLE_RATE") ?? "1")
  if (!Number.isFinite(parsed)) return 1
  return Math.min(1, Math.max(0, parsed))
}

function normalizeCostLevel(value: NHAssistantCostLevel): NHAssistantCostLevel {
  return value === "medium" || value === "high" ? value : "low"
}

function normalizeFallbackReason(
  value: NHAssistantFallbackReasonCode | undefined,
): NHAssistantFallbackReasonCode | null {
  return value && ALLOWED_FALLBACK_CODES.has(value) ? value : null
}

function shouldRecord(plan: NHAssistantPlan): boolean {
  if (!readBooleanEnv("ASSISTANT_ROUTER_SHADOW_LOG_ENABLED", false)) return false

  const fallbackReason = normalizeFallbackReason(plan.fallbackReasonCode)
  const isCandidateDecision = plan.selectedAssistants.length > 0
  const isErrorFallback = fallbackReason !== null && ERROR_FALLBACK_CODES.has(fallbackReason)

  if (isCandidateDecision || isErrorFallback) return true
  return Math.random() < readSampleRate()
}

async function insertShadowLog(input: AssistantRouterShadowLogInput): Promise<void> {
  try {
    const selectedAssistants = input.plan.selectedAssistants.slice(0, 3)
    const selectedAssistantIds = selectedAssistants.map((assistant) => assistant.assistantId)
    const selectionReasonCodes = Array.from(new Set(
      selectedAssistants
        .map((assistant) => assistant.reasonCode)
        .filter((code) => ALLOWED_REASON_CODES.has(code)),
    ))
    const decisionLatencyMs = Number.isFinite(input.decisionLatencyMs)
      ? Math.max(0, Math.round(input.decisionLatencyMs ?? 0))
      : null

    const { error } = await input.admin
      .from("assistant_router_shadow_logs")
      .insert({
        request_type: input.requestType,
        request_complexity: input.plan.requestComplexity,
        selection_mode: input.plan.selectionMode,
        selected_assistant_ids: selectedAssistantIds,
        selection_reason_codes: selectionReasonCodes,
        cost_level: normalizeCostLevel(input.plan.estimatedCostLevel),
        fallback_reason_code: normalizeFallbackReason(input.plan.fallbackReasonCode),
        candidate_count: selectedAssistantIds.length,
        decision_latency_ms: decisionLatencyMs,
        router_version: ROUTER_VERSION,
      })

    if (error) {
      console.warn("[Assistant-Router][shadow-log] insert skipped", error.code ?? "insert_failed")
    }
  } catch {
    console.warn("[Assistant-Router][shadow-log] insert skipped", "unexpected_error")
  }
}

/**
 * Schedules a privacy-minimized Shadow Mode decision log.
 * The input intentionally excludes prompts, messages, user identifiers,
 * document identifiers, storage paths, and tool input/output.
 */
export function scheduleAssistantRouterShadowLog(
  input: AssistantRouterShadowLogInput,
): void {
  if (!shouldRecord(input.plan)) return

  const task = insertShadowLog(input)
  try {
    if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
      EdgeRuntime.waitUntil(task)
      return
    }
  } catch {
    console.warn("[Assistant-Router][shadow-log] background scheduling skipped", "wait_until_failed")
  }

  void task
}
