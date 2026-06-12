import type {
  AiSlidesAspectRatio,
  AiSlidesGuideMode,
  AiSlidesImageEngine,
  AiSlidesStyleMode,
} from '../data/ai-slides-catalog'

export const AI_SLIDES_BOOTSTRAP_PREFIX = 'nh-ai-hub.ai-slides-bootstrap.v1.'

export type AiSlidesBootstrapPayload = {
  templateId: string
  templateTitle: string
  styleMode: AiSlidesStyleMode
  guideMode: AiSlidesGuideMode
  aspectRatio: AiSlidesAspectRatio
  imageEngine: AiSlidesImageEngine
  prompt: string
  selectedModel?: string
  autoSend?: boolean
}

export function aiSlidesBootstrapKey(threadId: string) {
  return `${AI_SLIDES_BOOTSTRAP_PREFIX}${threadId}`
}

export function readAiSlidesBootstrap(
  threadId: string,
): AiSlidesBootstrapPayload | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(aiSlidesBootstrapKey(threadId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as AiSlidesBootstrapPayload
    if (!parsed?.templateId || typeof parsed.prompt !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function writeAiSlidesBootstrap(
  threadId: string,
  payload: AiSlidesBootstrapPayload,
) {
  try {
    sessionStorage.setItem(
      aiSlidesBootstrapKey(threadId),
      JSON.stringify(payload),
    )
  } catch {
    /* quota */
  }
}

export function clearAiSlidesBootstrap(threadId: string) {
  try {
    sessionStorage.removeItem(aiSlidesBootstrapKey(threadId))
  } catch {
    /* ignore */
  }
}
