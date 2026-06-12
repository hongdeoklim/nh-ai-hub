-- -----------------------------------------------------------------------------
-- 부서별 프롬프트 템플릿 (관리자 CRUD · 일반 사용자는 활성 행만 조회 후 클라이언트 필터)
-- -----------------------------------------------------------------------------
CREATE TABLE public.prompt_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  target_department text NOT NULL,
  title text NOT NULL,
  prompt_content text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT prompt_templates_pkey PRIMARY KEY (id),
  CONSTRAINT prompt_templates_title_nonempty CHECK (char_length(trim(title)) > 0),
  CONSTRAINT prompt_templates_prompt_nonempty CHECK (char_length(trim(prompt_content)) > 0),
  CONSTRAINT prompt_templates_department_check CHECK (
    target_department IN (
      '공통',
      '시설공사부',
      'IT개발부',
      '농업연수부',
      '경영지원부'
    )
  )
);

COMMENT ON TABLE public.prompt_templates IS
  '전사·부서별 채팅 프롬프트 템플릿. 활성 행만 일반 사용자 API 경로에서 노출됩니다.';

CREATE INDEX prompt_templates_active_department_idx
  ON public.prompt_templates (is_active, target_department);

CREATE OR REPLACE FUNCTION public.touch_prompt_templates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prompt_templates_set_updated_at ON public.prompt_templates;
CREATE TRIGGER prompt_templates_set_updated_at
  BEFORE UPDATE ON public.prompt_templates
  FOR EACH ROW
  EXECUTE PROCEDURE public.touch_prompt_templates_updated_at();

ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;

-- 활성 템플릿은 모든 로그인 사용자 조회 가능(부서 필터는 애플리케이션에서 적용)
CREATE POLICY prompt_templates_select_active
  ON public.prompt_templates
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- 관리자는 비활성 포함 전체 조회·변경
CREATE POLICY prompt_templates_select_admin
  ON public.prompt_templates
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_admin());

CREATE POLICY prompt_templates_insert_admin
  ON public.prompt_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY prompt_templates_update_admin
  ON public.prompt_templates
  FOR UPDATE
  TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY prompt_templates_delete_admin
  ON public.prompt_templates
  FOR DELETE
  TO authenticated
  USING (public.current_user_is_admin());

-- 기존 정적 카탈로그(ORG_TEMPLATE_ITEMS) 동등 초기 데이터
INSERT INTO public.prompt_templates (
  target_department,
  title,
  prompt_content,
  is_active
)
VALUES
  (
    '시설공사부',
    '공사현장 균열 분석',
    '[템플릿] 공사현장 균열 분석' || E'\n\n' || '아래 업무에 맞게 초안을 작성해 줘.',
    true
  ),
  (
    '시설공사부',
    '시방서 요약',
    '[템플릿] 시방서 요약' || E'\n\n' || '아래 업무에 맞게 초안을 작성해 줘.',
    true
  ),
  (
    '경영지원부',
    '견적서 검토',
    '[템플릿] 견적서 검토' || E'\n\n' || '아래 업무에 맞게 초안을 작성해 줘.',
    true
  ),
  (
    '공통',
    '안전점검 체크리스트',
    '[템플릿] 안전점검 체크리스트' || E'\n\n' || '아래 업무에 맞게 초안을 작성해 줘.',
    true
  ),
  (
    '농업연수부',
    '여행 상품 문의 응대',
    '[템플릿] 여행 상품 문의 응대' || E'\n\n' || '아래 업무에 맞게 초안을 작성해 줘.',
    true
  ),
  (
    '공통',
    '행정 공문 초안',
    '[템플릿] 행정 공문 초안' || E'\n\n' || '아래 업무에 맞게 초안을 작성해 줘.',
    true
  );
