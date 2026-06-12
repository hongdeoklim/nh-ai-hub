-- -----------------------------------------------------------------------------
-- 관리자 권한 헬퍼 + 플러그인 레지스트리 + API 헬스 로그
-- role = 'admin' 또는 users.is_admin = true 인 경우 관리자로 인식합니다.
-- -----------------------------------------------------------------------------
-- 선행 마이그레이션 미적용 DB 호환: users.is_admin 이 없으면 current_user_is_admin() 생성이 실패함
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_admin IS
  'true 이면 관리자 포털·토큰 요청 등 내부 관리 화면 접근.';

UPDATE public.users SET is_admin = false WHERE is_admin IS NULL;

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND (
        COALESCE(u.is_admin, false) = true
        OR lower(trim(coalesce(u.role, ''))) = 'admin'
      )
  );
$$;

COMMENT ON FUNCTION public.current_user_is_admin() IS
  'JWT 세션 사용자가 관리자(role=admin 또는 is_admin)인지 여부.';

GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;

-- -----------------------------------------------------------------------------
CREATE TABLE public.plugins (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  endpoint_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT plugins_pkey PRIMARY KEY (id),
  CONSTRAINT plugins_name_nonempty CHECK (char_length(trim(name)) > 0),
  CONSTRAINT plugins_endpoint_nonempty CHECK (char_length(trim(endpoint_url)) > 0)
);

COMMENT ON TABLE public.plugins IS
  'AI 에이전트 동적 도구 레지스트리. is_active 인 행만 Edge에서 로드됩니다.';

CREATE INDEX plugins_is_active_idx ON public.plugins (is_active) WHERE is_active = true;

ALTER TABLE public.plugins ENABLE ROW LEVEL SECURITY;

CREATE POLICY plugins_select_admin
  ON public.plugins
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_admin());

CREATE POLICY plugins_insert_admin
  ON public.plugins
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY plugins_update_admin
  ON public.plugins
  FOR UPDATE
  TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY plugins_delete_admin
  ON public.plugins
  FOR DELETE
  TO authenticated
  USING (public.current_user_is_admin());

-- -----------------------------------------------------------------------------
CREATE TABLE public.api_health_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plugin_id uuid NULL,
  ok boolean NOT NULL DEFAULT false,
  status_code integer NULL,
  latency_ms integer NULL,
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT api_health_logs_pkey PRIMARY KEY (id),
  CONSTRAINT api_health_logs_plugin_id_fkey
    FOREIGN KEY (plugin_id) REFERENCES public.plugins (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.api_health_logs IS
  '플러그인 endpoint 호출 결과·상태 모니터링(Edge 서비스 롤로 기록).';

CREATE INDEX api_health_logs_created_at_idx
  ON public.api_health_logs (created_at DESC);

CREATE INDEX api_health_logs_plugin_id_created_at_idx
  ON public.api_health_logs (plugin_id, created_at DESC);

ALTER TABLE public.api_health_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY api_health_logs_select_admin
  ON public.api_health_logs
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_admin());

-- -----------------------------------------------------------------------------
-- 관리자: 전체 직원 프로필 조회 (토큰 관리 화면)
-- -----------------------------------------------------------------------------
CREATE POLICY users_select_admin
  ON public.users
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_admin());

-- -----------------------------------------------------------------------------
-- 관리자: 토큰 로그 집계(대시보드 차트)
-- -----------------------------------------------------------------------------
CREATE POLICY token_logs_select_admin
  ON public.token_logs
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_admin());

-- -----------------------------------------------------------------------------
-- 관리자: 스크랩북 감사 (테이블은 scrapbook 마이그레이션에서 생성 — 없으면 건너뜀)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'bookmarked_chats'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS bookmarked_chats_select_admin ON public.bookmarked_chats';
    EXECUTE $bc$
      CREATE POLICY bookmarked_chats_select_admin
      ON public.bookmarked_chats
      FOR SELECT
      TO authenticated
      USING (public.current_user_is_admin())
    $bc$;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 관리자: 자료실 레코드 수정·삭제 (테이블 없으면 건너뜀)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'knowledge_base'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS knowledge_base_update_admin ON public.knowledge_base';
    EXECUTE $kbu$
      CREATE POLICY knowledge_base_update_admin
      ON public.knowledge_base
      FOR UPDATE
      TO authenticated
      USING (public.current_user_is_admin())
      WITH CHECK (public.current_user_is_admin())
    $kbu$;
    EXECUTE 'DROP POLICY IF EXISTS knowledge_base_delete_admin ON public.knowledge_base';
    EXECUTE $kbd$
      CREATE POLICY knowledge_base_delete_admin
      ON public.knowledge_base
      FOR DELETE
      TO authenticated
      USING (public.current_user_is_admin())
    $kbd$;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 관리자: 타 사용자에게 토큰 상한 증가 (본인 자기수정 트리거와 무관)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_increment_user_token_limit(
  p_user_id uuid,
  p_delta bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_delta IS NULL OR p_delta <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'delta_must_be_positive');
  END IF;

  UPDATE public.users
  SET token_limit = token_limit + p_delta
  WHERE id = p_user_id
  RETURNING token_limit INTO v_new;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'token_limit', v_new);
END;
$$;

COMMENT ON FUNCTION public.admin_increment_user_token_limit IS
  '관리자 전용: 특정 사용자의 token_limit 을 증가시킵니다.';

GRANT EXECUTE ON FUNCTION public.admin_increment_user_token_limit(uuid, bigint)
  TO authenticated;
