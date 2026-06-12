-- -----------------------------------------------------------------------------
-- ai_models 비용 등급(cost_info) · 상세 업무 가이드(description)
-- -----------------------------------------------------------------------------

ALTER TABLE public.ai_models
  ADD COLUMN IF NOT EXISTS cost_info text,
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN public.ai_models.cost_info IS
  '비용 등급 배지(예: 저렴, 보통, 높음). 채팅 모델 드롭다운에 표시.';

COMMENT ON COLUMN public.ai_models.description IS
  '상세 업무 가이드. 드롭다운 호버·관리자 테이블에 표시.';

-- hint 키워드로 cost_info 추정
UPDATE public.ai_models
SET cost_info = CASE
  WHEN hint ILIKE '%초가성비%'
    OR hint ILIKE '%저렴%'
    OR hint ILIKE '%저비용%'
    OR hint ILIKE '%초저%'
    OR hint ILIKE '%최저비용%'
    OR hint ILIKE '%최저지연%'
    OR hint ILIKE '%경량%'
    OR hint ILIKE '%nano%'
    OR hint ILIKE '%mini%'
    OR hint ILIKE '%haiku%'
    OR hint ILIKE '%flash-lite%'
    OR hint ILIKE '%flash‑lite%'
    OR api_id ILIKE '%-mini'
    OR api_id ILIKE '%-nano'
    OR api_id ILIKE '%haiku%'
    OR api_id ILIKE '%flash-lite%'
    THEN '저렴'
  WHEN hint ILIKE '%프리미엄%'
    OR hint ILIKE '%최상급%'
    OR hint ILIKE '%플래그십%'
    OR hint ILIKE '%프론티어%'
    OR hint ILIKE '%opus%'
    OR api_id ILIKE '%opus%'
    OR display_name ILIKE '%opus%'
    THEN '높음'
  WHEN hint ILIKE '%균형%'
    OR hint ILIKE '%비용 대비%'
    OR hint ILIKE '%전문%'
    THEN '보통'
  ELSE '보통'
END
WHERE cost_info IS NULL OR char_length(trim(cost_info)) = 0;

UPDATE public.ai_models
SET cost_info = '보통'
WHERE cost_info IS NULL OR char_length(trim(cost_info)) = 0;

-- description ← hint (기존 한 줄 안내를 상세 가이드로 승격)
UPDATE public.ai_models
SET description = hint
WHERE (description IS NULL OR char_length(trim(description)) = 0)
  AND hint IS NOT NULL
  AND char_length(trim(hint)) > 0;
