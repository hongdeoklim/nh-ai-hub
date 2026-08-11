-- =============================================================================
-- Phase 2-2 + 2-3: 한국어 하이브리드 검색 수리 (기획안 docs/reports/system-upgrade-plan-2026-07.md)
--
-- 문제 (D1·D2·D5 + 만료 필터 누락):
--  1. 키워드 arm 이 'simple' FTS 사전 — 공백 토큰화만 하므로 "안전관리를" 이
--     "안전관리" 와 매칭되지 않아 한국어 질의 대부분에서 0건 (하이브리드의 절반 무력)
--  2. 벡터 arm 이 ORDER BY 없는 LIMIT — HNSW 인덱스를 못 타고 임의 행이 잘림
--  3. FTS-only 행의 similarity=0.0 → KG 결과와 병합 정렬 시 항상 탈락
--  4. 하이브리드 RPC 에는 expiry_date 필터가 빠져 만료 문서가 계속 검색됨
--
-- 해결: pg_trgm(트라이그램) word_similarity 로 키워드 arm 교체.
--  한글은 음절 단위 트라이그램이라 조사 변형("안전관리를"↔"안전관리")이 매칭된다.
--  양 arm 모두 ORDER BY … LIMIT 형태로 인덱스를 타게 재작성, RRF 병합은 유지.
--  키워드-only 행의 similarity 는 word_similarity 값(0~1)으로 채워 병합 정렬에서
--  0.0 고정 페널티를 제거한다.
--
-- 주의: pg_trgm 설치 스키마가 환경마다 다를 수 있어(기존 20260605 는 무스키마 설치)
--  세션·함수 search_path 에 public, extensions 를 모두 포함한다.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- pg_trgm 이 public 등 다른 스키마에 이미 설치된 환경도 있으므로
-- 이 마이그레이션 세션에서는 두 스키마 모두에서 opclass/연산자를 해석한다.
SET search_path = public, extensions;

-- 트라이그램 GIN 인덱스 (%> 연산자 인덱스 활용)
CREATE INDEX IF NOT EXISTS company_documents_content_trgm_idx
  ON public.company_documents
  USING gin (content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS work_cases_text_trgm_idx
  ON public.work_cases
  USING gin ((coalesce(title, '') || ' ' || coalesce(content, '')) gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- 사내 문서 하이브리드 (시그니처·반환 컬럼 기존과 동일 — 호출부 무변경)
-- fts_rank 컬럼은 이제 word_similarity(0~1) 값을 담는다.
--
-- DROP 선행: 리포지토리에 5컬럼 반환판(20260611233743)과 7컬럼판(20260612100000)이
-- 공존해, 환경에 따라 5컬럼판이 살아있으면 CREATE OR REPLACE 가 42P13
-- (반환타입 변경 불가)으로 실패한다. 안전하게 DROP 후 재생성한다.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.match_documents_hybrid(vector, text, integer, double precision, integer);

CREATE FUNCTION public.match_documents_hybrid(
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
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
-- 한국어 짧은 질의용 word similarity 하한 (기본 0.6 → 0.30, 함수 종료 시 자동 복원)
SET pg_trgm.word_similarity_threshold = 0.30
AS $$
DECLARE
  n integer := LEAST(GREATEST(COALESCE(match_count, 5), 1), 25);
BEGIN
  -- HNSW 스캔 후보 수가 ef_search(기본 40)에 캡되지 않도록 요청 크기에 맞춰 상향
  PERFORM set_config('hnsw.ef_search', GREATEST(n * 3, 40)::text, true);

  RETURN QUERY
  WITH vector_matches AS (
    SELECT v.id, v.sim,
           row_number() OVER (ORDER BY v.dist) AS rank
    FROM (
      SELECT d.id,
             (1 - (d.embedding <=> query_embedding))::double precision AS sim,
             (d.embedding <=> query_embedding) AS dist
      FROM public.company_documents d
      WHERE d.embedding IS NOT NULL
        AND (d.expiry_date IS NULL OR d.expiry_date > now())
      ORDER BY d.embedding <=> query_embedding
      LIMIT n * 3
    ) v
    WHERE v.sim >= similarity_threshold
  ),
  kw_matches AS (
    SELECT k.id, k.wsim,
           row_number() OVER (ORDER BY k.wsim DESC) AS rank
    FROM (
      SELECT d.id,
             word_similarity(query_text, d.content)::double precision AS wsim
      FROM public.company_documents d
      WHERE d.content %> query_text  -- 인덱스 컬럼 좌변 형태 (GIN word-similarity)
        AND (d.expiry_date IS NULL OR d.expiry_date > now())
      ORDER BY word_similarity(query_text, d.content) DESC
      LIMIT n * 3
    ) k
  ),
  fused AS (
    SELECT
      COALESCE(v.id, k.id) AS doc_id,
      -- 키워드-only 행도 word_similarity 로 병합 정렬 경쟁력을 갖게 한다 (D5)
      COALESCE(v.sim, k.wsim, 0.0)::double precision AS similarity,
      COALESCE(k.wsim, 0.0)::double precision AS fts_rank,
      (
        COALESCE(1.0 / (rrf_k + v.rank), 0.0) +
        COALESCE(1.0 / (rrf_k + k.rank), 0.0)
      )::double precision AS rrf_score
    FROM vector_matches v
    FULL OUTER JOIN kw_matches k ON v.id = k.id
  )
  SELECT d.id, d.file_name, d.content, d.chunk_index,
         f.similarity, f.fts_rank, f.rrf_score
  FROM fused f
  JOIN public.company_documents d ON d.id = f.doc_id
  ORDER BY f.rrf_score DESC
  LIMIT n;
END;
$$;

COMMENT ON FUNCTION public.match_documents_hybrid(vector, text, integer, double precision, integer) IS
  '벡터 유사도 + pg_trgm word_similarity 키워드 검색 RRF 병합 (한국어 조사 변형 대응, HNSW 인덱스 활용)';

REVOKE ALL ON FUNCTION public.match_documents_hybrid(vector, text, integer, double precision, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_documents_hybrid(vector, text, integer, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_documents_hybrid(vector, text, integer, double precision, integer) TO service_role;

-- -----------------------------------------------------------------------------
-- 업무 사례 하이브리드 (시그니처·반환 컬럼 기존과 동일)
-- -----------------------------------------------------------------------------
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
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
SET pg_trgm.word_similarity_threshold = 0.30
AS $$
DECLARE
  n integer := LEAST(GREATEST(COALESCE(match_count, 10), 1), 50);
BEGIN
  PERFORM set_config('hnsw.ef_search', GREATEST(n * 3, 40)::text, true);

  RETURN QUERY
  WITH vector_search AS (
    SELECT v.id, v.sim,
           row_number() OVER (ORDER BY v.dist) AS rank
    FROM (
      SELECT w.id,
             (1 - (w.embedding <=> query_embedding))::double precision AS sim,
             (w.embedding <=> query_embedding) AS dist
      FROM public.work_cases w
      WHERE w.embedding IS NOT NULL
      ORDER BY w.embedding <=> query_embedding
      LIMIT n * 3
    ) v
    WHERE v.sim >= similarity_threshold
  ),
  kw_search AS (
    SELECT k.id, k.wsim,
           row_number() OVER (ORDER BY k.wsim DESC) AS rank
    FROM (
      SELECT w.id,
             word_similarity(query_text, coalesce(w.title, '') || ' ' || coalesce(w.content, ''))::double precision AS wsim
      FROM public.work_cases w
      WHERE (coalesce(w.title, '') || ' ' || coalesce(w.content, '')) %> query_text
      ORDER BY word_similarity(query_text, coalesce(w.title, '') || ' ' || coalesce(w.content, '')) DESC
      LIMIT n * 3
    ) k
  ),
  fused AS (
    SELECT
      COALESCE(v.id, k.id) AS case_id,
      COALESCE(v.sim, k.wsim, 0.0)::double precision AS similarity,
      COALESCE(k.wsim, 0.0)::real AS fts_rank,
      (
        COALESCE(1.0 / (60.0 + v.rank), 0.0) * vector_weight +
        COALESCE(1.0 / (60.0 + k.rank), 0.0) * fts_weight
      )::double precision AS combined_score
    FROM vector_search v
    FULL OUTER JOIN kw_search k ON v.id = k.id
  )
  SELECT w.id, w.title, w.content,
         f.similarity, f.fts_rank, f.combined_score
  FROM fused f
  JOIN public.work_cases w ON w.id = f.case_id
  ORDER BY f.combined_score DESC
  LIMIT n;
END;
$$;

REVOKE ALL ON FUNCTION public.match_work_cases_hybrid(vector(1536), text, integer, double precision, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_work_cases_hybrid(vector(1536), text, integer, double precision, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_work_cases_hybrid(vector(1536), text, integer, double precision, double precision, double precision) TO service_role;
