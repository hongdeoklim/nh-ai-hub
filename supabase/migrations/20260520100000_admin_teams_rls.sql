-- -----------------------------------------------------------------------------
-- [20단계] 관리자 팀/조직 관리 RLS + 멤버 디렉터리 RPC
-- Supabase SQL Editor 단독 실행 시: 아래 선행 블록이 current_user_is_admin() 을 보장합니다.
-- -----------------------------------------------------------------------------

-- 선행: users.is_admin + current_user_is_admin() (20260518280000 미적용 DB 호환)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_admin IS
  'true 이면 관리자 포털·토큰 요청 등 내부 관리 화면 접근.';

UPDATE public.users SET is_admin = false WHERE is_admin IS NULL;

UPDATE public.users
SET is_admin = true
WHERE lower(trim(coalesce(role, ''))) = 'admin';

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

-- teams: 관리자 전체 조회·생성·수정·삭제
DROP POLICY IF EXISTS teams_select_admin ON public.teams;
CREATE POLICY teams_select_admin
  ON public.teams
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_admin());

DROP POLICY IF EXISTS teams_insert_admin ON public.teams;
CREATE POLICY teams_insert_admin
  ON public.teams
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_is_admin()
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS teams_update_admin ON public.teams;
CREATE POLICY teams_update_admin
  ON public.teams
  FOR UPDATE
  TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

DROP POLICY IF EXISTS teams_delete_admin ON public.teams;
CREATE POLICY teams_delete_admin
  ON public.teams
  FOR DELETE
  TO authenticated
  USING (public.current_user_is_admin());

-- team_members: 관리자 전체 조회·추가·삭제
DROP POLICY IF EXISTS team_members_select_admin ON public.team_members;
CREATE POLICY team_members_select_admin
  ON public.team_members
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_admin());

DROP POLICY IF EXISTS team_members_insert_admin ON public.team_members;
CREATE POLICY team_members_insert_admin
  ON public.team_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_is_admin());

DROP POLICY IF EXISTS team_members_delete_admin ON public.team_members;
CREATE POLICY team_members_delete_admin
  ON public.team_members
  FOR DELETE
  TO authenticated
  USING (public.current_user_is_admin());

-- 관리자: 팀원 디렉터리 (users 조인, admin 전용)
CREATE OR REPLACE FUNCTION public.admin_team_members_directory(p_team_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  department text,
  role text,
  joined_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.email,
    u.display_name,
    u.department,
    tm.role,
    tm.joined_at
  FROM public.team_members tm
  JOIN public.users u ON u.id = tm.user_id
  WHERE tm.team_id = p_team_id
    AND public.current_user_is_admin()
  ORDER BY tm.joined_at ASC;
$$;

COMMENT ON FUNCTION public.admin_team_members_directory(uuid) IS
  '관리자 전용: 팀 소속 직원 디렉터리.';

REVOKE ALL ON FUNCTION public.admin_team_members_directory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_team_members_directory(uuid) TO authenticated;
