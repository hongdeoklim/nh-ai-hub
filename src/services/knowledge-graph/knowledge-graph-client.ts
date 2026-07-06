import { supabase } from '../../lib/supabase'

export interface GraphNode {
  id: string
  title: string
  node_type: string
  department?: string
  content?: string
  source_drive_id?: string
  created_at: string
}

export interface GraphEdge {
  id: string
  source_node_id: string
  target_node_id: string
  edge_type: string
  weight?: number
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const EMPTY_GRAPH_DATA: GraphData = { nodes: [], edges: [] }

/**
 * 키워드로 DB에서 직접 검색 → 매칭 노드 + 1-hop 이웃 + 연결 엣지 반환
 * 클라이언트 필터링과 달리 전체 DB를 대상으로 검색함
 */
export async function searchKnowledgeNodes(query: string): Promise<GraphData> {
  if (!query.trim()) return EMPTY_GRAPH_DATA

  const q = `%${query.trim()}%`

  // title OR content OR department ilike 검색
  const { data: matchedNodes, error: searchErr } = await supabase
    .from('nh_knowledge_nodes')
    .select('id, title, node_type, department, content, source_drive_id, created_at')
    .or(`title.ilike.${q},content.ilike.${q},department.ilike.${q}`)
    .limit(200)

  if (searchErr || !matchedNodes?.length) return EMPTY_GRAPH_DATA

  const matchedIds = matchedNodes.map(n => n.id)

  // 매칭 노드와 연결된 엣지 (source 또는 target 방향 모두)
  const { data: relatedEdges } = await supabase
    .from('nh_knowledge_edges')
    .select('id, source_node_id, target_node_id, edge_type, weight')
    .or(`source_node_id.in.(${matchedIds.join(',')}),target_node_id.in.(${matchedIds.join(',')})`)
    .limit(2000)

  const edges = (relatedEdges ?? []) as GraphEdge[]

  // 1-hop 이웃 노드 ID 수집
  const neighborIds = new Set<string>()
  for (const e of edges) {
    if (!matchedIds.includes(e.source_node_id)) neighborIds.add(e.source_node_id)
    if (!matchedIds.includes(e.target_node_id)) neighborIds.add(e.target_node_id)
  }

  // 이웃 노드 데이터 조회
  let neighborNodes: GraphNode[] = []
  if (neighborIds.size > 0) {
    const neighborIdArr = Array.from(neighborIds).slice(0, 300)
    const { data: nbData } = await supabase
      .from('nh_knowledge_nodes')
      .select('id, title, node_type, department, content, source_drive_id, created_at')
      .in('id', neighborIdArr)
    neighborNodes = (nbData ?? []) as GraphNode[]
  }

  const allNodeIds = new Set([...matchedIds, ...neighborNodes.map(n => n.id)])
  const filteredEdges = edges.filter(
    e => allNodeIds.has(e.source_node_id) && allNodeIds.has(e.target_node_id)
  )

  return {
    nodes: [...(matchedNodes as GraphNode[]), ...neighborNodes],
    edges: filteredEdges,
  }
}

export async function fetchKnowledgeGraphData(limit: number = 200): Promise<GraphData> {
  const { data: sessionData } = await supabase.auth.getSession()
  const uid = sessionData.session?.user?.id
  if (!uid) {
    console.warn('[knowledge-graph] 미인증 세션 — RLS 정책으로 빈 결과가 반환될 수 있습니다.')
  }

  const { data: nodesData, error: nodesError } = await supabase
    .from('nh_knowledge_nodes')
    .select('id, title, node_type, department, content, source_drive_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (nodesError) {
    console.error('[knowledge-graph] 노드 조회 실패:', nodesError)
    throw new Error(`노드 조회 실패: ${nodesError.message}`)
  }

  const nodes = (nodesData ?? []) as GraphNode[]
  if (nodes.length === 0) {
    console.info(`[knowledge-graph] 노드 0건 (uid: ${uid ?? '미인증'})`)
    return EMPTY_GRAPH_DATA
  }

  console.info(`[knowledge-graph] 노드 ${nodes.length}건 로드`)

  const nodeIdSet = new Set(nodes.map((n) => n.id))

  // 노드 수가 많으면 .in() URL이 너무 길어져 Supabase가 차단함
  // → 전체 엣지를 limit 없이 가져온 뒤 클라이언트에서 필터링
  const { data: allEdges, error: edgesError } = await supabase
    .from('nh_knowledge_edges')
    .select('id, source_node_id, target_node_id, edge_type, weight')
    .limit(20000)

  if (edgesError) {
    console.warn('[knowledge-graph] 엣지 조회 실패 — 노드만 렌더링:', edgesError)
    return { nodes, edges: [] }
  }

  // 양쪽 노드가 모두 로드된 엣지만 남김 (중복 없음)
  const edges = (allEdges ?? []).filter(
    e => nodeIdSet.has(e.source_node_id) && nodeIdSet.has(e.target_node_id)
  ) as GraphEdge[]

  console.info(`[knowledge-graph] 엣지 ${edges.length}건 로드`)

  return { nodes, edges }
}
