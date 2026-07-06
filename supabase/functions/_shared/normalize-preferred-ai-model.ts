/**
 * `users.preferred_ai`/요청 바디 모델 문자열을 공급자·실제 API model id 로 정규화합니다.
 * 브라우저(`src/lib/normalize-preferred-ai-model.ts`)와 동기화하세요.
 */

export type ResolvedChatModelKind =
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "hermes"
  | "openrouter"

export type ResolvedChatModel = {
  kind: ResolvedChatModelKind
  modelId: string
}

/** OpenAI Chat Completions 호환 플래그십 계열 (2026 공식 스냅샷 별칭 포함) */
const OPENAI_KNOWN = new Set([
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-4o",
  "gpt-4o-mini",
])

/** Anthropic Messages API (Sonnet 4.6·Opus 4.7 + 레거시 4.5 저장값) */
const ANTHROPIC_KNOWN = new Set([
  "claude-opus-4-7",
  "claude-opus-4-5",
  "claude-sonnet-4-6",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
])

/** Google Generative AI (Gemini 3 프리뷰 + 2.5 안정) */
const GOOGLE_KNOWN = new Set([
  "gemini-3.5-flash",
  "gemini-3.1-pro-preview",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
])

/**
 * 카탈로그의 가상 모델 ID(미출시 표기) → 실제 API 모델 ID.
 * 실존하는 ID(claude-*-4-5, gpt-4o, gemini-2.5-* 등)는 그대로 통과시켜
 * 사용자가 선택한 모델·버전이 조용히 다른 모델로 바뀌지 않게 한다.
 */
export function mapVirtualToRealModelId(kind: string, modelId: string): string {
  const m = modelId.toLowerCase();
  if (kind === 'openai') {
    if (m.startsWith('gpt-5.5')) return 'gpt-5';
    if (m.startsWith('gpt-5.4-nano')) return 'gpt-5-nano';
    if (m.startsWith('gpt-5.4-mini')) return 'gpt-5-mini';
    if (m.startsWith('gpt-5.4')) return 'gpt-5';
  }
  if (kind === 'anthropic') {
    // 가상 4.6/4.7 세대만 실존 4.5 세대로 강하 — 실존 ID는 통과
    if (m.includes('4-7') || m.includes('4.7')) return 'claude-opus-4-5';
    if (m.includes('4-6') || m.includes('4.6')) return 'claude-sonnet-4-5';
  }
  if (kind === 'google') {
    if (m.includes('3.5-flash') || m.includes('3-flash')) return 'gemini-2.5-flash';
    if (m.includes('3.1-pro')) return 'gemini-2.5-pro';
    if (m.includes('3.1') && m.includes('lite')) return 'gemini-2.5-flash-lite';
  }
  return modelId;
}

export function normalizePreferredAiToResolvedModel(
  preferredAi: string,
): ResolvedChatModel {
  const result = _normalizePreferredAiToResolvedModel(preferredAi)
  return {
    kind: result.kind,
    modelId: mapVirtualToRealModelId(result.kind, result.modelId),
  }
}

function _normalizePreferredAiToResolvedModel(
  preferredAi: string,
): ResolvedChatModel {
  const trimmed = preferredAi.trim()
  const raw = trimmed.toLowerCase()

  if (!raw) {
    return { kind: "openai", modelId: "gpt-5.4" }
  }

  if (raw === "google" || raw === "gemini") {
    return { kind: "google", modelId: "gemini-2.5-flash" }
  }

  // OpenRouter 네임스페이스 ID(예: meta-llama/llama-3.3-70b-instruct)는 그대로 통과
  if (raw.includes("/")) {
    return { kind: "openrouter", modelId: trimmed }
  }

  if (raw.startsWith("deepseek")) {
    return {
      kind: "deepseek",
      modelId: raw.includes("reason") ? "deepseek-reasoner" : "deepseek-chat",
    }
  }

  if (raw.startsWith("hermes")) {
    return { kind: "hermes", modelId: trimmed }
  }

  if (OPENAI_KNOWN.has(raw)) {
    return { kind: "openai", modelId: raw }
  }

  if (ANTHROPIC_KNOWN.has(raw)) {
    return { kind: "anthropic", modelId: raw }
  }

  if (GOOGLE_KNOWN.has(raw)) {
    return { kind: "google", modelId: raw }
  }

  if (raw === "gpt-5-mini") {
    return { kind: "openai", modelId: "gpt-5.4-mini" }
  }

  if (raw.includes("gemini")) {
    let modelId = "gemini-2.5-flash"
    if (raw.includes("3.1") && raw.includes("pro")) {
      modelId = "gemini-3.1-pro-preview"
    } else if (
      raw.includes("3.1") && (raw.includes("flash-lite") || raw.includes("lite"))
    ) {
      modelId = "gemini-3.1-flash-lite"
    } else if (
      raw.includes("3-flash") ||
      (raw.includes("3") && raw.includes("flash") && !raw.includes("lite"))
    ) {
      modelId = "gemini-3-flash-preview"
    } else if (raw.includes("flash-lite") || /\bflash[\s_-]*lite\b/.test(raw)) {
      modelId = "gemini-2.5-flash-lite"
    } else if (raw.includes("pro")) {
      modelId = "gemini-2.5-pro"
    }
    return { kind: "google", modelId }
  }

  if (raw.includes("claude") || raw.includes("anthropic")) {
    if (raw.includes("haiku")) {
      return { kind: "anthropic", modelId: "claude-haiku-4-5" }
    }
    if (raw.includes("opus")) {
      if (raw.includes("4-7") || raw.includes("4.7")) {
        return { kind: "anthropic", modelId: "claude-opus-4-7" }
      }
      if (raw.includes("4-5") || raw.includes("4.5")) {
        return { kind: "anthropic", modelId: "claude-opus-4-5" }
      }
      return { kind: "anthropic", modelId: "claude-opus-4-7" }
    }
    if (raw.includes("sonnet")) {
      if (raw.includes("4-6") || raw.includes("4.6")) {
        return { kind: "anthropic", modelId: "claude-sonnet-4-6" }
      }
      if (raw.includes("4-5") || raw.includes("4.5")) {
        return { kind: "anthropic", modelId: "claude-sonnet-4-5" }
      }
      return { kind: "anthropic", modelId: "claude-sonnet-4-6" }
    }
    return { kind: "anthropic", modelId: "claude-sonnet-4-6" }
  }

  if (
    (raw.includes("o1") || raw.includes("o3") || raw.includes("o4")) &&
    !raw.includes("mini")
  ) {
    return { kind: "openai", modelId: "gpt-5.5" }
  }

  if (
    raw.includes("gpt") ||
    raw.includes("openai") ||
    raw.includes("o3") ||
    raw.includes("o4") ||
    raw.includes("o1")
  ) {
    if (raw.includes("nano")) {
      return { kind: "openai", modelId: "gpt-5.4-nano" }
    }
    if (raw.includes("mini")) {
      return {
        kind: "openai",
        modelId: raw.includes("4o") ? "gpt-4o-mini" : "gpt-5.4-mini",
      }
    }
    if (raw.includes("gpt-5.5") || raw.includes("5.5")) {
      return { kind: "openai", modelId: "gpt-5.5" }
    }
    if (raw.includes("gpt-5.4") || raw.includes("5.4")) {
      return { kind: "openai", modelId: "gpt-5.4" }
    }
    if (raw.includes("gpt-5")) {
      return { kind: "openai", modelId: "gpt-5.4" }
    }
    if (raw.includes("gpt-4o")) {
      return { kind: "openai", modelId: "gpt-4o" }
    }
    return { kind: "openai", modelId: "gpt-5.4" }
  }

  return { kind: "openai", modelId: "gpt-5.4" }
}
