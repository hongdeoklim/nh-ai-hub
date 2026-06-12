-- -----------------------------------------------------------------------------
-- 사내 자료실 — 빈 폴더 경로 (문서 없이도 category 트리에 표시)
-- path 예: "안전/가이드" (앞뒤 슬래시 없음)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.knowledge_folders (
  path text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_folders_pkey PRIMARY KEY (path),
  CONSTRAINT knowledge_folders_path_nonempty CHECK (char_length(trim(path)) > 0),
  CONSTRAINT knowledge_folders_path_format CHECK (
    trim(path) !~ '^/|/$|//'
    AND trim(path) = regexp_replace(trim(path), '/+', '/', 'g')
  )
);

COMMENT ON TABLE public.knowledge_folders IS
  '자료실 폴더 경로(문서 업로드 전 빈 폴더). knowledge_base.category 와 동일한 슬래시 경로 규칙.';

CREATE INDEX IF NOT EXISTS knowledge_folders_created_at_idx
  ON public.knowledge_folders (created_at DESC);

ALTER TABLE public.knowledge_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_folders_select_authenticated ON public.knowledge_folders;
CREATE POLICY knowledge_folders_select_authenticated
  ON public.knowledge_folders
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS knowledge_folders_insert_authenticated ON public.knowledge_folders;
CREATE POLICY knowledge_folders_insert_authenticated
  ON public.knowledge_folders
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS knowledge_folders_delete_own_or_admin ON public.knowledge_folders;
CREATE POLICY knowledge_folders_delete_own_or_admin
  ON public.knowledge_folders
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR public.current_user_is_admin()
  );
