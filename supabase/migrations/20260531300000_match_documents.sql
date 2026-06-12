-- -----------------------------------------------------------------------------
-- 사내 문서 RAG — company_documents 벡터 유사도 검색 RPC
-- rag-ingest / ai-chat: Gemini text-embedding-004 (768차원)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding vector(768),
  match_count integer DEFAULT 5,
  similarity_threshold double precision DEFAULT 0.25
)
RETURNS TABLE (
  id uuid,
  file_name text,
  content text,
  chunk_index integer,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id,
    d.file_name,
    d.content,
    d.chunk_index,
    (1 - (d.embedding <=> query_embedding))::double precision AS similarity
  FROM public.company_documents d
  WHERE d.embedding IS NOT NULL
    AND (1 - (d.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(COALESCE(match_count, 5), 1), 25);
$$;

COMMENT ON FUNCTION public.match_documents(vector, integer, double precision) IS
  '질의 벡터(768)와 코사인 유사도가 threshold 이상인 company_documents 청크 최대 N건';

REVOKE ALL ON FUNCTION public.match_documents(vector, integer, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_documents(vector, integer, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_documents(vector, integer, double precision) TO service_role;
