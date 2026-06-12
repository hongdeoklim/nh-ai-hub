-- -----------------------------------------------------------------------------
-- 사내 문서 RAG — company_documents (Gemini text-embedding-004, 768차원)
-- Edge Function rag-ingest 가 청크·임베딩을 적재합니다.
-- -----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.company_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  file_name text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  chunk_index integer NOT NULL DEFAULT 0,
  embedding vector(768) NULL,
  uploaded_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT company_documents_pkey PRIMARY KEY (id),
  CONSTRAINT company_documents_file_name_check CHECK (char_length(trim(file_name)) > 0),
  CONSTRAINT company_documents_content_check CHECK (char_length(trim(content)) > 0)
);

COMMENT ON TABLE public.company_documents IS
  '사내 문서 RAG 청크. rag-ingest Edge Function이 Gemini text-embedding-004(768)로 적재.';
COMMENT ON COLUMN public.company_documents.embedding IS
  'Google Gemini text-embedding-004 (768차원).';

CREATE INDEX IF NOT EXISTS company_documents_file_name_idx
  ON public.company_documents (file_name);

CREATE INDEX IF NOT EXISTS company_documents_uploaded_by_idx
  ON public.company_documents (uploaded_by);

CREATE INDEX IF NOT EXISTS company_documents_embedding_hnsw_idx
  ON public.company_documents
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_documents_select_authenticated ON public.company_documents;
CREATE POLICY company_documents_select_authenticated
  ON public.company_documents
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS company_documents_delete_own ON public.company_documents;
CREATE POLICY company_documents_delete_own
  ON public.company_documents
  FOR DELETE
  TO authenticated
  USING (auth.uid() = uploaded_by);
