-- =============================================================================
-- Dify 동기화 · Drive 자동 동기화의 HTTP 호출을 pg_net(net.http_post)으로 바로잡는다
--
-- 문제
--   20260613084556_enable_pg_net 은 company_documents 트리거를 net.http_post 로 올바르게 만들었지만,
--   20260624200000_fix_dify_sync_trigger_auth 가 인증 헤더를 넣으면서
--   extensions.http_post(url := …, body := …, headers := ARRAY[extensions.http_header(…)]) 로 바꿨다.
--   이 시그니처는 pg_net(net.http_post) 에도 pgsql-http(uri/content) 에도 없다. 이후
--   20260624210000(drive-auto-sync)·20260724000000(dify-sync-queue-drain)·20260724010000(트리거)도
--   같은 형식을 따랐다. 그 결과:
--     - cron 두 개는 실행될 때마다 "function does not exist" 로 실패하고,
--     - 시크릿이 설정돼 있으면 트리거 예외로 company_documents INSERT 자체가 실패할 수 있었다.
--
-- 해결
--   1) 허용된 내부 Edge Function 만 pg_net 으로 비동기 호출하는 SECURITY DEFINER 함수로 모은다.
--      (일반 역할의 실행 권한은 회수 — PostgREST RPC 로 노출되지 않게)
--   2) 시크릿·프로젝트 URL 은 Vault → DB 설정(app.settings.*) → 기존 값 순으로 찾는다.
--   3) 트리거는 어떤 오류가 나도 INSERT 를 막지 않는다 (경고만 남김).
--   4) 두 cron 을 새 함수로 다시 등록한다.
--
-- 시크릿 등록 (둘 중 하나)
--   select vault.create_secret('<DIFY_SYNC_WEBHOOK_SECRET 값>', 'dify_sync_webhook_secret');
--   ALTER DATABASE postgres SET "app.settings.dify_sync_webhook_secret" = '<값>';
-- 프로젝트 URL 이 기본값(https://wndnjrcljdvbnezfpisb.supabase.co)과 다르면
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--
-- 적용 후 확인
--   select jobname, status, return_message, start_time
--     from cron.job_run_details d join cron.job j using (jobid)
--    where jobname in ('dify-sync-queue-drain', 'drive-auto-sync')
--    order by start_time desc limit 20;
--   select id, status_code, left(content::text, 200), created from net._http_response order by created desc limit 20;
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 내부 설정값 읽기: Vault 비밀 → DB 설정(GUC) 순. 내부 전용(일반 역할 실행 불가).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nh_internal_setting(p_vault_name text, p_guc text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  BEGIN
    -- Vault 가 없는 환경에서도 함수가 만들어지도록 동적 SQL 로 조회한다
    EXECUTE 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      INTO v
      USING p_vault_name;
  EXCEPTION WHEN OTHERS THEN
    v := NULL;
  END;

  IF v IS NULL OR v = '' THEN
    v := current_setting(p_guc, true);
  END IF;

  RETURN NULLIF(v, '');
END;
$$;

REVOKE ALL ON FUNCTION public.nh_internal_setting(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nh_internal_setting(text, text) FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 허용된 내부 Edge Function 을 pg_net 으로 비동기 호출한다.
-- 반환: pg_net 요청 ID (시크릿이 없어 건너뛰면 NULL). 응답은 net._http_response 에 남는다.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nh_invoke_internal_function(
  p_function   text,
  p_body       jsonb   DEFAULT '{}'::jsonb,
  p_timeout_ms integer DEFAULT 60000
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  secret   text;
  base_url text;
BEGIN
  -- 이 함수로 부를 수 있는 대상은 웹훅 시크릿으로 인증하는 내부 함수뿐이다
  IF p_function NOT IN ('dify-sync-webhook', 'drive-sync-cron') THEN
    RAISE EXCEPTION 'nh_invoke_internal_function: 허용되지 않은 함수 %', p_function;
  END IF;

  secret := public.nh_internal_setting('dify_sync_webhook_secret', 'app.settings.dify_sync_webhook_secret');
  IF secret IS NULL THEN
    RAISE WARNING '[nh-internal] dify_sync_webhook_secret 미설정 — % 호출을 건너뜁니다.', p_function;
    RETURN NULL;
  END IF;

  base_url := rtrim(
    COALESCE(
      public.nh_internal_setting('project_url', 'app.settings.supabase_url'),
      'https://wndnjrcljdvbnezfpisb.supabase.co'
    ),
    '/'
  );

  RETURN net.http_post(
    url                  := base_url || '/functions/v1/' || p_function,
    body                 := COALESCE(p_body, '{}'::jsonb),
    headers              := jsonb_build_object(
                              'Content-Type', 'application/json',
                              'Authorization', 'Bearer ' || secret
                            ),
    timeout_milliseconds := p_timeout_ms
  );
END;
$$;

REVOKE ALL ON FUNCTION public.nh_invoke_internal_function(text, jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nh_invoke_internal_function(text, jsonb, integer) FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- company_documents 트리거: 문(statement) 단위로 큐 드레인 웹훅을 비동기로 깨운다.
-- pg_net 은 요청을 큐에 넣기만 하므로 INSERT 를 기다리게 하지 않으며, 실패해도 INSERT 는 막지 않는다.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_documents_dify_sync_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.nh_invoke_internal_function('dify-sync-webhook', '{"limit":20}'::jsonb, 60000);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[dify-sync] 웹훅 호출 예약 실패 (INSERT 는 계속 진행): %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS company_documents_dify_sync ON public.company_documents;

CREATE TRIGGER company_documents_dify_sync
  AFTER INSERT
  ON public.company_documents
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.company_documents_dify_sync_fn();

-- -----------------------------------------------------------------------------
-- cron 재등록 (pg_cron 이 있을 때만)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  jid bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron 미설치 — Dify·Drive 동기화 스케줄 재등록을 건너뜁니다.';
    RETURN;
  END IF;

  FOR jid IN
    SELECT jobid FROM cron.job WHERE jobname IN ('dify-sync-queue-drain', 'drive-auto-sync')
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;

  -- 5분마다 Dify 동기화 큐(pending) 최대 20건 처리
  PERFORM cron.schedule(
    'dify-sync-queue-drain',
    '*/5 * * * *',
    $job$select public.nh_invoke_internal_function('dify-sync-webhook', '{"limit":20}'::jsonb, 60000)$job$
  );

  -- 매일 KST 03:00 (= UTC 18:00) Google Drive → rag-ingest 동기화 (오래 걸려 응답 대기 5분)
  PERFORM cron.schedule(
    'drive-auto-sync',
    '0 18 * * *',
    $job$select public.nh_invoke_internal_function('drive-sync-cron', '{"source":"cron"}'::jsonb, 300000)$job$
  );

  RAISE NOTICE 'dify-sync-queue-drain(5분) · drive-auto-sync(매일 KST 03:00) 재등록 완료';
END $$;
