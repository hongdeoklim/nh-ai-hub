-- -----------------------------------------------------------------------------
-- [32단계] nh_search_similar_nodes 보안 설정 변경 (SECURITY DEFINER -> SECURITY INVOKER)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.nh_search_similar_nodes(
  query_embedding  VECTOR(1536),
  match_threshold  REAL    DEFAULT 0.7,
  match_count      INTEGER DEFAULT 10,
  filter_node_type public.nh_node_type DEFAULT NULL,
  filter_dept      TEXT    DEFAULT NULL
)
RETURNS TABLE (
  id              UUID,
  title           TEXT,
  slug            TEXT,
  node_type       public.nh_node_type,
  visibility      public.nh_visibility,
  content         TEXT,
  source_url      TEXT,
  source_drive_id TEXT,
  department      TEXT,
  metadata        JSONB,
  similarity      REAL
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.title,
    n.slug,
    n.node_type,
    n.visibility,
    n.content,
    n.source_url,
    n.source_drive_id,
    n.department,
    n.metadata,
    (1 - (n.embedding <=> query_embedding))::REAL AS similarity
  FROM public.nh_knowledge_nodes n
  WHERE
    n.embedding IS NOT NULL
    AND (1 - (n.embedding <=> query_embedding)) >= match_threshold
    AND (filter_node_type IS NULL OR n.node_type = filter_node_type)
    AND (filter_dept IS NULL OR n.department = filter_dept)
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION public.nh_search_similar_nodes IS
  '쿼리 임베딩 벡터와 코사인 유사도를 기준으로 유사한 노드를 검색하는 RPC 함수 (SECURITY INVOKER로 RLS 가시성 적용)';

-- 기존에 service_role 및 authenticated 에 부여된 EXECUTE 권한 재확인
GRANT EXECUTE ON FUNCTION public.nh_search_similar_nodes TO service_role;
GRANT EXECUTE ON FUNCTION public.nh_search_similar_nodes TO authenticated;
GRANT EXECUTE ON FUNCTION public.nh_search_similar_nodes TO anon;
