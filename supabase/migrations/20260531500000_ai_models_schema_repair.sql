-- -----------------------------------------------------------------------------
-- ai_models 레거시/부분 배포 스키마 보정 (display_name 등 누락 컬럼)
-- CREATE TABLE IF NOT EXISTS 만 적용된 경우 기존 테이블에 컬럼이 추가되지 않을 수 있음
-- -----------------------------------------------------------------------------

ALTER TABLE public.ai_models
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS api_id text,
  ADD COLUMN IF NOT EXISTS model_type text DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS hint text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 레거시 컬럼명 → 신규 컬럼 백필
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_models' AND column_name = 'name'
  ) THEN
    UPDATE public.ai_models
    SET display_name = name
    WHERE display_name IS NULL OR char_length(trim(display_name)) = 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_models' AND column_name = 'label'
  ) THEN
    UPDATE public.ai_models
    SET display_name = COALESCE(NULLIF(trim(display_name), ''), label)
    WHERE display_name IS NULL OR char_length(trim(display_name)) = 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_models' AND column_name = 'model_id'
  ) THEN
    UPDATE public.ai_models
    SET api_id = COALESCE(NULLIF(trim(api_id), ''), model_id)
    WHERE api_id IS NULL OR char_length(trim(api_id)) = 0;

    UPDATE public.ai_models
    SET model_id = COALESCE(NULLIF(trim(model_id), ''), api_id)
    WHERE model_id IS NULL OR char_length(trim(model_id)) = 0;
  END IF;

  -- 레거시 model_name ↔ display_name 양방향 백필
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_models' AND column_name = 'model_name'
  ) THEN
    UPDATE public.ai_models
    SET display_name = COALESCE(
      NULLIF(trim(display_name), ''),
      NULLIF(trim(model_name), '')
    )
    WHERE display_name IS NULL OR char_length(trim(display_name)) = 0;

    UPDATE public.ai_models
    SET model_name = COALESCE(
      NULLIF(trim(model_name), ''),
      NULLIF(trim(display_name), ''),
      NULLIF(trim(api_id), ''),
      'Unknown model'
    )
    WHERE model_name IS NULL OR char_length(trim(model_name)) = 0;
  END IF;
END $$;

UPDATE public.ai_models
SET display_name = COALESCE(
  NULLIF(trim(display_name), ''),
  NULLIF(trim(api_id), ''),
  'Unknown model'
)
WHERE display_name IS NULL OR char_length(trim(display_name)) = 0;

UPDATE public.ai_models
SET api_id = COALESCE(
  NULLIF(trim(api_id), ''),
  'legacy-' || id::text
)
WHERE api_id IS NULL OR char_length(trim(api_id)) = 0;

UPDATE public.ai_models
SET model_type = 'text'
WHERE model_type IS NULL OR model_type NOT IN ('text', 'image');

UPDATE public.ai_models
SET is_active = true
WHERE is_active IS NULL;

UPDATE public.ai_models
SET sort_order = 0
WHERE sort_order IS NULL;

UPDATE public.ai_models
SET provider = 'google'
WHERE provider IS NULL OR provider NOT IN ('anthropic', 'openai', 'google');

UPDATE public.ai_models
SET created_at = now()
WHERE created_at IS NULL;

UPDATE public.ai_models
SET updated_at = now()
WHERE updated_at IS NULL;

-- model_name / model_id NOT NULL 레거시 컬럼 최종 백필
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_models' AND column_name = 'model_name'
  ) THEN
    UPDATE public.ai_models
    SET model_name = COALESCE(
      NULLIF(trim(model_name), ''),
      NULLIF(trim(display_name), ''),
      NULLIF(trim(api_id), ''),
      NULLIF(trim(model_id), ''),
      'Unknown model'
    )
    WHERE model_name IS NULL OR char_length(trim(model_name)) = 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_models' AND column_name = 'model_id'
  ) THEN
    UPDATE public.ai_models
    SET model_id = COALESCE(
      NULLIF(trim(model_id), ''),
      NULLIF(trim(api_id), ''),
      'legacy-' || id::text
    )
    WHERE model_id IS NULL OR char_length(trim(model_id)) = 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_models_api_id_unique'
  ) THEN
    ALTER TABLE public.ai_models
      ADD CONSTRAINT ai_models_api_id_unique UNIQUE (api_id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_models_display_name_nonempty'
  ) THEN
    ALTER TABLE public.ai_models
      ADD CONSTRAINT ai_models_display_name_nonempty
      CHECK (char_length(trim(display_name)) > 0);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_models_api_id_nonempty'
  ) THEN
    ALTER TABLE public.ai_models
      ADD CONSTRAINT ai_models_api_id_nonempty
      CHECK (char_length(trim(api_id)) > 0);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_models_provider_check'
  ) THEN
    ALTER TABLE public.ai_models
      ADD CONSTRAINT ai_models_provider_check
      CHECK (provider IN ('anthropic', 'openai', 'google'));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_models_model_type_check'
  ) THEN
    ALTER TABLE public.ai_models
      ADD CONSTRAINT ai_models_model_type_check
      CHECK (model_type IN ('text', 'image'));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS ai_models_active_sort_idx
  ON public.ai_models (is_active, sort_order, provider, display_name);

-- 기본 모델 시드 (누락분만) — 레거시 model_name / model_id NOT NULL 동시 채움
DO $$
BEGIN
  -- INSERT 실패로 남은 깨진 행 정리
  DELETE FROM public.ai_models
  WHERE (api_id IS NULL OR char_length(trim(api_id)) = 0)
    AND (
      NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ai_models' AND column_name = 'model_id'
      )
      OR model_id IS NULL
      OR char_length(trim(model_id)) = 0
    );

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_models' AND column_name = 'model_id'
  ) THEN
    INSERT INTO public.ai_models (
      provider,
      model_name,
      model_id,
      display_name,
      api_id,
      model_type,
      hint,
      is_active,
      sort_order
    )
    VALUES
      ('anthropic', 'Opus 4.7', 'claude-opus-4-7', 'Opus 4.7', 'claude-opus-4-7', 'text', '최상급 추론·에이전트·장문 분석(공식 최신 Opus)', true, 10),
      ('anthropic', 'Sonnet 4.6', 'claude-sonnet-4-6', 'Sonnet 4.6', 'claude-sonnet-4-6', 'text', '속도·품질 균형 · 시방·계약·코드 보조에 적합', true, 20),
      ('anthropic', 'Haiku 4.5', 'claude-haiku-4-5', 'Haiku 4.5', 'claude-haiku-4-5', 'text', '초저지연·요약·단답형', true, 30),
      ('anthropic', 'Opus 4.5 (레거시)', 'claude-opus-4-5', 'Opus 4.5 (레거시)', 'claude-opus-4-5', 'text', '이전 스냅샷 호환 · 필요 시 유지보수용', true, 40),
      ('anthropic', 'Sonnet 4.5 (레거시)', 'claude-sonnet-4-5', 'Sonnet 4.5 (레거시)', 'claude-sonnet-4-5', 'text', '이전 저장 프로필과 동일 문자열 호환', true, 50),
      ('openai', 'GPT-5.5', 'gpt-5.5', 'GPT-5.5', 'gpt-5.5', 'text', '최신 프론티어 · 복잡 추론·코드(공식 플래그십 가이드)', true, 110),
      ('openai', 'GPT-5.4', 'gpt-5.4', 'GPT-5.4', 'gpt-5.4', 'text', '전문 업무 균형 · 멀티모달 텍스트/이미지 입력', true, 120),
      ('openai', 'GPT-5.4 mini', 'gpt-5.4-mini', 'GPT-5.4 mini', 'gpt-5.4-mini', 'text', '고성능 소형 · 대량·빠른 응답', true, 130),
      ('openai', 'GPT-5.4 nano', 'gpt-5.4-nano', 'GPT-5.4 nano', 'gpt-5.4-nano', 'text', '최저비용 근거·추출·분류 작업에 적합', true, 140),
      ('openai', 'GPT-4o', 'gpt-4o', 'GPT-4o', 'gpt-4o', 'text', '기존 워크로드·구 API 티어 호환', true, 150),
      ('openai', 'GPT-4o mini', 'gpt-4o-mini', 'GPT-4o mini', 'gpt-4o-mini', 'text', '경량 레거시 대안 · 저지연 요약', true, 160),
      ('google', 'Gemini 3.1 Pro Preview', 'gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview', 'gemini-3.1-pro-preview', 'text', 'Gemini 3 최상급(프리뷰)·도구·멀티모달', true, 210),
      ('google', 'Gemini 3 Flash Preview', 'gemini-3-flash-preview', 'Gemini 3 Flash Preview', 'gemini-3-flash-preview', 'text', '3세대 속도형(프리뷰)·비용 대비 성능', true, 220),
      ('google', 'Gemini 3.1 Flash‑Lite', 'gemini-3.1-flash-lite', 'Gemini 3.1 Flash‑Lite', 'gemini-3.1-flash-lite', 'text', '3.x 안정·초경량·고빈도 호출용', true, 230),
      ('google', 'Gemini 2.5 Pro', 'gemini-2.5-pro', 'Gemini 2.5 Pro', 'gemini-2.5-pro', 'text', '2.5 최상급 추론(안정)', true, 240),
      ('google', 'Gemini 2.5 Flash', 'gemini-2.5-flash', 'Gemini 2.5 Flash', 'gemini-2.5-flash', 'text', '이미지·표 포함 일반 업무(안정)', true, 250),
      ('google', 'Gemini 2.5 Flash‑Lite', 'gemini-2.5-flash-lite', 'Gemini 2.5 Flash‑Lite', 'gemini-2.5-flash-lite', 'text', '최저지연 요약·간단 질의', true, 260)
    ON CONFLICT (api_id) DO NOTHING;
  ELSE
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
  END IF;
END $$;
