-- =============================================================================
-- Phase 0 데이터 핫픽스 (2026-07 시스템 고도화 기획안 docs/reports/system-upgrade-plan-2026-07.md)
--
-- 1) 만료 문서 GC 크론 교정 — 기존 크론이 무관한 테이블(document_chunks: 노트북용,
--    document_id 가 knowledge_base/user_uploaded_documents PK)을 조인해 no-op 이었음.
--    만료 문서는 match RPC 가 이미 검색에서 제외하므로(20260611233743), GC 는
--    원래 의도("이력은 남기고 벡터 용량만 해제")대로 embedding 을 NULL 처리한다.
-- 2) 좋아요→지식화 크론 제거 — 임베딩 없는 행을 타임스탬프 파일명으로 매일 신규
--    생성해 검색 불가 + 무한 증식. 지식화는 관리자 승인 경로(ChatAudit→work_cases)로
--    일원화하고, is_extracted 플래그를 리셋해 향후 파이프라인이 재처리할 수 있게 한다.
-- 3) 영벡터 KG 복제 트리거 제거 — company_documents 전 청크를 nh_knowledge_nodes 에
--    영벡터(코사인 NaN, 영구 검색 불가)로 복제하며 visibility='public' 강제.
--    오염 노드는 삭제(엣지는 FK ON DELETE CASCADE 로 자동 정리).
-- =============================================================================

-- 1) + 2) pg_cron 잡 교정
DO $do$
DECLARE
  jid bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron 미설치 — 크론 교정을 건너뜁니다.';
    RETURN;
  END IF;

  -- 잘못된 GC 크론 제거 후 교정판 등록
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname IN ('delete-expired-document-chunks', 'expire-company-documents') LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
  PERFORM cron.schedule(
    'expire-company-documents',
    '30 4 * * *',
    $job$UPDATE public.company_documents SET embedding = NULL WHERE expiry_date IS NOT NULL AND expiry_date < now() AND embedding IS NOT NULL;$job$
  );

  -- 좋아요 추출 크론 제거 (cleanup-chat-messages 는 정상이므로 유지)
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'extract-liked-messages' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;

  RAISE NOTICE 'Phase0: GC 크론 교정 및 extract-liked-messages 제거 완료';
END $do$;

DROP FUNCTION IF EXISTS public.cron_extract_liked_messages();

-- 2) 오염 데이터 정리: 크론이 만든 임베딩 없는 지식_추출 행 제거 + 재처리 가능하게 플래그 리셋
DELETE FROM public.company_documents
WHERE file_name LIKE '지식_추출_%' AND embedding IS NULL;

UPDATE public.chat_messages
SET is_extracted = false
WHERE is_liked = true AND is_extracted = true;

-- 3) 영벡터 KG 복제 트리거 제거
DROP TRIGGER IF EXISTS trg_sync_company_doc_to_node ON public.company_documents;
DROP FUNCTION IF EXISTS public.sync_doc_to_knowledge_node();

-- 트리거가 만든 영벡터 노드 삭제 (nh_knowledge_edges 는 ON DELETE CASCADE)
DELETE FROM public.nh_knowledge_nodes n
USING public.company_documents c
WHERE n.id = c.id
  AND n.embedding = array_fill(0, ARRAY[1536])::vector;

-- 트리거가 만든 중복 문서 원본 제거 (다른 노드가 참조하지 않는 경우만)
DELETE FROM public.nh_knowledge_documents d
USING public.company_documents c
WHERE d.id = c.id
  AND NOT EXISTS (SELECT 1 FROM public.nh_knowledge_nodes n WHERE n.doc_id = d.id);
