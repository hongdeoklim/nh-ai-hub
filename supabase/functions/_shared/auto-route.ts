/**
 * 자동 모델 라우팅 — 클라이언트 `src/lib/auto-model-route.ts` 와 규칙을 동기화하세요.
 */

function hasEnvKey(name: string): boolean {
  const v = Deno.env.get(name)
  return !!(v && v.length > 0)
}

function hasGoogleKey(): boolean {
  return hasEnvKey("GEMINI_API_KEY") || hasEnvKey("GOOGLE_GENERATIVE_AI_API_KEY")
}

function hasOpenAiKey(): boolean {
  return hasEnvKey("OPENAI_API_KEY")
}

function hasAnthropicKey(): boolean {
  return hasEnvKey("ANTHROPIC_API_KEY")
}

/** Secrets 에 실제로 있는 프로바이더에 맞게 모델 id 를 조정 */
export function mapModelIdToAvailableProviders(modelId: string): string {
  const id = modelId.trim()
  if (!id.length) return id

  if (id.startsWith("gemini") && hasGoogleKey()) return id
  if (id.startsWith("claude") && hasAnthropicKey()) return id
  if (
    (id.startsWith("gpt") || id.startsWith("o1") || id.startsWith("o3") ||
      id.startsWith("o4")) &&
    hasOpenAiKey()
  ) {
    return id
  }

  if (hasGoogleKey()) {
    if (id.includes("mini") || id.includes("lite") || id.includes("nano")) {
      return "gemini-2.5-flash-lite"
    }
    if (id.includes("pro") || id.includes("sonnet") || id.includes("opus")) {
      return "gemini-2.5-pro"
    }
    return "gemini-2.5-flash"
  }
  if (hasOpenAiKey()) {
    if (id.startsWith("gemini")) {
      return id.includes("lite") ? "gpt-4o-mini" : "gpt-4o"
    }
    if (id.startsWith("claude")) {
      return id.includes("haiku") ? "gpt-4o-mini" : "gpt-4o"
    }
    return id
  }
  if (hasAnthropicKey()) {
    if (id.startsWith("gemini")) {
      return id.includes("lite") ? "claude-haiku-4-5" : "claude-sonnet-4-6"
    }
    if (id.startsWith("gpt")) {
      return id.includes("mini") ? "claude-haiku-4-5" : "claude-sonnet-4-6"
    }
    return id
  }

  return id
}

export function routePromptToModelId(prompt: string, hasImages: boolean): string {
  const t = prompt.trim()
  let modelId: string

  if (hasImages) {
    modelId = "gemini-2.5-flash"
  } else if (/균열|현장\s*사진|현장\s*이미지/i.test(t)) {
    modelId = "gemini-2.5-flash"
  } else if (/시방|계약|견적|안전점검|체크리스트|분석|검토/i.test(t)) {
    modelId = t.length > 500 ? "claude-sonnet-4-6" : "gpt-4o"
  } else if (/여행|패키지|환불/i.test(t)) {
    modelId = "gpt-4o-mini"
  } else if (/공문|행정|문안/i.test(t)) {
    modelId = "gpt-4o-mini"
  } else if (t.length > 4000) {
    modelId = "claude-sonnet-4-6"
  } else if (t.length < 100) {
    modelId = "gemini-2.5-flash-lite"
  } else {
    modelId = "gemini-2.5-flash"
  }

  return mapModelIdToAvailableProviders(modelId)
}
