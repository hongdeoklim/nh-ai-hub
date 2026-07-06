-- =============================================================================
-- Google Drive 자동 동기화 스케줄 (pg_cron)
-- Drive → rag-ingest → company_documents → (DB 트리거) → Dify
-- =============================================================================

-- pg_cron이 설치된 경우에만 실행
DO $$
DECLARE
  jid        bigint;
  fn_url     text;
  job_sql    text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron 미설치 — Drive 자동 동기화 스케줄을 건너뜁니다.';
    RETURN;
  END IF;

  -- 기존 동일 이름 job 제거
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'drive-auto-sync' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;

  fn_url  := 'https://wndnjrcljdvbnezfpisb.supabase.co/functions/v1/drive-sync-cron';

  -- cron job 실행 SQL을 문자열로 조립
  job_sql := 'SELECT extensions.http_post('
    || 'url:=' || quote_literal(fn_url) || ','
    || 'body:=' || quote_literal('{"source":"cron"}') || ','
    || 'headers:=ARRAY['
    ||   'extensions.http_header(''Content-Type'',''application/json''),'
    ||   'extensions.http_header(''Authorization'',''Bearer ''||'
    ||     'current_setting(''app.settings.dify_sync_webhook_secret'',true))'
    || '])';

  -- 매일 KST 03:00 (= UTC 18:00) 자동 Drive 동기화
  PERFORM cron.schedule('drive-auto-sync', '0 18 * * *', job_sql);

  RAISE NOTICE 'drive-auto-sync 스케줄 등록 완료 (매일 UTC 18:00 = KST 03:00)';
END $$;
