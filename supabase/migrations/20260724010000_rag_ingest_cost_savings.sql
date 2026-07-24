-- =============================================================================
-- AI 사용료 절감: 변경 없는 문서의 재임베딩 방지 + 웹훅 트리거 호출 최소화
--
-- 1) company_documents.content_hash — rag-ingest 가 문서 원문 SHA-256 을 저장해두고,
--    다음 동기화에서 해시가 같으면 Gemini 임베딩 호출을 통째로 건너뛴다.
--    (드라이브 야간 동기화가 매일 전 문서를 재임베딩하던 과금 누수 차단)
-- 2) company_documents_dify_sync 트리거를 행 단위 → 문(statement) 단위로 변경.
--    청크 1건당 1회(문서당 수백 회) 웹훅을 쏘던 것을 INSERT 문당 1회로 줄인다.
--    웹훅(dify-sync-webhook)은 요청 본문을 쓰지 않고 큐만 드레인하므로 동작 동일.
-- =============================================================================

ALTER TABLE public.company_documents
  ADD COLUMN IF NOT EXISTS content_hash text;

CREATE INDEX IF NOT EXISTS company_documents_file_name_idx
  ON public.company_documents(file_name);

-- 문 단위 트리거는 NEW 행을 참조할 수 없으므로 본문을 고정 JSON 으로 보낸다.
CREATE OR REPLACE FUNCTION public.company_documents_dify_sync_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  webhook_secret text := current_setting('app.settings.dify_sync_webhook_secret', true);
  webhook_url    text := 'https://wndnjrcljdvbnezfpisb.supabase.co/functions/v1/dify-sync-webhook';
BEGIN
  IF webhook_secret IS NULL OR webhook_secret = '' THEN
    RAISE WARNING '[dify-sync] app.settings.dify_sync_webhook_secret 가 설정되지 않아 webhook 호출을 건너뜁니다.';
    RETURN NULL;
  END IF;

  PERFORM extensions.http_post(
    url      := webhook_url,
    body     := '{"limit":20}',
    headers  := ARRAY[
      extensions.http_header('Content-Type', 'application/json'),
      extensions.http_header('Authorization', 'Bearer ' || webhook_secret)
    ]
  );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS company_documents_dify_sync ON public.company_documents;

CREATE TRIGGER company_documents_dify_sync
  AFTER INSERT
  ON public.company_documents
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.company_documents_dify_sync_fn();
