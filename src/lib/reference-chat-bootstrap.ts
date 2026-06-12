import type { KnowledgeBaseRow } from '../services/reference-room/knowledge-base'

export const REFERENCE_CHAT_BOOTSTRAP_PREFIX = 'nh-ai-hub.reference-bootstrap.v1.'

export type ReferenceRoomBootstrapPayload = {
  items: Pick<KnowledgeBaseRow, 'id' | 'file_name' | 'file_url'>[]
}

export function referenceChatBootstrapKey(threadId: string) {
  return `${REFERENCE_CHAT_BOOTSTRAP_PREFIX}${threadId}`
}

export function readReferenceBootstrap(
  threadId: string,
): ReferenceRoomBootstrapPayload | null {
  if (typeof sessionStorage === 'undefined') return null
  const key = referenceChatBootstrapKey(threadId)
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ReferenceRoomBootstrapPayload
    if (!parsed?.items || !Array.isArray(parsed.items) || parsed.items.length === 0) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearReferenceBootstrap(threadId: string) {
  try {
    sessionStorage.removeItem(referenceChatBootstrapKey(threadId))
  } catch {
    /* ignore */
  }
}

export function writeReferenceBootstrap(threadId: string, payload: ReferenceRoomBootstrapPayload) {
  try {
    sessionStorage.setItem(referenceChatBootstrapKey(threadId), JSON.stringify(payload))
  } catch {
    /* quota */
  }
}
