ALTER TABLE public.company_documents 
ADD COLUMN IF NOT EXISTS expiry_date timestamptz NULL;

COMMENT ON COLUMN public.company_documents.expiry_date IS '지식의 유효기간. 기간이 지나면 RAG 검색에서 제외됨';

-- Update match_documents_hybrid and match_documents to exclude expired documents.
-- First, recreate match_documents_hybrid
CREATE OR REPLACE FUNCTION public.match_documents_hybrid(
    query_embedding vector,
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
    similarity double precision
)
LANGUAGE sql
STABLE
AS $$
WITH semantic_search AS (
    SELECT 
        id, file_name, content, chunk_index,
        1 - (embedding <=> query_embedding) AS similarity
    FROM public.company_documents
    WHERE 
        (expiry_date IS NULL OR expiry_date > now())
        AND 1 - (embedding <=> query_embedding) > similarity_threshold
    ORDER BY embedding <=> query_embedding
    LIMIT match_count * 2
),
keyword_search AS (
    SELECT 
        id, file_name, content, chunk_index,
        ts_rank_cd(to_tsvector('korean', content), websearch_to_tsquery('korean', query_text)) AS rank
    FROM public.company_documents
    WHERE 
        (expiry_date IS NULL OR expiry_date > now())
        AND to_tsvector('korean', content) @@ websearch_to_tsquery('korean', query_text)
    ORDER BY rank DESC
    LIMIT match_count * 2
)
SELECT 
    COALESCE(s.id, k.id) as id,
    COALESCE(s.file_name, k.file_name) as file_name,
    COALESCE(s.content, k.content) as content,
    COALESCE(s.chunk_index, k.chunk_index) as chunk_index,
    COALESCE(s.similarity, 0.0) as similarity
FROM semantic_search s
FULL OUTER JOIN keyword_search k ON s.id = k.id
ORDER BY COALESCE(s.similarity, 0.0) DESC
LIMIT match_count;
$$;
