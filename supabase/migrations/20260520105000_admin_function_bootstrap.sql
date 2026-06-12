-- -----------------------------------------------------------------------------
-- 긴급 패치: current_user_is_admin() 없을 때 SQL Editor 단독 실행용
-- 팀 RLS / activity_logs 마이그레이션 실패 시 이 파일만 먼저 실행한 뒤 재시도하세요.
-- -----------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

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
