-- 마이페이지용 프로필 필드 + 본인이 토큰·관리자·이메일 캐시를 바꿀 수 없도록 보호
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS display_name text NULL,
  ADD COLUMN IF NOT EXISTS job_rank text NULL,
  ADD COLUMN IF NOT EXISTS job_title text NULL,
  ADD COLUMN IF NOT EXISTS phone text NULL;

COMMENT ON COLUMN public.users.display_name IS '표시용 이름';
COMMENT ON COLUMN public.users.job_rank IS '직급(예: 과장, 차장)';
COMMENT ON COLUMN public.users.job_title IS '직책(예: 팀장, 실장)';
COMMENT ON COLUMN public.users.phone IS '연락처(내선·휴대폰 등)';

CREATE OR REPLACE FUNCTION public.users_enforce_privileged_columns_on_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  -- 로그인 사용자가 자신의 행만 갱신할 때: 운영 컬럼은 기존 값 유지
  IF auth.uid() IS NOT NULL AND auth.uid() IS NOT DISTINCT FROM NEW.id THEN
    NEW.token_limit := OLD.token_limit;
    NEW.current_token_usage := OLD.current_token_usage;
    NEW.is_admin := OLD.is_admin;
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_enforce_privileged_columns_on_self_update ON public.users;
CREATE TRIGGER users_enforce_privileged_columns_on_self_update
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.users_enforce_privileged_columns_on_self_update();
