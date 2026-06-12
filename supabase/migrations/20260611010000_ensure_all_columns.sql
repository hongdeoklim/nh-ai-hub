DO $$ 
BEGIN 
  -- chunk_index
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='company_documents' AND column_name='chunk_index'
  ) THEN 
    ALTER TABLE public.company_documents ADD COLUMN chunk_index integer NOT NULL DEFAULT 0;
  END IF; 

  -- uploaded_by
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='company_documents' AND column_name='uploaded_by'
  ) THEN 
    ALTER TABLE public.company_documents ADD COLUMN uploaded_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL;
  END IF; 

  -- embedding
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='company_documents' AND column_name='embedding'
  ) THEN 
    ALTER TABLE public.company_documents ADD COLUMN embedding vector(768) NULL;
  END IF; 

  -- created_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='company_documents' AND column_name='created_at'
  ) THEN 
    ALTER TABLE public.company_documents ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF; 
END $$;

NOTIFY pgrst, 'reload schema';
