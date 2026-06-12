-- Phase 4: 선제적 알림 비서 (Proactive Agent) 알림 보관용 테이블
CREATE TABLE IF NOT EXISTS public.user_notifications (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    title varchar(255) NOT NULL,
    content text NOT NULL,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    
    CONSTRAINT user_notifications_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.user_notifications IS '선제적 AI 에이전트가 생성한 개인별 일일 아침 요약/알림 브리핑';

CREATE INDEX IF NOT EXISTS user_notifications_user_id_idx ON public.user_notifications (user_id);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_notifications_select_own ON public.user_notifications
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY user_notifications_update_own ON public.user_notifications
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY user_notifications_delete_own ON public.user_notifications
    FOR DELETE TO authenticated USING (auth.uid() = user_id);
