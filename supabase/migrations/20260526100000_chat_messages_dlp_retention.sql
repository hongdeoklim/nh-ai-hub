-- -----------------------------------------------------------------------------
-- [29단계] 7일 지연 DLP 마스킹 — chat_messages.is_dlp_checked
-- 실시간 대화는 원본 유지, 7일 경과 후 daily-dlp-masking Edge Function 이 마스킹
-- -----------------------------------------------------------------------------

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS is_dlp_checked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.chat_messages.is_dlp_checked IS
  'DLP 배치(daily-dlp-masking) 처리 완료 여부. false 이고 created_at <= now()-7d 이면 마스킹 대상.';

-- 배치 조회용 복합 인덱스
CREATE INDEX IF NOT EXISTS chat_messages_dlp_pending_idx
  ON public.chat_messages (is_dlp_checked, created_at ASC)
  WHERE is_dlp_checked = false;

-- -----------------------------------------------------------------------------
-- pg_cron / Supabase Scheduler 가이드 — 매일 새벽 3시 (KST)
-- -----------------------------------------------------------------------------
-- KST 03:00 = UTC 18:00 (전일)
--
-- [방법 A] Supabase Dashboard
--   Edge Functions → daily-dlp-masking → Schedules
--   Cron expression: 0 18 * * *
--   (매일 UTC 18:00 = KST 다음날 03:00)
--
-- [방법 B] pg_cron + pg_net (SQL Editor — extensions 활성화 필요)
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   CREATE EXTENSION IF NOT EXISTS pg_net;
--
--   SELECT cron.schedule(
--     'daily-dlp-masking',
--     '0 18 * * *',
--     $$
--     SELECT net.http_post(
--       url := 'https://<PROJECT_REF>.supabase.co/functions/v1/daily-dlp-masking',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ' || '<SERVICE_ROLE_KEY>',
--         'x-cron-secret', '<CRON_SECRET>'
--       ),
--       body := '{"batchSize":500}'::jsonb
--     );
--     $$
--   );
--
-- [방법 C] 수동 검증 (dryRun)
--   curl -X POST "$SUPABASE_URL/functions/v1/daily-dlp-masking" \
--     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"dryRun":true,"batchSize":50}'
-- -----------------------------------------------------------------------------
