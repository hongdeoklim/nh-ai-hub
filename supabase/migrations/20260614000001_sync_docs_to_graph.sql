-- Dify/헤르메스 사내 문서(company_documents) ↔ 지식 그래프(nh_knowledge_nodes) 동기화 트리거

-- 1. 동기화 함수 생성
CREATE OR REPLACE FUNCTION public.sync_doc_to_knowledge_node()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_node_type public.nh_node_type;
    v_slug TEXT;
BEGIN
    -- chunk_index가 0이거나 파일의 첫 번째 조각인 경우 메인 'document' 허브로 지정
    -- 그 외는 'raw_chunk'로 지정하여 작은 점으로 연결
    IF NEW.chunk_index = 0 THEN
        v_node_type := 'document'::public.nh_node_type;
    ELSE
        v_node_type := 'raw_chunk'::public.nh_node_type;
    END IF;

    -- URL 친화적인 slug 자동 생성 (간단한 해시나 랜덤 문자열 활용)
    v_slug := 'doc-' || substr(NEW.id::text, 1, 8) || '-' || NEW.chunk_index::text;

    -- [추가] 외래키(Foreign Key) 제약조건 해결: 부모 테이블에 문서 레코드 선제 생성 (Upsert)
    INSERT INTO public.nh_knowledge_documents (id, title, raw_content)
    VALUES (NEW.id, NEW.file_name, NEW.content)
    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;

    -- 이미 노드가 존재하는 경우 UPDATE, 없으면 INSERT (UPSERT 패턴)
    INSERT INTO public.nh_knowledge_nodes (
        id, 
        doc_id,
        slug, 
        title, 
        node_type, 
        chunk_index,
        content, 
        embedding, 
        owner_id, 
        visibility
    )
    VALUES (
        NEW.id,
        NEW.id, -- doc_id 매핑 추가
        v_slug,
        NEW.file_name,
        v_node_type,
        NEW.chunk_index,
        NEW.content,
        array_fill(0, ARRAY[1536])::vector, -- embedding: NOT NULL 제약조건 우회 (768 vs 1536)
        NEW.uploaded_by,
        'public' -- 전사적 지식이므로 기본 public 설정
    )
    ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        node_type = EXCLUDED.node_type,
        updated_at = now();

    RETURN NEW;
END;
$$;

-- 2. 기존 트리거 덮어쓰기 및 재생성
DROP TRIGGER IF EXISTS trg_sync_company_doc_to_node ON public.company_documents;

CREATE TRIGGER trg_sync_company_doc_to_node
AFTER INSERT OR UPDATE ON public.company_documents
FOR EACH ROW
EXECUTE FUNCTION public.sync_doc_to_knowledge_node();

-- 3. (옵션) 과거에 이미 들어가 있던 company_documents 소급 적용 동기화 (초기 1회 붓기)
-- 3-1. 부모 문서 테이블(nh_knowledge_documents) 먼저 채우기 (FK 제약조건 회피)
INSERT INTO public.nh_knowledge_documents (id, title, raw_content)
SELECT DISTINCT ON (id) id, file_name, content
FROM public.company_documents
ORDER BY id, chunk_index ASC
ON CONFLICT (id) DO NOTHING;

-- 3-2. 노드 테이블(nh_knowledge_nodes) 채우기
INSERT INTO public.nh_knowledge_nodes (
    id, doc_id, slug, title, node_type, chunk_index, content, embedding, owner_id, visibility
)
SELECT 
    id, 
    id, -- doc_id 매핑 추가
    'doc-' || substr(id::text, 1, 8) || '-' || chunk_index::text,
    file_name,
    CASE WHEN chunk_index = 0 THEN 'document'::public.nh_node_type ELSE 'raw_chunk'::public.nh_node_type END,
    chunk_index,
    content,
    array_fill(0, ARRAY[1536])::vector, -- embedding: NOT NULL 우회
    uploaded_by,
    'public'
FROM public.company_documents
ON CONFLICT (id) DO NOTHING;
