-- -----------------------------------------------------------------------------
-- [2단계] Notebook HNSW Index
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw_idx
  ON public.document_chunks
  USING hnsw (embedding vector_cosine_ops);

-- -----------------------------------------------------------------------------
-- [4단계] AI Generated Assets Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_generated_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('image', 'sheet', 'slide')),
  gcs_url text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT ai_generated_assets_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ai_generated_assets_user_idx 
  ON public.ai_generated_assets (user_id);

CREATE INDEX IF NOT EXISTS ai_generated_assets_type_idx 
  ON public.ai_generated_assets (asset_type);

ALTER TABLE public.ai_generated_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_generated_assets_select_own 
  ON public.ai_generated_assets
  FOR SELECT 
  TO authenticated 
  USING (auth.uid() = user_id);

CREATE POLICY ai_generated_assets_insert_own 
  ON public.ai_generated_assets
  FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY ai_generated_assets_delete_own 
  ON public.ai_generated_assets
  FOR DELETE 
  TO authenticated 
  USING (auth.uid() = user_id);
