CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. 매일 새벽 3시에 90일 지난 로그 데이터 자동 삭제
SELECT cron.schedule(
    'truncate-old-logs',
    '0 3 * * *', 
    $$
    DELETE FROM public.activity_logs WHERE created_at < now() - interval '90 days';
    DELETE FROM public.token_logs WHERE created_at < now() - interval '90 days';
    $$
);

-- 2. 매일 새벽 4시에 6개월 지난 채팅 세션 소프트 삭제 (Archiving)
SELECT cron.schedule(
    'archive-old-chat-sessions',
    '0 4 * * *',
    $$
    UPDATE public.chat_sessions 
    SET deleted_at = now() 
    WHERE created_at < now() - interval '6 months' 
      AND deleted_at IS NULL;
    $$
);

-- 3. 유효기간(expiry_date)이 지난 문서의 청크(document_chunks) 하드 삭제
-- (company_documents 자체는 이력 관리를 위해 남겨두되 벡터 용량만 해제)
SELECT cron.schedule(
    'delete-expired-document-chunks',
    '30 4 * * *',
    $$
    DELETE FROM public.document_chunks 
    WHERE document_id IN (
        SELECT id FROM public.company_documents 
        WHERE expiry_date IS NOT NULL AND expiry_date < now()
    );
    $$
);
