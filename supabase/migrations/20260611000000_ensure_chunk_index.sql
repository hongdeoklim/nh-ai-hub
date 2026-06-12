DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name='company_documents' AND column_name='chunk_index'
  ) THEN 
    ALTER TABLE public.company_documents ADD COLUMN chunk_index integer NOT NULL DEFAULT 0;
  END IF; 
END $$;

NOTIFY pgrst, 'reload schema';
