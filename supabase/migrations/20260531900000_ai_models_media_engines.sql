-- -----------------------------------------------------------------------------
-- ai_models 미디어 엔진(image / video) 카탈로그 + model_type 확장
-- -----------------------------------------------------------------------------

ALTER TABLE public.ai_models DROP CONSTRAINT IF EXISTS ai_models_model_type_check;

ALTER TABLE public.ai_models
  ADD CONSTRAINT ai_models_model_type_check
  CHECK (model_type IN ('text', 'image', 'video'));

DO $$
BEGIN
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
      cost_info,
      description,
      is_active,
      sort_order
    )
    SELECT * FROM (VALUES
      ('google'::text, 'Imagen 3.0 Pro'::text, 'imagen-3.0-generate-002'::text, 'Imagen 3.0 Pro'::text, 'imagen-3.0-generate-002'::text, 'image'::text, 'Google Imagen 3 · 고품질 일러스트·포스터'::text, '보통'::text, '추천: 홍보물 일러스트 · 현장 안전 포스터 · 16:9 배너. Google Gemini 생태계 기본 이미지 엔진.'::text, true, 10),
      ('openai', 'DALL·E 3', 'dall-e-3', 'DALL·E 3', 'dall-e-3', 'image', 'OpenAI DALL·E 3 · 사실적·창의적 합성', '높음', '추천: 마케팅 비주얼 · 제품 목업 · 프리미엄 품질. 장당 비용이 상대적으로 높음.', true, 20),
      ('google', 'Imagen 3.0 Fast', 'imagen-3.0-fast-generate-001', 'Imagen 3.0 Fast', 'imagen-3.0-fast-generate-001', 'image', 'Imagen Fast · 저지연·대량 생성', '저렴', '추천: 썸네일·아이콘·빠른 시안. 장당 비용 저렴 · 반복 시안에 적합.', true, 30),
      ('google', 'Veo 2.0', 'veo-2.0-generate-001', 'Veo 2.0', 'veo-2.0-generate-001', 'video', 'Google Veo 2 · 시네마틱 장면 생성', '높음', '추천: 홍보 영상 기획 · 5~8초 시네마틱 클립 · Google AI Studio 연동.', true, 10),
      ('openai', 'Sora (기획·안내)', 'sora-planning', 'Sora (기획·안내)', 'sora-planning', 'video', 'OpenAI Sora · 스토리보드·기획 안내', '보통', '추천: 스토리보드·3컷 구성 · REST 직접 생성 전 기획·라우팅 가이드.', true, 20),
      ('google', 'Veo 2.0 Fast', 'veo-2.0-fast-generate-001', 'Veo 2.0 Fast', 'veo-2.0-fast-generate-001', 'video', 'Veo Fast · 짧은 클립·저지연', '보통', '추천: SNS 숏폼 · 빠른 프리뷰 · 비용 대비 속도형.', true, 30)
    ) AS v(provider, model_name, model_id, display_name, api_id, model_type, hint, cost_info, description, is_active, sort_order)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.ai_models m WHERE m.api_id = v.api_id
    );

    UPDATE public.ai_models AS m
    SET
      provider = v.provider,
      model_name = v.model_name,
      model_id = v.model_id,
      display_name = v.display_name,
      model_type = v.model_type,
      hint = v.hint,
      cost_info = v.cost_info,
      description = v.description,
      is_active = v.is_active,
      sort_order = v.sort_order,
      updated_at = now()
    FROM (VALUES
      ('google', 'Imagen 3.0 Pro', 'imagen-3.0-generate-002', 'Imagen 3.0 Pro', 'imagen-3.0-generate-002', 'image', 'Google Imagen 3 · 고품질 일러스트·포스터', '보통', '추천: 홍보물 일러스트 · 현장 안전 포스터 · 16:9 배너. Google Gemini 생태계 기본 이미지 엔진.', true, 10),
      ('openai', 'DALL·E 3', 'dall-e-3', 'DALL·E 3', 'dall-e-3', 'image', 'OpenAI DALL·E 3 · 사실적·창의적 합성', '높음', '추천: 마케팅 비주얼 · 제품 목업 · 프리미엄 품질. 장당 비용이 상대적으로 높음.', true, 20),
      ('google', 'Imagen 3.0 Fast', 'imagen-3.0-fast-generate-001', 'Imagen 3.0 Fast', 'imagen-3.0-fast-generate-001', 'image', 'Imagen Fast · 저지연·대량 생성', '저렴', '추천: 썸네일·아이콘·빠른 시안. 장당 비용 저렴 · 반복 시안에 적합.', true, 30),
      ('google', 'Veo 2.0', 'veo-2.0-generate-001', 'Veo 2.0', 'veo-2.0-generate-001', 'video', 'Google Veo 2 · 시네마틱 장면 생성', '높음', '추천: 홍보 영상 기획 · 5~8초 시네마틱 클립 · Google AI Studio 연동.', true, 10),
      ('openai', 'Sora (기획·안내)', 'sora-planning', 'Sora (기획·안내)', 'sora-planning', 'video', 'OpenAI Sora · 스토리보드·기획 안내', '보통', '추천: 스토리보드·3컷 구성 · REST 직접 생성 전 기획·라우팅 가이드.', true, 20),
      ('google', 'Veo 2.0 Fast', 'veo-2.0-fast-generate-001', 'Veo 2.0 Fast', 'veo-2.0-fast-generate-001', 'video', 'Veo Fast · 짧은 클립·저지연', '보통', '추천: SNS 숏폼 · 빠른 프리뷰 · 비용 대비 속도형.', true, 30)
    ) AS v(provider, model_name, model_id, display_name, api_id, model_type, hint, cost_info, description, is_active, sort_order)
    WHERE m.api_id = v.api_id;
  ELSE
    INSERT INTO public.ai_models (
      provider,
      display_name,
      api_id,
      model_type,
      hint,
      cost_info,
      description,
      is_active,
      sort_order
    )
    VALUES
      ('google', 'Imagen 3.0 Pro', 'imagen-3.0-generate-002', 'image', 'Google Imagen 3 · 고품질 일러스트·포스터', '보통', '추천: 홍보물 일러스트 · 현장 안전 포스터 · 16:9 배너. Google Gemini 생태계 기본 이미지 엔진.', true, 10),
      ('openai', 'DALL·E 3', 'dall-e-3', 'image', 'OpenAI DALL·E 3 · 사실적·창의적 합성', '높음', '추천: 마케팅 비주얼 · 제품 목업 · 프리미엄 품질. 장당 비용이 상대적으로 높음.', true, 20),
      ('google', 'Imagen 3.0 Fast', 'imagen-3.0-fast-generate-001', 'image', 'Imagen Fast · 저지연·대량 생성', '저렴', '추천: 썸네일·아이콘·빠른 시안. 장당 비용 저렴 · 반복 시안에 적합.', true, 30),
      ('google', 'Veo 2.0', 'veo-2.0-generate-001', 'video', 'Google Veo 2 · 시네마틱 장면 생성', '높음', '추천: 홍보 영상 기획 · 5~8초 시네마틱 클립 · Google AI Studio 연동.', true, 10),
      ('openai', 'Sora (기획·안내)', 'sora-planning', 'video', 'OpenAI Sora · 스토리보드·기획 안내', '보통', '추천: 스토리보드·3컷 구성 · REST 직접 생성 전 기획·라우팅 가이드.', true, 20),
      ('google', 'Veo 2.0 Fast', 'veo-2.0-fast-generate-001', 'video', 'Veo Fast · 짧은 클립·저지연', '보통', '추천: SNS 숏폼 · 빠른 프리뷰 · 비용 대비 속도형.', true, 30)
    ON CONFLICT (api_id) DO UPDATE SET
      provider = EXCLUDED.provider,
      display_name = EXCLUDED.display_name,
      model_type = EXCLUDED.model_type,
      hint = EXCLUDED.hint,
      cost_info = EXCLUDED.cost_info,
      description = EXCLUDED.description,
      is_active = EXCLUDED.is_active,
      sort_order = EXCLUDED.sort_order,
      updated_at = now();
  END IF;
END $$;
