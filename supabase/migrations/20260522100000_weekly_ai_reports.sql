-- -----------------------------------------------------------------------------
-- [22단계] weekly_ai_reports · chat_sessions (개인 세션) · 배치 분석 RPC
-- -----------------------------------------------------------------------------

-- 선행: 관리자 RLS 헬퍼 (부분 적용 DB 호환)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND (
        COALESCE(u.is_admin, false) = true
        OR lower(trim(coalesce(u.role, ''))) = 'admin'
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;

-- -----------------------------------------------------------------------------
-- chat_sessions / chat_session_messages (개인 채팅 세션 — team chat_messages 와 별도)
-- team 공유 대화는 기존 public.chat_messages + team_conversations 를 사용합니다.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '개인 채팅',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chat_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT chat_sessions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE,
  CONSTRAINT chat_sessions_title_check CHECK (char_length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS chat_sessions_user_id_created_idx
  ON public.chat_sessions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_session_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chat_session_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chat_session_messages_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.chat_sessions (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS chat_session_messages_session_created_idx
  ON public.chat_session_messages (session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS chat_session_messages_created_at_idx
  ON public.chat_session_messages (created_at DESC);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_session_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_sessions_select_own
  ON public.chat_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY chat_sessions_insert_own
  ON public.chat_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY chat_session_messages_select_own
  ON public.chat_session_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = chat_session_messages.session_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY chat_session_messages_insert_own
  ON public.chat_session_messages FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = chat_session_messages.session_id AND s.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- weekly_ai_reports
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_ai_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  report_date date NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  top_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text NOT NULL DEFAULT '',
  generated_by_ai boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT weekly_ai_reports_pkey PRIMARY KEY (id),
  CONSTRAINT weekly_ai_reports_report_date_key UNIQUE (report_date),
  CONSTRAINT weekly_ai_reports_summary_check CHECK (char_length(trim(summary)) > 0)
);

COMMENT ON TABLE public.weekly_ai_reports IS
  '주간 AI 활용 트렌드 리포트. Edge Function(generate-weekly-report)만 INSERT.';

CREATE INDEX IF NOT EXISTS weekly_ai_reports_report_date_idx
  ON public.weekly_ai_reports (report_date DESC);

ALTER TABLE public.weekly_ai_reports ENABLE ROW LEVEL SECURITY;

-- 관리자: 조회만
CREATE POLICY weekly_ai_reports_select_admin
  ON public.weekly_ai_reports
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_admin());

-- authenticated INSERT/UPDATE/DELETE 정책 없음 → Edge service_role 전용 INSERT

-- -----------------------------------------------------------------------------
-- Cron / 스케줄 가이드 (Supabase SQL Editor 또는 Dashboard 참고)
-- -----------------------------------------------------------------------------
-- [Supabase Dashboard] Edge Functions → generate-weekly-report → Schedules
--   Cron: 0 6 * * 1   (매주 월요일 06:00 UTC ≈ KST 15:00)
--
-- [pg_cron + pg_net 예시 — extensions 활성화 필요]
-- SELECT cron.schedule(
--   'generate-weekly-report',
--   '0 6 * * 1',
--   $$
--   SELECT net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/generate-weekly-report',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || '<SERVICE_ROLE_KEY>'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
