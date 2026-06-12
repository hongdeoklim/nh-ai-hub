import type { AiDesignerCategoryId } from '../data/ai-designer-catalog'

export const AI_DESIGNER_BOOTSTRAP_PREFIX = 'nh-ai-hub.ai-designer-bootstrap.v1.'

export type AiDesignerBootstrapPayload = {
  categoryId: AiDesignerCategoryId
  categoryLabel: string
  prompt: string
  selectedModel?: string
  autoSend?: boolean
  /** true면 채팅에서 이미지 생성 도구로 자동 실행 */
  useImageGeneration?: boolean
}

export function readAiDesignerBootstrap(
  threadId: string,
): AiDesignerBootstrapPayload | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(`${AI_DESIGNER_BOOTSTRAP_PREFIX}${threadId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AiDesignerBootstrapPayload
    if (!parsed?.categoryId || typeof parsed.prompt !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function writeAiDesignerBootstrap(
  threadId: string,
  payload: AiDesignerBootstrapPayload,
) {
  try {
    sessionStorage.setItem(
      `${AI_DESIGNER_BOOTSTRAP_PREFIX}${threadId}`,
      JSON.stringify(payload),
    )
  } catch {
    /* quota */
  }
}

export function clearAiDesignerBootstrap(threadId: string) {
  try {
    sessionStorage.removeItem(`${AI_DESIGNER_BOOTSTRAP_PREFIX}${threadId}`)
  } catch {
    /* ignore */
  }
}
