-- -----------------------------------------------------------------------------
-- 사용자별로 메인 영역 등에서 숨긴 전사 고정 프롬프트 ID (정적 카탈로그 키)
-- -----------------------------------------------------------------------------
CREATE TABLE public.user_hidden_org_prompts (
  user_id uuid NOT NULL,
  prompt_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_hidden_org_prompts_pkey PRIMARY KEY (user_id, prompt_id),
  CONSTRAINT user_hidden_org_prompts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT user_hidden_org_prompts_prompt_id_check CHECK (char_length(trim(prompt_id)) > 0)
);

COMMENT ON TABLE public.user_hidden_org_prompts IS
  '전사 고정 템플릿(코드 카탈로그 ID) 중 사용자가 대시보드 등에서 숨긴 항목.';

ALTER TABLE public.user_hidden_org_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_hidden_org_prompts_select_own
  ON public.user_hidden_org_prompts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY user_hidden_org_prompts_insert_own
  ON public.user_hidden_org_prompts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_hidden_org_prompts_delete_own
  ON public.user_hidden_org_prompts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX user_hidden_org_prompts_user_id_idx
  ON public.user_hidden_org_prompts (user_id);
