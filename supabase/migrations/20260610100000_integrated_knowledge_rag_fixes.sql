-- -----------------------------------------------------------------------------
-- [31단계] 다중 부서 열람 권한(target_department 콤마 구분자) RLS 개편
-- 및 공개 폴더 삭제 RLS 제약 해제 마이그레이션
-- -----------------------------------------------------------------------------

-- 1. knowledge_base 단일 부서 CHECK 제약 조건 제거
ALTER TABLE public.knowledge_base
  DROP CONSTRAINT IF EXISTS knowledge_base_target_department_check;

-- 2. user_can_access_knowledge_document 헬퍼 함수 개편 (콤마 구분자 매칭 지원)
CREATE OR REPLACE FUNCTION public.user_can_access_knowledge_document(p_document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.knowledge_base kb
    WHERE kb.id = p_document_id
      AND (
        public.current_user_is_admin()
        OR '공통' = ANY(string_to_array(kb.target_department, ','))
        OR (
          public.current_user_department() IS NOT NULL
          AND public.current_user_department() = ANY(string_to_array(kb.target_department, ','))
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_access_knowledge_document(uuid) TO authenticated;

-- 3. knowledge_base SELECT RLS 정책 개편 (콤마 구분자 매칭 지원)
DROP POLICY IF EXISTS knowledge_base_select_dept_scoped ON public.knowledge_base;

CREATE POLICY knowledge_base_select_dept_scoped
  ON public.knowledge_base
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_is_admin()
    OR '공통' = ANY(string_to_array(target_department, ','))
    OR (
      public.current_user_department() IS NOT NULL
      AND public.current_user_department() = ANY(string_to_array(target_department, ','))
    )
  );

-- 4. knowledge_folders DELETE RLS 정책 개편 (공개 폴더는 누구나 삭제 가능하도록 수정)
DROP POLICY IF EXISTS knowledge_folders_delete_own_or_admin ON public.knowledge_folders;
DROP POLICY IF EXISTS knowledge_folders_delete_scoped ON public.knowledge_folders;

CREATE POLICY knowledge_folders_delete_scoped
  ON public.knowledge_folders
  FOR DELETE
  TO authenticated
  USING (
    visibility = 'public'
    OR auth.uid() = created_by
    OR public.current_user_is_admin()
  );
