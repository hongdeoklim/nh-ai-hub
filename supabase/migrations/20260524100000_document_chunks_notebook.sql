-- -----------------------------------------------------------------------------
-- [26단계] NotebookLM 스타일 RAG — document_chunks + match_document_chunks
-- document_id = knowledge_base.id 또는 user_uploaded_documents.id
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.document_chunks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  source_kind text NOT NULL DEFAULT 'knowledge_base'
    CHECK (source_kind IN ('knowledge_base', 'user_upload')),
  filename text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  page_number integer NULL,
  chunk_index integer NOT NULL DEFAULT 0,
  embedding vector(1536) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT document_chunks_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.document_chunks IS
  '노트북 워크스페이스 RAG 청크. document_id는 knowledge_base 또는 user_uploaded_documents PK.';
COMMENT ON COLUMN public.document_chunks.filename IS '인용 UI용 파일명 (비정규화)';
COMMENT ON COLUMN public.document_chunks.embedding IS 'OpenAI text-embedding-3-small (1536). NULL이면 키워드 검색만.';

CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx
  ON public.document_chunks (document_id);

CREATE INDEX IF NOT EXISTS document_chunks_source_kind_idx
  ON public.document_chunks (source_kind, document_id);

CREATE INDEX IF NOT EXISTS document_chunks_content_gin_idx
  ON public.document_chunks
  USING gin (to_tsvector('simple', coalesce(content, '')));

CREATE UNIQUE INDEX IF NOT EXISTS document_chunks_doc_page_chunk_uidx
  ON public.document_chunks (document_id, page_number, chunk_index);

ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_chunks_select_authenticated ON public.document_chunks;
CREATE POLICY document_chunks_select_authenticated
  ON public.document_chunks
  FOR SELECT
  TO authenticated
  USING (
    (source_kind = 'knowledge_base' AND EXISTS (
      SELECT 1 FROM public.knowledge_base kb WHERE kb.id = document_chunks.document_id
    ))
    OR (source_kind = 'user_upload' AND EXISTS (
      SELECT 1 FROM public.user_uploaded_documents u
      WHERE u.id = document_chunks.document_id AND u.user_id = auth.uid()
    ))
  );

-- -----------------------------------------------------------------------------
-- 키워드 기반 청크 검색 (query_text). embedding 인덱싱 파이프라인 연결 전에도 동작.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_text text,
  document_ids uuid[],
  match_count integer DEFAULT 8,
  similarity_threshold double precision DEFAULT 0.2
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  page_number integer,
  chunk_index integer,
  filename text,
  score double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(match_count, 8), 1), 25);
  v_threshold double precision := GREATEST(COALESCE(similarity_threshold, 0.2), 0.0);
  v_query text := lower(trim(coalesce(query_text, '')));
BEGIN
  IF v_query = '' OR document_ids IS NULL OR array_length(document_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH terms AS (
    SELECT unnest(regexp_split_to_array(v_query, '\s+')) AS term
  ),
  scored AS (
    SELECT
      dc.id,
      dc.document_id,
      dc.content,
      dc.page_number,
      dc.chunk_index,
      dc.filename,
      (
        SELECT count(*)::double precision
        FROM terms t
        WHERE t.term <> ''
          AND lower(dc.content) LIKE '%' || t.term || '%'
      ) / GREATEST((SELECT count(*) FROM terms WHERE term <> ''), 1)::double precision AS term_score
    FROM public.document_chunks dc
    WHERE dc.document_id = ANY (document_ids)
  )
  SELECT
    s.id,
    s.document_id,
    s.content,
    s.page_number,
    s.chunk_index,
    s.filename,
    s.term_score AS score
  FROM scored s
  WHERE s.term_score >= v_threshold
  ORDER BY s.term_score DESC, s.page_number NULLS LAST, s.chunk_index
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.match_document_chunks(text, uuid[], integer, double precision) IS
  '노트북 워크스페이스: 선택 document_ids 내 query_text 키워드 매칭 청크 반환.';

REVOKE ALL ON FUNCTION public.match_document_chunks(text, uuid[], integer, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(text, uuid[], integer, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(text, uuid[], integer, double precision) TO service_role;
