-- -----------------------------------------------------------------------------
-- [31단계] 부서별 API 예산 가드레일 — department_budgets
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.department_budgets (
  target_department text PRIMARY KEY,
  monthly_limit_usd numeric NOT NULL DEFAULT 50.00,
  current_usage_usd numeric NOT NULL DEFAULT 0.00,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.department_budgets IS
  '부서별 월간 AI API 예산(USD). Edge check_and_deduct_budget RPC로 선차감.';

ALTER TABLE public.department_budgets
  DROP CONSTRAINT IF EXISTS department_budgets_target_department_check;

ALTER TABLE public.department_budgets
  ADD CONSTRAINT department_budgets_target_department_check CHECK (
    target_department IN (
      '공통',
      '교류사업부',
      '국내여행사업부',
      '교류마케팅사업단',
      '미디어교육부',
      '준법지원단',
      '전문건설부',
      '자산개발부',
      '품질지원부',
      '시설마케팅부',
      '공사관리부',
      '안전보건지원실',
      '경영지원부',
      '경영전략부',
      '공무지원부',
      '서울인천지사',
      '경기남부지사',
      '경기북부지사',
      '충북지사',
      '대전충남세종지사',
      '전북지사',
      '광주전남지사',
      '대구경북지사',
      '경남지사',
      '부산울산지사',
      '제주지사'
    )
  );

INSERT INTO public.department_budgets (target_department, monthly_limit_usd, current_usage_usd)
VALUES
  ('공통', 50.00, 0.00),
  ('교류사업부', 50.00, 0.00),
  ('국내여행사업부', 50.00, 0.00),
  ('교류마케팅사업단', 50.00, 0.00),
  ('미디어교육부', 50.00, 0.00),
  ('준법지원단', 50.00, 0.00),
  ('전문건설부', 50.00, 0.00),
  ('자산개발부', 50.00, 0.00),
  ('품질지원부', 50.00, 0.00),
  ('시설마케팅부', 50.00, 0.00),
  ('공사관리부', 50.00, 0.00),
  ('안전보건지원실', 50.00, 0.00),
  ('경영지원부', 50.00, 0.00),
  ('경영전략부', 50.00, 0.00),
  ('공무지원부', 50.00, 0.00),
  ('서울인천지사', 50.00, 0.00),
  ('경기남부지사', 50.00, 0.00),
  ('경기북부지사', 50.00, 0.00),
  ('충북지사', 50.00, 0.00),
  ('대전충남세종지사', 50.00, 0.00),
  ('전북지사', 50.00, 0.00),
  ('광주전남지사', 50.00, 0.00),
  ('대구경북지사', 50.00, 0.00),
  ('경남지사', 50.00, 0.00),
  ('부산울산지사', 50.00, 0.00),
  ('제주지사', 50.00, 0.00)
ON CONFLICT (target_department) DO NOTHING;

-- -----------------------------------------------------------------------------
-- RPC: 원자적 예산 확인·차감
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_and_deduct_budget(
  p_department text,
  p_cost numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dept text;
  v_updated text;
BEGIN
  IF p_cost IS NULL OR p_cost < 0 THEN
    RAISE EXCEPTION 'p_cost must be >= 0';
  END IF;

  v_dept := nullif(trim(p_department), '');
  IF v_dept IS NULL THEN
    v_dept := '공통';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.department_budgets WHERE target_department = v_dept
  ) THEN
    v_dept := '공통';
  END IF;

  UPDATE public.department_budgets
  SET
    current_usage_usd = current_usage_usd + p_cost,
    updated_at = now()
  WHERE target_department = v_dept
    AND current_usage_usd + p_cost <= monthly_limit_usd
  RETURNING target_department INTO v_updated;

  IF v_updated IS NOT NULL THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.check_and_deduct_budget(text, numeric) IS
  '부서 월 예산 선차감. 한도 초과 시 false. SECURITY DEFINER — Edge service_role 호출.';

GRANT EXECUTE ON FUNCTION public.check_and_deduct_budget(text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_and_deduct_budget(text, numeric) TO authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.department_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS department_budgets_select_admin ON public.department_budgets;
CREATE POLICY department_budgets_select_admin
  ON public.department_budgets
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_admin());

DROP POLICY IF EXISTS department_budgets_select_own_dept ON public.department_budgets;
CREATE POLICY department_budgets_select_own_dept
  ON public.department_budgets
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_department() IS NOT NULL
    AND target_department = public.current_user_department()
  );
