-- RLS Fix for Knowledge Graph Nodes
-- 기존 정책이 auth.users를 직접 조회하여 권한 에러(permission denied for table users)를 발생시켰습니다.
-- 불필요한 기존 정책을 삭제하고, 안전한 정책으로 교체합니다.

DROP POLICY IF EXISTS nh_nodes_select ON nh_knowledge_nodes;
DROP POLICY IF EXISTS nh_nodes_authenticated_read ON nh_knowledge_nodes;

CREATE POLICY nh_nodes_authenticated_read
  ON nh_knowledge_nodes
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS nh_edges_select ON nh_knowledge_edges;
DROP POLICY IF EXISTS nh_edges_authenticated_read ON nh_knowledge_edges;

CREATE POLICY nh_edges_authenticated_read
  ON nh_knowledge_edges
  FOR SELECT
  TO authenticated
  USING (true);
