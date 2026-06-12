export type NotebookSourceKind = 'knowledge_base' | 'user_upload'

/** RAG 검색·인용에 쓰이는 문서 청크 메타데이터 */
export type NotebookChunkCitation = {
  index: number
  chunkId: string
  documentId: string
  filename: string
  pageNumber: number | null
  matchedText: string
}

export type NotebookSource = {
  id: string
  kind: NotebookSourceKind
  fileName: string
  category?: string
  createdAt: string
}

export type NotebookChatRole = 'user' | 'assistant'

export type NotebookChatMessage = {
  id: string
  role: NotebookChatRole
  content: string
  citations?: NotebookChunkCitation[]
  createdAt: string
}

export type NotebookPinnedNote = {
  id: string
  title: string
  body: string
  sourceMessageId?: string
  citations?: NotebookChunkCitation[]
  pinnedAt: string
}
