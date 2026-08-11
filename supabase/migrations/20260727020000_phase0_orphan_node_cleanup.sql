-- Phase 0 후속: 20260727000000 의 삭제 순서 결함 보완 (PR #4 리뷰 지적 #2)
--
-- 앞선 마이그레이션이 company_documents 의 '지식_추출_%' 행을 먼저 지운 뒤
-- company_documents 와의 조인으로 영벡터 노드를 정리했기 때문에, 이미 원본이
-- 사라진 지식_추출 행들의 영벡터 노드·문서가 고아로 잔존한다.
--
-- 영벡터(embedding = 0-vector)와 slug 'doc-…' 형식은 제거된 트리거
-- (sync_doc_to_knowledge_node)만 만들었으므로 조인 없이 안전하게 지울 수 있다.
-- (정상 미임베딩 노드는 embedding IS NULL 로 저장되며 slug 형식도 다름)

DELETE FROM public.nh_knowledge_nodes
WHERE embedding = array_fill(0, ARRAY[1536])::vector
  AND slug LIKE 'doc-%';

-- 트리거가 만든 지식_추출 문서 원본 중 더 이상 노드가 참조하지 않는 것 제거
DELETE FROM public.nh_knowledge_documents d
WHERE d.title LIKE '지식_추출_%'
  AND NOT EXISTS (SELECT 1 FROM public.nh_knowledge_nodes n WHERE n.doc_id = d.id);
