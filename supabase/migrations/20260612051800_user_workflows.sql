-- Native Workflows (자체 워크플로우) 저장 테이블
CREATE TABLE IF NOT EXISTS public.user_workflows (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    title varchar(255) NOT NULL,
    description text,
    category varchar(50) NOT NULL DEFAULT 'all',
    system_prompt text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    
    CONSTRAINT user_workflows_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.user_workflows IS '사용자가 정의한 맞춤형 워크플로우(시스템 프롬프트 봇) 목록';

CREATE INDEX IF NOT EXISTS user_workflows_user_id_idx ON public.user_workflows (user_id);

ALTER TABLE public.user_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_workflows_select_own ON public.user_workflows
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY user_workflows_insert_own ON public.user_workflows
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_workflows_update_own ON public.user_workflows
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY user_workflows_delete_own ON public.user_workflows
    FOR DELETE TO authenticated USING (auth.uid() = user_id);
