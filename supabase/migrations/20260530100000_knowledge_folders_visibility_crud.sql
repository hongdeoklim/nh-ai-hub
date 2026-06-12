-- -----------------------------------------------------------------------------
-- 자료실 폴더: 공개/개인 구분, 이름 변경(UPDATE) RLS
-- 개인 폴더 DB path: __private/{user_id}/표시경로
-- -----------------------------------------------------------------------------

ALTER TABLE public.knowledge_folders
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';

ALTER TABLE public.knowledge_folders
  DROP CONSTRAINT IF EXISTS knowledge_folders_visibility_check;

ALTER TABLE public.knowledge_folders
  ADD CONSTRAINT knowledge_folders_visibility_check CHECK (
    visibility IN ('public', 'personal')
  );

COMMENT ON COLUMN public.knowledge_folders.visibility IS
  'public=전사 공개 폴더, personal=본인만 보는 폴더(__private/{user_id}/ 접두).';

-- 기존 행은 공개로 유지
UPDATE public.knowledge_folders
SET visibility = 'public'
WHERE visibility IS NULL OR trim(visibility) = '';

-- -----------------------------------------------------------------------------
-- RLS: SELECT — 공개 또는 본인 개인 폴더
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS knowledge_folders_select_authenticated ON public.knowledge_folders;

CREATE POLICY knowledge_folders_select_scoped
  ON public.knowledge_folders
  FOR SELECT
  TO authenticated
  USING (
    visibility = 'public'
    OR created_by = auth.uid()
    OR public.current_user_is_admin()
  );

-- -----------------------------------------------------------------------------
-- RLS: UPDATE — 본인 생성 또는 관리자 (이름 변경)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS knowledge_folders_update_own_or_admin ON public.knowledge_folders;
CREATE POLICY knowledge_folders_update_own_or_admin
  ON public.knowledge_folders
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR public.current_user_is_admin()
  )
  WITH CHECK (
    auth.uid() = created_by
    OR public.current_user_is_admin()
  );
