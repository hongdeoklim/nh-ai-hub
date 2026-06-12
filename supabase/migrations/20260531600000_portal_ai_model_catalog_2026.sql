-- -----------------------------------------------------------------------------
-- 2026 포털 AI 모델 카탈로그 — 5개 텍스트 모델만 활성, 레거시 비활성화
-- -----------------------------------------------------------------------------

-- 카탈로그 외 텍스트 모델 비활성화
UPDATE public.ai_models
SET is_active = false,
    updated_at = now()
WHERE model_type = 'text'
  AND api_id NOT IN (
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'claude-3.5-sonnet',
    'gpt-4o',
    'gpt-4o-mini'
  );

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
      is_active,
      sort_order
    )
    VALUES
      (
        'google',
        'Gemini 2.5 Flash (초가성비)',
        'gemini-2.5-flash',
        'Gemini 2.5 Flash (초가성비)',
        'gemini-2.5-flash',
        'text',
        '⚡ 실시간 구글 검색 및 해외 지도·상호 검색 최적화. 대량의 사내 문서(RAG) 초고속 요약에 적합하며 비용이 매우 저렴해 상시 업무용으로 가장 추천합니다.',
        true,
        10
      ),
      (
        'google',
        'Gemini 2.5 Pro (전문 분석)',
        'gemini-2.5-pro',
        'Gemini 2.5 Pro (전문 분석)',
        'gemini-2.5-pro',
        'text',
        '🔍 구글 맵 기반의 정밀 지리/좌표 분석 및 대규모 복합 문서 심층 비교 분석용. 고성능과 비용의 균형이 우수한 전문 연구 모델입니다.',
        true,
        20
      ),
      (
        'anthropic',
        'Claude 3.5 Sonnet (최고 성능)',
        'claude-3.5-sonnet',
        'Claude 3.5 Sonnet (최고 성능)',
        'claude-3.5-sonnet',
        'text',
        '🏆 Exa 연동 국내 실시간 뉴스 심층 분석 및 국내 도로명 주소·상호 매핑 원탑. 수석 개발자급 코딩 및 계약서 독소조항 검토에 특화되어 있으나, 프리미엄 비용이 발생하므로 필요한 고난도 작업에만 추천합니다.',
        true,
        30
      ),
      (
        'openai',
        'GPT-4o (범용 마스터)',
        'gpt-4o',
        'GPT-4o (범용 마스터)',
        'gpt-4o',
        'text',
        '📊 Exa 연동 국내 실시간 정보 수집 및 보고서 작성을 위한 정형 표(Table) 데이터 가공 원탑. 다국어 번역 및 범용 비즈니스 기획에 추천합니다.',
        true,
        40
      ),
      (
        'openai',
        'GPT-4o-mini (단순 요약)',
        'gpt-4o-mini',
        'GPT-4o-mini (단순 요약)',
        'gpt-4o-mini',
        'text',
        '📝 간단한 이메일 회신 초안 작성 및 단문 맞춤법 교정용. 가장 비용이 안 드는 초저가 일상 비서 모델입니다.',
        true,
        50
      )
    ON CONFLICT (api_id) DO UPDATE SET
      provider = EXCLUDED.provider,
      model_name = EXCLUDED.model_name,
      model_id = EXCLUDED.model_id,
      display_name = EXCLUDED.display_name,
      model_type = EXCLUDED.model_type,
      hint = EXCLUDED.hint,
      is_active = EXCLUDED.is_active,
      sort_order = EXCLUDED.sort_order,
      updated_at = now();
  ELSE
    INSERT INTO public.ai_models (provider, display_name, api_id, model_type, hint, is_active, sort_order)
    VALUES
      (
        'google',
        'Gemini 2.5 Flash (초가성비)',
        'gemini-2.5-flash',
        'text',
        '⚡ 실시간 구글 검색 및 해외 지도·상호 검색 최적화. 대량의 사내 문서(RAG) 초고속 요약에 적합하며 비용이 매우 저렴해 상시 업무용으로 가장 추천합니다.',
        true,
        10
      ),
      (
        'google',
        'Gemini 2.5 Pro (전문 분석)',
        'gemini-2.5-pro',
        'text',
        '🔍 구글 맵 기반의 정밀 지리/좌표 분석 및 대규모 복합 문서 심층 비교 분석용. 고성능과 비용의 균형이 우수한 전문 연구 모델입니다.',
        true,
        20
      ),
      (
        'anthropic',
        'Claude 3.5 Sonnet (최고 성능)',
        'claude-3.5-sonnet',
        'text',
        '🏆 Exa 연동 국내 실시간 뉴스 심층 분석 및 국내 도로명 주소·상호 매핑 원탑. 수석 개발자급 코딩 및 계약서 독소조항 검토에 특화되어 있으나, 프리미엄 비용이 발생하므로 필요한 고난도 작업에만 추천합니다.',
        true,
        30
      ),
      (
        'openai',
        'GPT-4o (범용 마스터)',
        'gpt-4o',
        'text',
        '📊 Exa 연동 국내 실시간 정보 수집 및 보고서 작성을 위한 정형 표(Table) 데이터 가공 원탑. 다국어 번역 및 범용 비즈니스 기획에 추천합니다.',
        true,
        40
      ),
      (
        'openai',
        'GPT-4o-mini (단순 요약)',
        'gpt-4o-mini',
        'text',
        '📝 간단한 이메일 회신 초안 작성 및 단문 맞춤법 교정용. 가장 비용이 안 드는 초저가 일상 비서 모델입니다.',
        true,
        50
      )
    ON CONFLICT (api_id) DO UPDATE SET
      provider = EXCLUDED.provider,
      display_name = EXCLUDED.display_name,
      model_type = EXCLUDED.model_type,
      hint = EXCLUDED.hint,
      is_active = EXCLUDED.is_active,
      sort_order = EXCLUDED.sort_order,
      updated_at = now();
  END IF;
END $$;

-- 카탈로그 모델 메타데이터 최종 동기화
UPDATE public.ai_models AS m
SET
  display_name = v.display_name,
  hint = v.hint,
  is_active = true,
  sort_order = v.sort_order,
  updated_at = now()
FROM (
  VALUES
    ('gemini-2.5-flash', 'Gemini 2.5 Flash (초가성비)', '⚡ 실시간 구글 검색 및 해외 지도·상호 검색 최적화. 대량의 사내 문서(RAG) 초고속 요약에 적합하며 비용이 매우 저렴해 상시 업무용으로 가장 추천합니다.', 10),
    ('gemini-2.5-pro', 'Gemini 2.5 Pro (전문 분석)', '🔍 구글 맵 기반의 정밀 지리/좌표 분석 및 대규모 복합 문서 심층 비교 분석용. 고성능과 비용의 균형이 우수한 전문 연구 모델입니다.', 20),
    ('claude-3.5-sonnet', 'Claude 3.5 Sonnet (최고 성능)', '🏆 Exa 연동 국내 실시간 뉴스 심층 분석 및 국내 도로명 주소·상호 매핑 원탑. 수석 개발자급 코딩 및 계약서 독소조항 검토에 특화되어 있으나, 프리미엄 비용이 발생하므로 필요한 고난도 작업에만 추천합니다.', 30),
    ('gpt-4o', 'GPT-4o (범용 마스터)', '📊 Exa 연동 국내 실시간 정보 수집 및 보고서 작성을 위한 정형 표(Table) 데이터 가공 원탑. 다국어 번역 및 범용 비즈니스 기획에 추천합니다.', 40),
    ('gpt-4o-mini', 'GPT-4o-mini (단순 요약)', '📝 간단한 이메일 회신 초안 작성 및 단문 맞춤법 교정용. 가장 비용이 안 드는 초저가 일상 비서 모델입니다.', 50)
) AS v(api_id, display_name, hint, sort_order)
WHERE m.api_id = v.api_id;

-- 레거시 model_name / model_id 동기화 (컬럼 존재 시)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_models' AND column_name = 'model_name'
  ) THEN
    UPDATE public.ai_models
    SET model_name = display_name
    WHERE api_id IN (
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'claude-3.5-sonnet',
      'gpt-4o',
      'gpt-4o-mini'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_models' AND column_name = 'model_id'
  ) THEN
    UPDATE public.ai_models
    SET model_id = api_id
    WHERE api_id IN (
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'claude-3.5-sonnet',
      'gpt-4o',
      'gpt-4o-mini'
    );
  END IF;
END $$;
