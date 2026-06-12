-- -----------------------------------------------------------------------------
-- pgvector + 업무 사례(RAG) 저장소 + 유사도 검색 RPC
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.work_cases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT work_cases_pkey PRIMARY KEY (id),
  CONSTRAINT work_cases_title_nonempty CHECK (char_length(trim(title)) > 0),
  CONSTRAINT work_cases_content_nonempty CHECK (char_length(trim(content)) > 0)
);

COMMENT ON TABLE public.work_cases IS '업무 사례 지식 베이스. 임베딩은 Edge(ai-chat) 도구에서만 기록.';
COMMENT ON COLUMN public.work_cases.embedding IS 'OpenAI text-embedding-3-small 등 1536 차원';

CREATE INDEX work_cases_embedding_hnsw_idx
  ON public.work_cases
  USING hnsw (embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION public.touch_work_cases_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_cases_set_updated_at ON public.work_cases;
CREATE TRIGGER work_cases_set_updated_at
  BEFORE UPDATE ON public.work_cases
  FOR EACH ROW
  EXECUTE PROCEDURE public.touch_work_cases_updated_at();

ALTER TABLE public.work_cases ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 유사 사례 검색 (코사인 거리; similarity = 1 - distance)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_work_cases(
  query_embedding vector(1536),
  match_count integer DEFAULT 5,
  similarity_threshold double precision DEFAULT 0.25
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    w.id,
    w.title,
    w.content,
    (1 - (w.embedding <=> query_embedding))::double precision AS similarity
  FROM public.work_cases w
  WHERE w.embedding IS NOT NULL
    AND (1 - (w.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY w.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(COALESCE(match_count, 5), 1), 25);
$$;

COMMENT ON FUNCTION public.match_work_cases IS '질의 벡터와 코사인 유사도가 threshold 이상인 사례 최대 N건';

REVOKE ALL ON FUNCTION public.match_work_cases(vector, integer, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_work_cases(vector, integer, double precision) TO service_role;
