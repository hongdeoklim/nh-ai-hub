-- =============================================================================
-- knowledge_sync_jobs 큐 드레인 스케줄 (pg_cron)
-- knowledge_base INSERT/UPDATE → knowledge_sync_jobs(pending) → (본 cron) → dify-sync-webhook → Dify
--
-- 배경: 큐에 잡을 쌓는 트리거(queue_knowledge_sync)는 있지만 큐를 주기적으로
-- 비워주는 호출자가 없어, company_documents INSERT 가 우연히 웹훅을 깨울 때만
-- 동기화가 진행되던 문제를 고친다.
--
-- 선행 조건 (drive-auto-sync 와 동일):
--   ALTER DATABASE postgres SET "app.settings.dify_sync_webhook_secret" = '<DIFY_SYNC_WEBHOOK_SECRET>';
-- =============================================================================

DO $$
DECLARE
  jid        bigint;
  fn_url     text;
  job_sql    text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron 미설치 — Dify 동기화 큐 드레인 스케줄을 건너뜁니다.';
    RETURN;
  END IF;

  -- 기존 동일 이름 job 제거
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'dify-sync-queue-drain' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;

  fn_url  := 'https://wndnjrcljdvbnezfpisb.supabase.co/functions/v1/dify-sync-webhook';

  -- cron job 실행 SQL을 문자열로 조립 (시크릿 미등록 시 호출 자체를 건너뜀)
  job_sql := 'SELECT extensions.http_post('
    || 'url:=' || quote_literal(fn_url) || ','
    || 'body:=' || quote_literal('{"limit":20}') || ','
    || 'headers:=ARRAY['
    ||   'extensions.http_header(''Content-Type'',''application/json''),'
    ||   'extensions.http_header(''Authorization'',''Bearer ''||'
    ||     'current_setting(''app.settings.dify_sync_webhook_secret'',true))'
    || ']) WHERE COALESCE(current_setting(''app.settings.dify_sync_webhook_secret'',true), '''') <> ''''';

  -- 5분마다 pending 잡 최대 20건 처리
  PERFORM cron.schedule('dify-sync-queue-drain', '*/5 * * * *', job_sql);

  RAISE NOTICE 'dify-sync-queue-drain 스케줄 등록 완료 (5분 간격)';
END $$;
