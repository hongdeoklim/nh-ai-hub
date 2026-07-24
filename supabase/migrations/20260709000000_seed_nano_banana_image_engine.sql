-- -----------------------------------------------------------------------------
-- ai_models: Gemini 2.5 Flash Image("나노바나나")를 기본 이미지 엔진으로 추가
-- (Imagen 3.0 Pro보다 낮은 sort_order로 등록해 미디어 라우터 기본 선택값이 되게 함)
-- -----------------------------------------------------------------------------

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
VALUES (
  'google',
  'Nano Banana (2.5 Flash Image)',
  'gemini-2.5-flash-image',
  'Nano Banana (2.5 Flash Image)',
  'gemini-2.5-flash-image',
  'image',
  'Google 네이티브 이미지 생성 · 기본 엔진(저비용)',
  '저렴',
  '추천: 빠른 이미지 시안·포스터·일러스트. Imagen 3보다 저렴 — AI Designer 기본 엔진.',
  true,
  5
)
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
