-- ==============================================================================
-- 0. 누락된 컬럼(weight) 추가 (멱등성 보장)
-- ==============================================================================
ALTER TABLE public.nh_knowledge_edges ADD COLUMN IF NOT EXISTS weight REAL NOT NULL DEFAULT 1.0;

-- ==============================================================================
-- 1. 기존 노드들 간의 엣지(Edge) 생성 (소급 적용)
-- ==============================================================================

-- 1-1. 허브 문서(document)와 그에 속한 조각(raw_chunk)들을 연결 ('contains')
INSERT INTO public.nh_knowledge_edges (source_node_id, target_node_id, edge_type, weight, is_auto)
SELECT 
    d.id AS source_node_id, 
    c.id AS target_node_id, 
    'contains' AS edge_type, 
    1.0 AS weight, 
    TRUE AS is_auto
FROM public.nh_knowledge_nodes d
JOIN public.nh_knowledge_nodes c ON d.title = c.title
WHERE d.node_type = 'document' AND c.node_type = 'raw_chunk'
ON CONFLICT DO NOTHING;

-- 1-2. 조각들 간의 순차적 흐름 연결 ('next')
INSERT INTO public.nh_knowledge_edges (source_node_id, target_node_id, edge_type, weight, is_auto)
SELECT 
    c1.id AS source_node_id, 
    c2.id AS target_node_id, 
    'next' AS edge_type, 
    0.5 AS weight, 
    TRUE AS is_auto
FROM public.nh_knowledge_nodes c1
JOIN public.nh_knowledge_nodes c2 ON c1.title = c2.title AND c1.chunk_index + 1 = c2.chunk_index
WHERE c1.node_type = 'raw_chunk' AND c2.node_type = 'raw_chunk'
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 2. 신규 동기화 시 엣지도 함께 자동 생성되도록 트리거 함수 보강
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.sync_doc_to_knowledge_node()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_node_type public.nh_node_type;
    v_slug TEXT;
    v_parent_id UUID;
    v_prev_id UUID;
BEGIN
    -- 청크 인덱스에 따라 노드 타입 결정
    IF NEW.chunk_index = 0 THEN
        v_node_type := 'document'::public.nh_node_type;
    ELSE
        v_node_type := 'raw_chunk'::public.nh_node_type;
    END IF;

    v_slug := 'doc-' || substr(NEW.id::text, 1, 8) || '-' || NEW.chunk_index::text;

    -- 부모 테이블(nh_knowledge_documents) Upsert
    INSERT INTO public.nh_knowledge_documents (id, title, raw_content)
    VALUES (NEW.id, NEW.file_name, NEW.content)
    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;

    -- 노드 테이블(nh_knowledge_nodes) 삽입
    INSERT INTO public.nh_knowledge_nodes (
        id, doc_id, slug, title, node_type, chunk_index, content, embedding, owner_id, visibility
    )
    VALUES (
        NEW.id, NEW.id, v_slug, NEW.file_name, v_node_type, NEW.chunk_index, NEW.content,
        array_fill(0, ARRAY[1536])::vector, NEW.uploaded_by, 'public'
    )
    ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        node_type = EXCLUDED.node_type,
        updated_at = now();

    -- [신규] 엣지 자동 생성 로직
    IF v_node_type = 'raw_chunk' THEN
        -- 1. 부모 document와의 연결 ('contains')
        SELECT id INTO v_parent_id
        FROM public.nh_knowledge_nodes
        WHERE title = NEW.file_name AND node_type = 'document'
        LIMIT 1;

        IF v_parent_id IS NOT NULL THEN
            INSERT INTO public.nh_knowledge_edges (source_node_id, target_node_id, edge_type, weight, is_auto)
            VALUES (v_parent_id, NEW.id, 'contains', 1.0, TRUE)
            ON CONFLICT DO NOTHING;
        END IF;
        
        -- 2. 직전 조각과의 연결 ('next')
        SELECT id INTO v_prev_id
        FROM public.nh_knowledge_nodes
        WHERE title = NEW.file_name AND node_type = 'raw_chunk' AND chunk_index = NEW.chunk_index - 1
        LIMIT 1;

        IF v_prev_id IS NOT NULL THEN
            INSERT INTO public.nh_knowledge_edges (source_node_id, target_node_id, edge_type, weight, is_auto)
            VALUES (v_prev_id, NEW.id, 'next', 0.5, TRUE)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
