import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  NotebookGraphData,
  NotebookGraphLink,
  NotebookGraphNode,
} from '../../types/notebook-graph'
import type { NotebookSource } from '../../types/notebook'

function clipLabel(text: string, max = 22): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

export async function fetchNotebookGraphData(
  client: SupabaseClient,
  sources: NotebookSource[],
  selectedIds: string[],
): Promise<NotebookGraphData> {
  const selected = sources.filter((s) => selectedIds.includes(s.id))
  const docIdSet = new Set(selected.map((s) => s.id))

  const nodes: NotebookGraphNode[] = selected.map((s) => ({
    id: `doc:${s.id}`,
    kind: 'document',
    label: clipLabel(s.fileName),
    documentId: s.id,
    sourceKind: s.kind,
    summary: s.fileName,
  }))

  const links: NotebookGraphLink[] = []

  if (docIdSet.size === 0) {
    return { nodes, links }
  }

  const docIds = [...docIdSet]

  const { data: relations } = await client
    .from('document_relations')
    .select(
      'id, source_doc_id, target_doc_id, relation_type, description, weight',
    )
    .or(
      `source_doc_id.in.(${docIds.join(',')}),target_doc_id.in.(${docIds.join(',')})`,
    )
    .limit(80)

  for (const rel of relations ?? []) {
    const srcId = String(rel.source_doc_id)
    const tgtId = String(rel.target_doc_id)
    if (!docIdSet.has(srcId) || !docIdSet.has(tgtId)) continue

    links.push({
      id: String(rel.id),
      source: `doc:${srcId}`,
      target: `doc:${tgtId}`,
      relationType: String(rel.relation_type ?? 'related'),
      description: String(rel.description ?? ''),
      weight: Number(rel.weight ?? 0.5),
    })
  }

  const { data: entities } = await client
    .from('document_entities')
    .select('id, document_id, entity_type, entity_value, confidence')
    .in('document_id', docIds)
    .limit(120)

  const entityNodeIds = new Map<string, string>()

  for (const ent of entities ?? []) {
    const docId = String(ent.document_id)
    const value = String(ent.entity_value ?? '').trim()
    if (!value || !docIdSet.has(docId)) continue

    const key = `${String(ent.entity_type)}:${value.toLowerCase()}`
    let nodeId = entityNodeIds.get(key)
    if (!nodeId) {
      nodeId = `ent:${key}`
      entityNodeIds.set(key, nodeId)
      nodes.push({
        id: nodeId,
        kind: 'entity',
        label: clipLabel(value, 16),
        entityType: String(ent.entity_type ?? 'keyword'),
        summary: value,
      })
    }

    const docNodeId = `doc:${docId}`
    const weight = Math.min(1, Math.max(0.2, Number(ent.confidence ?? 0.5)))
    links.push({
      id: `ent-link:${ent.id}`,
      source: docNodeId,
      target: nodeId,
      relationType: 'has_entity',
      description: `${value} (${ent.entity_type})`,
      weight,
    })
  }

  return { nodes, links }
}

export async function fetchDocumentSummaryForChat(
  client: SupabaseClient,
  documentId: string,
  fileName: string,
): Promise<string> {
  const { data: chunks } = await client
    .from('document_chunks')
    .select('content, page_number')
    .eq('document_id', documentId)
    .order('chunk_index', { ascending: true })
    .limit(3)

  if (chunks?.length) {
    const body = chunks
      .map(
        (c, i) =>
          `[${i + 1}]${c.page_number != null ? ` p.${c.page_number}` : ''} ${String(c.content ?? '').slice(0, 400)}`,
      )
      .join('\n\n')
    return `【문서: ${fileName}】\n${body}`
  }

  const { data: entities } = await client
    .from('document_entities')
    .select('entity_type, entity_value')
    .eq('document_id', documentId)
    .limit(12)

  const entLine = (entities ?? [])
    .map((e) => `${e.entity_type}: ${e.entity_value}`)
    .join(', ')

  return `【문서: ${fileName}】\n${entLine ? `핵심 개체: ${entLine}` : '요약 데이터가 아직 없습니다. 문서 처리를 기다려 주세요.'}`
}
