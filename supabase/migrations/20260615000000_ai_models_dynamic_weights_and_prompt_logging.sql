-- 1. ai_models 테이블에 가중치(비용 비중) 컬럼 추가
ALTER TABLE public.ai_models
ADD COLUMN IF NOT EXISTS prompt_weight numeric(10,2) NOT NULL DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS completion_weight numeric(10,2) NOT NULL DEFAULT 1.0;

-- 기존 모델들에 대한 기본 가중치 적용 (예시)
UPDATE public.ai_models SET prompt_weight = 10.0, completion_weight = 10.0 WHERE api_id LIKE 'gpt-4%';
UPDATE public.ai_models SET prompt_weight = 10.0, completion_weight = 10.0 WHERE api_id LIKE 'claude-3-opus%';
UPDATE public.ai_models SET prompt_weight = 5.0, completion_weight = 5.0 WHERE api_id = 'dify-ax';
UPDATE public.ai_models SET prompt_weight = 1.0, completion_weight = 1.0 WHERE prompt_weight IS NULL;

-- 2. token_logs 테이블에 질문 수집을 위한 컬럼 추가
ALTER TABLE public.token_logs
ADD COLUMN IF NOT EXISTS prompt_text text;

COMMENT ON COLUMN public.token_logs.prompt_text IS '비용 감사 및 정밀 분석을 위해 질문(Prompt) 내용 일부 또는 전체를 저장';

-- 3. (옵션) 관리자 대시보드 통계용 뷰 추가
CREATE OR REPLACE VIEW public.vw_admin_token_usage AS
SELECT 
  u.department,
  u.team,
  u.email,
  u.full_name,
  t.ai_model,
  t.prompt_text,
  t.prompt_tokens,
  t.completion_tokens,
  t.total_cost,
  t.created_at
FROM public.token_logs t
JOIN public.users u ON t.user_id = u.id;
