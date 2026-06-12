-- -----------------------------------------------------------------------------
-- 사내 문서 RAG — 하이브리드 검색 RPC (벡터 코사인 유사도 + Full-Text Search RRF 병합)
-- Gemini text-embedding-004 (768차원) 및 simple 딕셔너리 기준 키워드 FTS 결합
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.match_documents_hybrid(
  query_embedding vector(768),
  query_text text,
  match_count integer DEFAULT 5,
  similarity_threshold double precision DEFAULT 0.25,
  rrf_k integer DEFAULT 60
)
RETURNS TABLE (
  id uuid,
  file_name text,
  content text,
  chunk_index integer,
  similarity double precision,
  fts_rank double precision,
  rrf_score double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH vector_matches AS (
    SELECT
      d.id,
      (1 - (d.embedding <=> query_embedding))::double precision AS similarity,
      row_number() OVER (ORDER BY d.embedding <=> query_embedding) as rank
    FROM public.company_documents d
    WHERE d.embedding IS NOT NULL
      AND (1 - (d.embedding <=> query_embedding)) >= similarity_threshold
    LIMIT COALESCE(match_count, 5) * 2
  ),
  fts_matches AS (
    SELECT
      d.id,
      ts_rank_cd(to_tsvector('simple', d.content), plainto_tsquery('simple', query_text))::double precision AS fts_rank,
      row_number() OVER (ORDER BY ts_rank_cd(to_tsvector('simple', d.content), plainto_tsquery('simple', query_text)) DESC) as rank
    FROM public.company_documents d
    WHERE to_tsvector('simple', d.content) @@ plainto_tsquery('simple', query_text)
    LIMIT COALESCE(match_count, 5) * 2
  )
  SELECT
    d.id,
    d.file_name,
    d.content,
    d.chunk_index,
    COALESCE(v.similarity, 0.0)::double precision AS similarity,
    COALESCE(f.fts_rank, 0.0)::double precision AS fts_rank,
    (
      COALESCE(1.0 / (rrf_k + v.rank), 0.0) +
      COALESCE(1.0 / (rrf_k + f.rank), 0.0)
    )::double precision AS rrf_score
  FROM public.company_documents d
  LEFT JOIN vector_matches v ON d.id = v.id
  LEFT JOIN fts_matches f ON d.id = f.id
  WHERE v.id IS NOT NULL OR f.id IS NOT NULL
  ORDER BY rrf_score DESC
  LIMIT LEAST(GREATEST(COALESCE(match_count, 5), 1), 25);
$$;

COMMENT ON FUNCTION public.match_documents_hybrid(vector, text, integer, double precision, integer) IS
  '벡터 유사도 검색 결과와 단순 텍스트 키워드 FTS 검색 결과를 RRF(Reciprocal Rank Fusion) 알고리즘으로 병합하여 반환';

GRANT EXECUTE ON FUNCTION public.match_documents_hybrid(vector, text, integer, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_documents_hybrid(vector, text, integer, double precision, integer) TO service_role;
