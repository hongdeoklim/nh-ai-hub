export type NotebookGraphNodeKind = 'document' | 'entity'

export type NotebookGraphNode = {
  id: string
  kind: NotebookGraphNodeKind
  label: string
  documentId?: string
  sourceKind?: 'knowledge_base' | 'user_upload'
  entityType?: string
  summary?: string
}

export type NotebookGraphLink = {
  id: string
  source: string
  target: string
  relationType: string
  description: string
  weight: number
}

export type NotebookGraphData = {
  nodes: NotebookGraphNode[]
  links: NotebookGraphLink[]
}
