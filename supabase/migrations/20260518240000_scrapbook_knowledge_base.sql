-- -----------------------------------------------------------------------------
-- 스크랩북(중요 대화 저장) 및 사내 자료실(링크 메타)
-- -----------------------------------------------------------------------------
CREATE TABLE public.bookmarked_chats (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  prompt text NOT NULL DEFAULT '',
  ai_response text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookmarked_chats_pkey PRIMARY KEY (id),
  CONSTRAINT bookmarked_chats_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

COMMENT ON TABLE public.bookmarked_chats IS
  '사용자가 스크랩한 AI 대화(프롬프트·응답·메모).';

CREATE INDEX bookmarked_chats_user_id_created_at_idx
  ON public.bookmarked_chats (user_id, created_at DESC);

ALTER TABLE public.bookmarked_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY bookmarked_chats_select_own
  ON public.bookmarked_chats
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY bookmarked_chats_insert_own
  ON public.bookmarked_chats
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY bookmarked_chats_update_own
  ON public.bookmarked_chats
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY bookmarked_chats_delete_own
  ON public.bookmarked_chats
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
CREATE TABLE public.knowledge_base (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  uploader_id uuid NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  category text NOT NULL DEFAULT '미분류',
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT knowledge_base_pkey PRIMARY KEY (id),
  CONSTRAINT knowledge_base_uploader_id_fkey
    FOREIGN KEY (uploader_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT knowledge_base_file_name_check CHECK (char_length(trim(file_name)) > 0),
  CONSTRAINT knowledge_base_file_url_check CHECK (char_length(trim(file_url)) > 0)
);

COMMENT ON TABLE public.knowledge_base IS
  '사내 자료실 링크 메타(파일명·URL·카테고리 등).';

CREATE INDEX knowledge_base_created_at_idx
  ON public.knowledge_base (created_at DESC);

CREATE INDEX knowledge_base_category_idx
  ON public.knowledge_base (category);

ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_base_select_authenticated
  ON public.knowledge_base
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY knowledge_base_insert_own
  ON public.knowledge_base
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = uploader_id);

CREATE POLICY knowledge_base_update_own
  ON public.knowledge_base
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = uploader_id)
  WITH CHECK (auth.uid() = uploader_id);

CREATE POLICY knowledge_base_delete_own
  ON public.knowledge_base
  FOR DELETE
  TO authenticated
  USING (auth.uid() = uploader_id);
