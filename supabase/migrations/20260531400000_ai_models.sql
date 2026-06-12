-- -----------------------------------------------------------------------------
-- AI 모델 레지스트리 — 관리자 CRUD · 채팅 드롭다운 · Edge Function 라우팅
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_models (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  display_name text NOT NULL,
  api_id text NOT NULL,
  model_type text NOT NULL DEFAULT 'text',
  hint text NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ai_models_pkey PRIMARY KEY (id),
  CONSTRAINT ai_models_api_id_unique UNIQUE (api_id),
  CONSTRAINT ai_models_display_name_nonempty CHECK (char_length(trim(display_name)) > 0),
  CONSTRAINT ai_models_api_id_nonempty CHECK (char_length(trim(api_id)) > 0),
  CONSTRAINT ai_models_provider_check CHECK (
    provider IN ('anthropic', 'openai', 'google')
  ),
  CONSTRAINT ai_models_model_type_check CHECK (
    model_type IN ('text', 'image')
  )
);

COMMENT ON TABLE public.ai_models IS
  '사내 포털 AI 모델 레지스트리. is_active=true 행만 일반 사용자 드롭다운에 노출.';

CREATE INDEX IF NOT EXISTS ai_models_active_sort_idx
  ON public.ai_models (is_active, sort_order, provider, display_name);

CREATE OR REPLACE FUNCTION public.touch_ai_models_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_models_set_updated_at ON public.ai_models;
CREATE TRIGGER ai_models_set_updated_at
  BEFORE UPDATE ON public.ai_models
  FOR EACH ROW
  EXECUTE PROCEDURE public.touch_ai_models_updated_at();

ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_models_select_active ON public.ai_models;
CREATE POLICY ai_models_select_active
  ON public.ai_models
  FOR SELECT
  TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS ai_models_select_admin ON public.ai_models;
CREATE POLICY ai_models_select_admin
  ON public.ai_models
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_admin());

DROP POLICY IF EXISTS ai_models_insert_admin ON public.ai_models;
CREATE POLICY ai_models_insert_admin
  ON public.ai_models
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_is_admin());

DROP POLICY IF EXISTS ai_models_update_admin ON public.ai_models;
CREATE POLICY ai_models_update_admin
  ON public.ai_models
  FOR UPDATE
  TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

DROP POLICY IF EXISTS ai_models_delete_admin ON public.ai_models;
CREATE POLICY ai_models_delete_admin
  ON public.ai_models
  FOR DELETE
  TO authenticated
  USING (public.current_user_is_admin());

GRANT SELECT ON public.ai_models TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_models TO authenticated;

-- Realtime (관리자 UI · 채팅 드롭다운 동기화)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ai_models'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_models;
  END IF;
END;
$$;

-- 기존 하드코딩 목록 시드 (text 모델)
INSERT INTO public.ai_models (provider, display_name, api_id, model_type, hint, is_active, sort_order)
VALUES
  ('anthropic', 'Opus 4.7', 'claude-opus-4-7', 'text', '최상급 추론·에이전트·장문 분석(공식 최신 Opus)', true, 10),
  ('anthropic', 'Sonnet 4.6', 'claude-sonnet-4-6', 'text', '속도·품질 균형 · 시방·계약·코드 보조에 적합', true, 20),
  ('anthropic', 'Haiku 4.5', 'claude-haiku-4-5', 'text', '초저지연·요약·단답형', true, 30),
  ('anthropic', 'Opus 4.5 (레거시)', 'claude-opus-4-5', 'text', '이전 스냅샷 호환 · 필요 시 유지보수용', true, 40),
  ('anthropic', 'Sonnet 4.5 (레거시)', 'claude-sonnet-4-5', 'text', '이전 저장 프로필과 동일 문자열 호환', true, 50),
  ('openai', 'GPT-5.5', 'gpt-5.5', 'text', '최신 프론티어 · 복잡 추론·코드(공식 플래그십 가이드)', true, 110),
  ('openai', 'GPT-5.4', 'gpt-5.4', 'text', '전문 업무 균형 · 멀티모달 텍스트/이미지 입력', true, 120),
  ('openai', 'GPT-5.4 mini', 'gpt-5.4-mini', 'text', '고성능 소형 · 대량·빠른 응답', true, 130),
  ('openai', 'GPT-5.4 nano', 'gpt-5.4-nano', 'text', '최저비용 근거·추출·분류 작업에 적합', true, 140),
  ('openai', 'GPT-4o', 'gpt-4o', 'text', '기존 워크로드·구 API 티어 호환', true, 150),
  ('openai', 'GPT-4o mini', 'gpt-4o-mini', 'text', '경량 레거시 대안 · 저지연 요약', true, 160),
  ('google', 'Gemini 3.1 Pro Preview', 'gemini-3.1-pro-preview', 'text', 'Gemini 3 최상급(프리뷰)·도구·멀티모달', true, 210),
  ('google', 'Gemini 3 Flash Preview', 'gemini-3-flash-preview', 'text', '3세대 속도형(프리뷰)·비용 대비 성능', true, 220),
  ('google', 'Gemini 3.1 Flash‑Lite', 'gemini-3.1-flash-lite', 'text', '3.x 안정·초경량·고빈도 호출용', true, 230),
  ('google', 'Gemini 2.5 Pro', 'gemini-2.5-pro', 'text', '2.5 최상급 추론(안정)', true, 240),
  ('google', 'Gemini 2.5 Flash', 'gemini-2.5-flash', 'text', '이미지·표 포함 일반 업무(안정)', true, 250),
  ('google', 'Gemini 2.5 Flash‑Lite', 'gemini-2.5-flash-lite', 'text', '최저지연 요약·간단 질의', true, 260)
ON CONFLICT (api_id) DO NOTHING;
