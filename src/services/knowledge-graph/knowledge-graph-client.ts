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

// DB 비었거나 권한 문제 시 레이아웃 깨짐을 예방하기 위해 안전한 빈 객체 선언
const EMPTY_GRAPH_DATA: GraphData = {
  nodes: [],
  edges: []
}

/**
 * 지식 그래프의 노드와 엣지(백링크 관계)를 조회합니다.
 * 최적화를 위해 최근 생성된 노드 위주로 limit 개수만큼만 가져옵니다.
 * 데이터가 없거나 로딩 중 에러가 날 경우 실제 상황을 그대로 반영하여 빈 데이터를 리턴합니다.
 */
export async function fetchKnowledgeGraphData(limit: number = 200): Promise<GraphData> {
  // [진단] 현재 인증 세션 확인.
  // RLS 정책(authenticated)상 로그인 세션이 없으면 Supabase가 "에러 없이" 행을 0건으로
  // 필터링하므로, 콘솔에 에러가 안 잡힌 채 빈 그래프만 보이는 증상의 1순위 원인.
  const { data: sessionData } = await supabase.auth.getSession()
  const uid = sessionData.session?.user?.id
  if (!uid) {
    console.warn(
      '[knowledge-graph] 인증 세션이 없습니다(anon). RLS 정책상 노드가 0건으로 조회될 수 있습니다. 로그인 상태를 확인하세요.',
    )
  }

  const { data: nodesData, error: nodesError } = await supabase
    .from('nh_knowledge_nodes')
    .select('id, title, node_type, department, content, source_drive_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  // [변경] 과거에는 warn 후 빈 배열을 반환해 UI가 "데이터 없음"으로만 보였고 원인을 알 수 없었음.
  // 이제 실제 에러를 콘솔에 남기고 throw 하여, 호출부(KnowledgeGraphPage)의 에러 UI에 원인이 표시되도록 함.
  if (nodesError) {
    console.error('[knowledge-graph] nh_knowledge_nodes 조회 실패:', nodesError)
    throw new Error(
      `지식 그래프 노드 조회 실패: ${nodesError.message} (code: ${nodesError.code ?? 'N/A'}, hint: ${nodesError.hint ?? '없음'})`,
    )
  }

  const nodes = (nodesData || []) as GraphNode[]
  if (nodes.length === 0) {
    // [진단] 에러는 아니지만 행이 0건. "RLS 차단(미인증/가시성)" vs "실제 빈 테이블"을 구분하기 위한 명시적 로그.
    console.info(
      `[knowledge-graph] 노드 0건 조회됨 (uid: ${uid ?? '미인증'}). ` +
        '테이블이 비었거나(아직 적재 안 됨) RLS 정책으로 행이 필터링되었을 수 있습니다.',
    )
    return EMPTY_GRAPH_DATA
  }

  console.info(`[knowledge-graph] 노드 ${nodes.length}건 로드 완료 (uid: ${uid ?? '미인증'}).`)

  const nodeIds = nodes.map((n) => n.id)

  // 추출된 노드들 사이의 엣지들만 가져옴
  const { data: edgesData, error: edgesError } = await supabase
    .from('nh_knowledge_edges')
    .select('id, source_node_id, target_node_id, edge_type')
    .in('source_node_id', nodeIds)

  // 엣지 실패는 치명적이지 않음: 노드만이라도 그리도록 빈 엣지로 진행하되, 콘솔엔 명확히 남김.
  if (edgesError) {
    console.warn('[knowledge-graph] nh_knowledge_edges 조회 실패 — 노드만 렌더링합니다:', edgesError)
    return { nodes, edges: [] }
  }

  // 양방향 렌더링 최적화를 위해 target_node_id 필터링도 추가할 수 있지만,
  // 여기서는 로드된 노드들 간의 관계를 클라이언트에서 한 번 더 필터링.
  const validEdges = (edgesData || []).filter((e) =>
    nodeIds.includes(e.target_node_id)
  )

  console.info(`[knowledge-graph] 엣지 ${validEdges.length}건 로드 완료.`)

  return {
    nodes,
    edges: validEdges as GraphEdge[],
  }
}

