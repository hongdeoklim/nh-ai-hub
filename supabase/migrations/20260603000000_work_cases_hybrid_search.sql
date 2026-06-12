-- -----------------------------------------------------------------------------
-- [3단계 고도화] RAG 하이브리드 검색 (FTS + Vector + RRF) 구축
-- -----------------------------------------------------------------------------

-- 1) FTS 성능 최적화를 위한 GIN 인덱스 생성
CREATE INDEX IF NOT EXISTS work_cases_fts_simple_idx
  ON public.work_cases
  USING gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, '')));

-- 2) RRF 기반 하이브리드 검색 RPC 함수 정의
CREATE OR REPLACE FUNCTION public.match_work_cases_hybrid(
  query_embedding vector(1536),
  query_text text,
  match_count integer DEFAULT 10,
  similarity_threshold double precision DEFAULT 0.25,
  fts_weight double precision DEFAULT 0.5,
  vector_weight double precision DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  similarity double precision,
  fts_rank real,
  combined_score double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH vector_search AS (
    -- 1. 벡터 유사도 검색 및 랭킹 산정
    SELECT
      w.id,
      w.title,
      w.content,
      (1 - (w.embedding <=> query_embedding))::double precision AS similarity,
      ROW_NUMBER() OVER (ORDER BY (w.embedding <=> query_embedding) ASC) AS rank
    FROM public.work_cases w
    WHERE w.embedding IS NOT NULL
      AND (1 - (w.embedding <=> query_embedding)) >= similarity_threshold
  ),
  fts_search AS (
    -- 2. PostgreSQL Full-text Search 키워드 검색 및 랭킹 산정
    SELECT
      w.id,
      w.title,
      w.content,
      ts_rank_cd(
        to_tsvector('simple', coalesce(w.title, '') || ' ' || coalesce(w.content, '')),
        plainto_tsquery('simple', query_text)
      ) AS fts_rank,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(
          to_tsvector('simple', coalesce(w.title, '') || ' ' || coalesce(w.content, '')),
          plainto_tsquery('simple', query_text)
        ) DESC
      ) AS rank
    FROM public.work_cases w
    WHERE to_tsvector('simple', coalesce(w.title, '') || ' ' || coalesce(w.content, '')) 
          @@ plainto_tsquery('simple', query_text)
  ),
  rrf_combined AS (
    -- 3. Reciprocal Rank Fusion (RRF) 기법으로 두 순위 가중 연동 결합
    SELECT
      coalesce(v.id, f.id) AS id,
      coalesce(v.title, f.title) AS title,
      coalesce(v.content, f.content) AS content,
      coalesce(v.similarity, 0.0) AS similarity,
      coalesce(f.fts_rank, 0.0::real) AS fts_rank,
      (
        coalesce(1.0 / (60.0 + v.rank), 0.0) * vector_weight +
        coalesce(1.0 / (60.0 + f.rank), 0.0) * fts_weight
      ) AS combined_score
    FROM vector_search v
    FULL OUTER JOIN fts_search f ON v.id = f.id
  )
  SELECT
    r.id,
    r.title,
    r.content,
    r.similarity,
    r.fts_rank,
    r.combined_score
  FROM rrf_combined r
  ORDER BY r.combined_score DESC
  LIMIT match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.match_work_cases_hybrid(vector(1536), text, integer, double precision, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_work_cases_hybrid(vector(1536), text, integer, double precision, double precision, double precision) TO authenticated;
