-- RLS Fix for Knowledge Graph
-- 사내망 환경이므로 모든 인증된 사용자(authenticated)가 지식 그래프 노드와 엣지를 조회할 수 있도록 권한을 완화합니다.

ALTER TABLE nh_knowledge_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE nh_knowledge_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nh_nodes_authenticated_read ON nh_knowledge_nodes;
CREATE POLICY nh_nodes_authenticated_read
  ON nh_knowledge_nodes
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS nh_edges_authenticated_read ON nh_knowledge_edges;
CREATE POLICY nh_edges_authenticated_read
  ON nh_knowledge_edges
  FOR SELECT
  TO authenticated
  USING (true);
