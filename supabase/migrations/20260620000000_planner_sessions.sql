-- AI Planner 세션 저장 (대화 + 생성된 기획안)

CREATE TABLE IF NOT EXISTS public.planner_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '새 기획',
  preferred_model text NOT NULL DEFAULT 'auto',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  plan_result jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT planner_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT planner_sessions_messages_is_array CHECK (jsonb_typeof(messages) = 'array')
);

COMMENT ON TABLE public.planner_sessions IS 'AI Planner 대화 세션 및 생성된 기획 산출물';
COMMENT ON COLUMN public.planner_sessions.messages IS 'CoreMessage[] — role, content';
COMMENT ON COLUMN public.planner_sessions.plan_result IS 'PlannerFullResult JSON (prd, spec, mermaid, wireframe)';

CREATE INDEX IF NOT EXISTS planner_sessions_user_updated_idx
  ON public.planner_sessions (user_id, updated_at DESC);

ALTER TABLE public.planner_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planner_sessions_select_own ON public.planner_sessions;
CREATE POLICY planner_sessions_select_own ON public.planner_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS planner_sessions_insert_own ON public.planner_sessions;
CREATE POLICY planner_sessions_insert_own ON public.planner_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS planner_sessions_update_own ON public.planner_sessions;
CREATE POLICY planner_sessions_update_own ON public.planner_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS planner_sessions_delete_own ON public.planner_sessions;
CREATE POLICY planner_sessions_delete_own ON public.planner_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
