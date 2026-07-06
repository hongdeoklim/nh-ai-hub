-- Fix: company_documents INSERT 시 dify-sync-webhook 호출에 Authorization 헤더 추가
-- pg_net 트리거는 헤더를 리터럴 문자열로만 받으므로, SECURITY DEFINER 래퍼 함수를 사용합니다.
-- 배포 전 DB에 시크릿을 등록하세요:
--   ALTER DATABASE postgres SET "app.settings.dify_sync_webhook_secret" = '<DIFY_SYNC_WEBHOOK_SECRET>';

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
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
    url      := webhook_url,
    body     := row_to_json(NEW)::text,
    headers  := ARRAY[
      extensions.http_header('Content-Type', 'application/json'),
      extensions.http_header('Authorization', 'Bearer ' || webhook_secret)
    ]
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_documents_dify_sync ON public.company_documents;

CREATE TRIGGER company_documents_dify_sync
  AFTER INSERT
  ON public.company_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.company_documents_dify_sync_fn();
