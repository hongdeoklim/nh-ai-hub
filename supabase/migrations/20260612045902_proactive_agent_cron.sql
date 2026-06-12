-- Phase 4: pg_cron 스케줄러를 활용한 아침 08:30 매일 브리핑 생성
-- pg_net 확장을 사용하여 Edge Function을 호출합니다.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 아침 8시 30분(KST)에 동작하도록 UTC 시간으로 변환하여 크론 설정
-- 한국시간 08:30 = UTC 23:30 (이전 날짜)
SELECT cron.schedule(
  'daily_proactive_briefing',
  '30 23 * * *',
  $$
    SELECT net.http_post(
        url := 'https://' || current_setting('request.env.SUPABASE_URL', true) || '/functions/v1/proactive-notifier',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('request.env.SUPABASE_SERVICE_ROLE_KEY', true) || '"}'::jsonb
    );
  $$
);
