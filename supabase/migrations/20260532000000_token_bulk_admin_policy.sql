-- -----------------------------------------------------------------------------
-- 관리자: 토큰 일괄 부여 · 사용량 초기화 · 매월 자동 초기화 정책
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.org_token_policy (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  reset_day_of_month smallint NULL,
  last_auto_reset_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT org_token_policy_reset_day_check CHECK (
    reset_day_of_month IS NULL
    OR (reset_day_of_month >= 1 AND reset_day_of_month <= 28)
  )
);

COMMENT ON TABLE public.org_token_policy IS
  '조직 토큰 정책 싱글톤. reset_day_of_month: 매월 해당 일(KST)에 current_token_usage 자동 0 초기화.';

INSERT INTO public.org_token_policy (id, reset_day_of_month)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.org_token_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_token_policy_select_admin ON public.org_token_policy;
CREATE POLICY org_token_policy_select_admin
  ON public.org_token_policy
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_admin());

DROP POLICY IF EXISTS org_token_policy_update_admin ON public.org_token_policy;
CREATE POLICY org_token_policy_update_admin
  ON public.org_token_policy
  FOR UPDATE
  TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

GRANT SELECT, UPDATE ON public.org_token_policy TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_bulk_grant_token_limit(
  p_delta bigint,
  p_scope text DEFAULT 'selected',
  p_user_ids uuid[] DEFAULT NULL,
  p_department text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope text := lower(trim(coalesce(p_scope, 'selected')));
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_delta IS NULL OR p_delta <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'delta_must_be_positive');
  END IF;

  IF v_scope = 'all' THEN
    UPDATE public.users
    SET token_limit = token_limit + p_delta;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF v_scope = 'department' THEN
    IF p_department IS NULL OR char_length(trim(p_department)) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'department_required');
    END IF;
    UPDATE public.users
    SET token_limit = token_limit + p_delta
    WHERE trim(coalesce(department, '')) = trim(p_department);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'user_ids_required');
    END IF;
    UPDATE public.users
    SET token_limit = token_limit + p_delta
    WHERE id = ANY (p_user_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'updated_count', v_count,
    'delta', p_delta,
    'scope', v_scope
  );
END;
$$;

COMMENT ON FUNCTION public.admin_bulk_grant_token_limit IS
  '관리자 전용: 선택/전체/부서별 token_limit 일괄 증가.';

GRANT EXECUTE ON FUNCTION public.admin_bulk_grant_token_limit(bigint, text, uuid[], text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_bulk_reset_token_usage(
  p_scope text DEFAULT 'selected',
  p_user_ids uuid[] DEFAULT NULL,
  p_department text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope text := lower(trim(coalesce(p_scope, 'selected')));
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_scope = 'all' THEN
    UPDATE public.users
    SET current_token_usage = 0;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF v_scope = 'department' THEN
    IF p_department IS NULL OR char_length(trim(p_department)) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'department_required');
    END IF;
    UPDATE public.users
    SET current_token_usage = 0
    WHERE trim(coalesce(department, '')) = trim(p_department);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'user_ids_required');
    END IF;
    UPDATE public.users
    SET current_token_usage = 0
    WHERE id = ANY (p_user_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'updated_count', v_count,
    'scope', v_scope
  );
END;
$$;

COMMENT ON FUNCTION public.admin_bulk_reset_token_usage IS
  '관리자 전용: 선택/전체/부서별 current_token_usage 를 0으로 초기화.';

GRANT EXECUTE ON FUNCTION public.admin_bulk_reset_token_usage(text, uuid[], text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_token_reset_day(
  p_reset_day_of_month smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_reset_day_of_month IS NOT NULL
    AND (p_reset_day_of_month < 1 OR p_reset_day_of_month > 28) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_reset_day');
  END IF;

  INSERT INTO public.org_token_policy (id, reset_day_of_month, updated_at, updated_by)
  VALUES (1, p_reset_day_of_month, now(), auth.uid())
  ON CONFLICT (id) DO UPDATE
  SET
    reset_day_of_month = EXCLUDED.reset_day_of_month,
    updated_at = now(),
    updated_by = auth.uid();

  RETURN jsonb_build_object(
    'ok', true,
    'reset_day_of_month', p_reset_day_of_month
  );
END;
$$;

COMMENT ON FUNCTION public.admin_set_token_reset_day IS
  '관리자 전용: 매월 자동 current_token_usage 초기화 일(1~28, NULL=비활성).';

GRANT EXECUTE ON FUNCTION public.admin_set_token_reset_day(smallint)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.run_auto_token_usage_reset_if_due()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day smallint;
  v_last timestamptz;
  v_today_kst date;
  v_current_month_start timestamptz;
BEGIN
  SELECT reset_day_of_month, last_auto_reset_at
  INTO v_day, v_last
  FROM public.org_token_policy
  WHERE id = 1;

  IF v_day IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'ran', false, 'reason', 'disabled');
  END IF;

  v_today_kst := (timezone('Asia/Seoul', now()))::date;

  IF extract(day FROM v_today_kst)::integer <> v_day THEN
    RETURN jsonb_build_object('ok', true, 'ran', false, 'reason', 'not_reset_day');
  END IF;

  v_current_month_start :=
    timezone(
      'Asia/Seoul',
      make_timestamptz(
        extract(year FROM v_today_kst)::integer,
        extract(month FROM v_today_kst)::integer,
        1,
        0,
        0,
        0,
        'Asia/Seoul'
      )
    );

  IF v_last IS NOT NULL AND v_last >= v_current_month_start THEN
    RETURN jsonb_build_object('ok', true, 'ran', false, 'reason', 'already_ran_this_month');
  END IF;

  UPDATE public.users
  SET current_token_usage = 0;

  UPDATE public.org_token_policy
  SET last_auto_reset_at = now(), updated_at = now()
  WHERE id = 1;

  RETURN jsonb_build_object('ok', true, 'ran', true, 'reset_day_of_month', v_day);
END;
$$;

COMMENT ON FUNCTION public.run_auto_token_usage_reset_if_due IS
  '매월 reset_day_of_month(KST)에 current_token_usage 전원 0 초기화. pg_cron/Scheduler에서 1일 1회 호출.';

GRANT EXECUTE ON FUNCTION public.run_auto_token_usage_reset_if_due()
  TO authenticated;

-- pg_cron 예시 (Supabase Dashboard → Database → Extensions → pg_cron)
-- SELECT cron.schedule(
--   'nh-token-usage-monthly-reset',
--   '5 15 * * *',
--   $$SELECT public.run_auto_token_usage_reset_if_due();$$
-- );
