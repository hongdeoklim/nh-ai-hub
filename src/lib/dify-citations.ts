import type { ChatCitationSource } from '../types/chat-citations'

/** 출처 미리보기에 넣을 본문 최대 길이 */
const SNIPPET_MAX = 280

type DifyRetrieverResource = {
  position?: unknown
  dataset_name?: unknown
  document_id?: unknown
  document_name?: unknown
  content?: unknown
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Dify `message_end` 이벤트의 metadata.retriever_resources(지식 베이스에서 찾은 문서 조각)를
 * 채팅 말풍선의 출처 목록 형식으로 바꾼다. 같은 문서의 여러 조각은 한 출처로 합친다.
 */
export function difyRetrieverSources(metadata: unknown): ChatCitationSource[] {
  if (!metadata || typeof metadata !== 'object') return []
  const raw = (metadata as { retriever_resources?: unknown }).retriever_resources
  if (!Array.isArray(raw)) return []

  const byKey = new Map<string, ChatCitationSource>()
  for (const item of raw as DifyRetrieverResource[]) {
    if (!item || typeof item !== 'object') continue
    const title = str(item.document_name) || str(item.dataset_name) || '사내 문서'
    const id = str(item.document_id) || undefined
    const key = id ?? title
    if (byKey.has(key)) continue
    const content = str(item.content)
    byKey.set(key, {
      index: byKey.size + 1,
      title,
      snippet: content ? content.slice(0, SNIPPET_MAX) : undefined,
      sourceType: 'document',
      id,
    })
  }
  return [...byKey.values()]
}
