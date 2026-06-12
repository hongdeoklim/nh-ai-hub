-- =============================================================================
-- NH AI Inside Hub — 초기 데이터베이스 스키마
-- Supabase (PostgreSQL) / public 스키마
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) 직원 프로필: auth.users 와 1:1 로 연결되는 애플리케이션 사용자 행
-- -----------------------------------------------------------------------------
CREATE TABLE public.users (
  id uuid NOT NULL,
  email text NOT NULL,
  department text NULL,
  role text NULL,
  preferred_ai text NULL,
  token_limit bigint NOT NULL DEFAULT 1000000,
  current_token_usage bigint NOT NULL DEFAULT 0,

  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT users_email_check CHECK (char_length(trim(email)) > 0),
  CONSTRAINT users_token_limit_check CHECK (token_limit >= 0),
  CONSTRAINT users_current_token_usage_check CHECK (current_token_usage >= 0)
);

COMMENT ON TABLE public.users IS '사내 포털 직원 프로필. Supabase Auth 사용자(auth.users)와 동일한 PK로 연결.';
COMMENT ON COLUMN public.users.id IS 'auth.users.id 와 동일한 사용자 식별자(FK).';
COMMENT ON COLUMN public.users.email IS '로그인 계정 이메일(프로필 조회·표시용 캐시). auth.users.email 과 동기화 권장.';
COMMENT ON COLUMN public.users.department IS '소속 부서.';
COMMENT ON COLUMN public.users.role IS '직무 또는 시스템 권한 역할.';
COMMENT ON COLUMN public.users.preferred_ai IS '선호하는 기본 AI 모델 식별자(예: gpt-4o-mini, gemini-2.5-flash).';
COMMENT ON COLUMN public.users.token_limit IS '월간 허용 토큰 상한(비즈니스 규칙에 따라 해석).';
COMMENT ON COLUMN public.users.current_token_usage IS '현재 집계된 토큰 사용량(월간 리셋은 애플리케이션/배치에서 처리).';

CREATE INDEX users_department_idx ON public.users (department);
CREATE INDEX users_role_idx ON public.users (role);

-- -----------------------------------------------------------------------------
-- 2) 신규 가입 시 public.users 자동 생성 (auth.users INSERT 후 실행)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    department,
    role,
    preferred_ai,
    token_limit,
    current_token_usage
  )
  VALUES (
    NEW.id,
    NEW.email,
    NULL,
    NULL,
    NULL,
    1000000,
    0
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS 'auth.users 행 생성 직후 대응되는 public.users 프로필 행을 삽입합니다.';

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 3) 토큰 사용·비용 로그 (감사·비용 추적)
-- -----------------------------------------------------------------------------
CREATE TABLE public.token_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ai_model text NOT NULL,
  prompt_tokens integer NOT NULL,
  completion_tokens integer NOT NULL,
  total_cost numeric(18, 8) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT token_logs_pkey PRIMARY KEY (id),
  CONSTRAINT token_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE,
  CONSTRAINT token_logs_ai_model_check CHECK (char_length(trim(ai_model)) > 0),
  CONSTRAINT token_logs_prompt_tokens_check CHECK (prompt_tokens >= 0),
  CONSTRAINT token_logs_completion_tokens_check CHECK (completion_tokens >= 0),
  CONSTRAINT token_logs_total_cost_check CHECK (total_cost >= 0)
);

COMMENT ON TABLE public.token_logs IS 'AI 호출별 입력·출력 토큰 및 환산 비용 기록.';
COMMENT ON COLUMN public.token_logs.ai_model IS '실제로 과금·호출에 사용된 모델명 또는 내부 라우팅 식별자.';
COMMENT ON COLUMN public.token_logs.prompt_tokens IS '프롬프트(입력) 토큰 수.';
COMMENT ON COLUMN public.token_logs.completion_tokens IS '생성(출력) 토큰 수.';
COMMENT ON COLUMN public.token_logs.total_cost IS '내부 환산 단위의 추정 비용(통화 단위는 애플리케이션 규약에 따름).';

CREATE INDEX token_logs_user_id_created_at_idx ON public.token_logs (user_id, created_at DESC);
CREATE INDEX token_logs_ai_model_idx ON public.token_logs (ai_model);

-- -----------------------------------------------------------------------------
-- 4) 저장된 프롬프트 템플릿 (개인·부서 공유 등 확장 가능)
-- -----------------------------------------------------------------------------
CREATE TABLE public.saved_prompts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT saved_prompts_pkey PRIMARY KEY (id),
  CONSTRAINT saved_prompts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE,
  CONSTRAINT saved_prompts_title_check CHECK (char_length(trim(title)) > 0),
  CONSTRAINT saved_prompts_content_check CHECK (char_length(trim(content)) > 0)
);

COMMENT ON TABLE public.saved_prompts IS '자주 쓰는 프롬프트 템플릿. is_public 으로 사내 공유 여부를 표시.';
COMMENT ON COLUMN public.saved_prompts.is_public IS 'true 이면 동료 조회·재사용 가능(정책은 RLS 로 보완).';

CREATE INDEX saved_prompts_user_id_created_at_idx ON public.saved_prompts (user_id, created_at DESC);
CREATE INDEX saved_prompts_is_public_created_at_idx ON public.saved_prompts (is_public, created_at DESC)
  WHERE is_public = true;

-- -----------------------------------------------------------------------------
-- 5) Row Level Security (Supabase 클라이언트 접근 기본 보안)
-- -----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_prompts ENABLE ROW LEVEL SECURITY;

-- public.users: 본인 행만 조회·수정 (삽입은 트리거 전용)
CREATE POLICY users_select_own
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY users_update_own
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- public.token_logs: 본인 로그만 조회·삽입
CREATE POLICY token_logs_select_own
  ON public.token_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY token_logs_insert_own
  ON public.token_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- public.saved_prompts: 본인 템플릿 전체 접근 + 공개 템플릿은 누구나 조회
CREATE POLICY saved_prompts_select_own_or_public
  ON public.saved_prompts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY saved_prompts_insert_own
  ON public.saved_prompts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY saved_prompts_update_own
  ON public.saved_prompts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY saved_prompts_delete_own
  ON public.saved_prompts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
