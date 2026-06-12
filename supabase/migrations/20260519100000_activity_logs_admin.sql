-- -----------------------------------------------------------------------------
-- [19단계] activity_logs · role 정규화 · 관리자 활동 RPC · prompt_templates Realtime
-- teams / team_members 는 20260518223000 마이그레이션에 이미 존재합니다.
-- Supabase SQL Editor 에서 이 파일 전체를 실행하거나 `npm run db:push` 로 적용하세요.
-- -----------------------------------------------------------------------------

-- 선행: users.is_admin + current_user_is_admin() (20260518280000 미적용 DB 호환)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

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

GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;

-- -----------------------------------------------------------------------------
-- 1) users.role 재검증: 소문자 admin | user 만 허용
-- -----------------------------------------------------------------------------
UPDATE public.users
SET role = CASE
  WHEN lower(trim(coalesce(role, ''))) = 'admin' THEN 'admin'
  ELSE 'user'
END;

UPDATE public.users
SET is_admin = (role = 'admin');

ALTER TABLE public.users
  ALTER COLUMN role SET DEFAULT 'user';

ALTER TABLE public.users
  ALTER COLUMN role SET NOT NULL;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user'));

COMMENT ON COLUMN public.users.role IS
  '시스템 권한: admin(관리자) 또는 user(일반). is_admin 플래그와 동기화됩니다.';

-- 신규 가입 시 role 기본값 user
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
    'user',
    NULL,
    1000000,
    0
  );

  RETURN NEW;
END;
$$;

-- role 변경 시 is_admin 자동 동기화
CREATE OR REPLACE FUNCTION public.users_sync_is_admin_from_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.role := lower(trim(coalesce(NEW.role, 'user')));
  IF NEW.role NOT IN ('admin', 'user') THEN
    NEW.role := 'user';
  END IF;
  NEW.is_admin := (NEW.role = 'admin');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_sync_is_admin_from_role ON public.users;
CREATE TRIGGER users_sync_is_admin_from_role
  BEFORE INSERT OR UPDATE OF role ON public.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.users_sync_is_admin_from_role();

-- -----------------------------------------------------------------------------
-- 2) activity_logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action_type text NOT NULL,
  description text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT activity_logs_pkey PRIMARY KEY (id),
  CONSTRAINT activity_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE,
  CONSTRAINT activity_logs_action_type_check CHECK (char_length(trim(action_type)) > 0)
);

COMMENT ON TABLE public.activity_logs IS
  '관리자·운영 콘솔 CRUD 및 주요 변경 이력.';

CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx
  ON public.activity_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS activity_logs_user_id_created_at_idx
  ON public.activity_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS activity_logs_action_type_idx
  ON public.activity_logs (action_type);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_logs_select_admin
  ON public.activity_logs
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_admin());

-- -----------------------------------------------------------------------------
-- 3) log_admin_activity RPC (프론트·Edge 공용)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_admin_activity(
  p_action_type text,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_action text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_action := lower(trim(coalesce(p_action_type, '')));
  IF char_length(v_action) = 0 THEN
    RAISE EXCEPTION 'action_type_required';
  END IF;

  INSERT INTO public.activity_logs (user_id, action_type, description)
  VALUES (auth.uid(), v_action, nullif(trim(coalesce(p_description, '')), ''))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_admin_activity(text, text) IS
  '관리자 세션에서 activity_logs 행을 기록합니다.';

GRANT EXECUTE ON FUNCTION public.log_admin_activity(text, text) TO authenticated;

-- Edge Function(service_role) 전용 삽입 헬퍼
CREATE OR REPLACE FUNCTION public.log_admin_activity_for_user(
  p_actor_user_id uuid,
  p_action_type text,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_action text;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'actor_required';
  END IF;

  v_action := lower(trim(coalesce(p_action_type, '')));
  IF char_length(v_action) = 0 THEN
    RAISE EXCEPTION 'action_type_required';
  END IF;

  INSERT INTO public.activity_logs (user_id, action_type, description)
  VALUES (
    p_actor_user_id,
    v_action,
    nullif(trim(coalesce(p_description, '')), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_admin_activity_for_user(uuid, text, text) IS
  'Edge Function(service_role)에서 특정 관리자 actor 로 activity_logs 를 기록합니다.';

REVOKE ALL ON FUNCTION public.log_admin_activity_for_user(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_admin_activity_for_user(uuid, text, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 4) teams / team_members 존재 재확인 (멱등)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT teams_pkey PRIMARY KEY (id),
  CONSTRAINT teams_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users (id) ON DELETE CASCADE,
  CONSTRAINT teams_name_check CHECK (char_length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS public.team_members (
  team_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT team_members_pkey PRIMARY KEY (team_id, user_id),
  CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams (id) ON DELETE CASCADE,
  CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 5) prompt_templates Realtime (Dashboard 즉시 반영)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'prompt_templates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.prompt_templates;
  END IF;
END $$;
