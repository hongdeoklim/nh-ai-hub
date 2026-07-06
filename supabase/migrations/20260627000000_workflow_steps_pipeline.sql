-- 워크플로우 다단계 파이프라인 지원
-- steps: JSONB 배열로 각 단계를 정의
ALTER TABLE public.user_workflows
  ADD COLUMN IF NOT EXISTS steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS trigger_type text NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('manual', 'schedule', 'email', 'webhook')),
  ADD COLUMN IF NOT EXISTS trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS run_count integer NOT NULL DEFAULT 0;

-- workflow_step_runs: 단계별 실행 이력
CREATE TABLE IF NOT EXISTS public.workflow_step_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  step_id text NOT NULL,
  step_type text NOT NULL,
  step_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  input jsonb,
  output jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_step_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY workflow_step_runs_select ON public.workflow_step_runs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workflow_runs r
    WHERE r.id = run_id AND r.user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS workflow_step_runs_run_id_idx
  ON public.workflow_step_runs(run_id);

COMMENT ON TABLE public.workflow_step_runs IS '워크플로우 각 단계별 실행 이력';
COMMENT ON COLUMN public.user_workflows.steps IS
  'JSONB 배열: [{id, type, name, config}] — trigger/data/ai/action/condition/save';
