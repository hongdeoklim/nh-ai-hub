import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.8"

const BUDGET_EXHAUSTED_MESSAGE =
  "부서의 이번 달 AI 사용 예산이 모두 소진되었습니다."

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

function parsePositiveUsd(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function readBudgetEstimatedCallUsd(): number {
  return parsePositiveUsd(readEnv("BUDGET_ESTIMATED_CALL_USD"), 0.05)
}

export function readDeepResearchEstimatedUsd(): number {
  return parsePositiveUsd(readEnv("BUDGET_DEEP_RESEARCH_ESTIMATED_USD"), 0.2)
}

export function normalizeBudgetDepartment(
  department: string | null | undefined,
): string {
  const trimmed = typeof department === "string" ? department.trim() : ""
  return trimmed.length > 0 ? trimmed : "공통"
}

export async function assertDepartmentBudgetAllowed(params: {
  adminClient: SupabaseClient
  department: string | null
  estimatedCostUsd: number
  skipForAdmin?: boolean
  isAdmin?: boolean
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (params.skipForAdmin === true || params.isAdmin === true) {
    return { ok: true }
  }

  const dept = normalizeBudgetDepartment(params.department)
  const cost = params.estimatedCostUsd

  if (!Number.isFinite(cost) || cost < 0) {
    return { ok: false, message: BUDGET_EXHAUSTED_MESSAGE }
  }

  const { data, error } = await params.adminClient.rpc("check_and_deduct_budget", {
    p_department: dept,
    p_cost: cost,
  })

  if (error) {
    console.error("[budgetHelper] check_and_deduct_budget RPC error", error)
    return { ok: false, message: BUDGET_EXHAUSTED_MESSAGE }
  }

  if (data === true) {
    return { ok: true }
  }

  return { ok: false, message: BUDGET_EXHAUSTED_MESSAGE }
}
