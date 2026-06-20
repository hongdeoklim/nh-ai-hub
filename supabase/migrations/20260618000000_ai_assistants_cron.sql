-- AI 비서 스케줄러 등록 (매일 특정 시간에 실행)
-- pg_cron 및 pg_net을 사용하여 Edge Function 호출

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 매일 아침 9시 (KST) = UTC 기준 자정 (00:00)에 브리핑용 비서들 실행
-- (참고: Edge Function 내에서 전체 사용자를 루프 돌도록 설계하거나, 특정 사용자를 지정해야 함)
-- 여기서는 각 사용자를 루프 돌면서 비서를 실행하는 별도의 오케스트레이터(proactive-notifier)
-- 또는 알림 시스템을 활용하는 것이 이상적입니다.

-- 예시로, 특정 URL로 스케줄을 트리거하는 잡 등록
SELECT cron.schedule(
  'trigger_daily_ai_assistants',
  '0 0 * * *', -- 매일 UTC 00:00 (한국 09:00)
  $$
    SELECT net.http_post(
        url := 'https://' || current_setting('request.env.SUPABASE_URL', true) || '/functions/v1/proactive-notifier',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('request.env.SUPABASE_SERVICE_ROLE_KEY', true) || '"}'::jsonb,
        body := '{"trigger": "daily_assistants_run"}'::jsonb
    );
  $$
);
