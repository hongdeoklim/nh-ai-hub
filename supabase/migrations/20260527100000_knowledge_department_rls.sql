-- -----------------------------------------------------------------------------
-- [30단계] 부서별 RAG(자료실) 권한 격리 — knowledge_base.target_department
-- 물리 테이블: public.knowledge_base (별칭 개념: knowledge_documents)
-- -----------------------------------------------------------------------------

ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS target_department text NOT NULL DEFAULT '공통';

COMMENT ON COLUMN public.knowledge_base.target_department IS
  '문서 열람 허용 부서. 공통=전사, 그 외 해당 부서 소속만 SELECT(RLS).';

-- 허용 부서 값 (직원 CRUD · 프롬프트 템플릿과 동일 + 공통)
ALTER TABLE public.knowledge_base
  DROP CONSTRAINT IF EXISTS knowledge_base_target_department_check;

ALTER TABLE public.knowledge_base
  ADD CONSTRAINT knowledge_base_target_department_check CHECK (
    target_department IN (
      '공통',
      '교류사업부',
      '국내여행사업부',
      '교류마케팅사업단',
      '미디어교육부',
      '준법지원단',
      '전문건설부',
      '자산개발부',
      '품질지원부',
      '시설마케팅부',
      '공사관리부',
      '안전보건지원실',
      '경영지원부',
      '경영전략부',
      '공무지원부',
      '서울인천지사',
      '경기남부지사',
      '경기북부지사',
      '충북지사',
      '대전충남세종지사',
      '전북지사',
      '광주전남지사',
      '대구경북지사',
      '경남지사',
      '부산울산지사',
      '제주지사'
    )
  );

CREATE INDEX IF NOT EXISTS knowledge_base_target_department_idx
  ON public.knowledge_base (target_department);

-- SQL Editor / API 별칭 (뷰 — RLS는 base 테이블 knowledge_base 적용)
CREATE OR REPLACE VIEW public.knowledge_documents AS
SELECT
  id,
  uploader_id,
  file_name,
  file_url,
  category,
  target_department,
  created_at
FROM public.knowledge_base;

COMMENT ON VIEW public.knowledge_documents IS
  '[30단계] knowledge_base 동의어 뷰. target_department 로 부서 격리.';

-- -----------------------------------------------------------------------------
-- 헬퍼: 현재 사용자 부서
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_department()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nullif(trim(department), '')
  FROM public.users
  WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.current_user_department() TO authenticated;

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
        OR kb.target_department = '공통'
        OR (
          public.current_user_department() IS NOT NULL
          AND kb.target_department = public.current_user_department()
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_access_knowledge_document(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- RLS: knowledge_base SELECT 부서 격리
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS knowledge_base_select_authenticated ON public.knowledge_base;

CREATE POLICY knowledge_base_select_dept_scoped
  ON public.knowledge_base
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_is_admin()
    OR target_department = '공통'
    OR (
      public.current_user_department() IS NOT NULL
      AND target_department = public.current_user_department()
    )
  );

DROP POLICY IF EXISTS knowledge_base_select_admin ON public.knowledge_base;
CREATE POLICY knowledge_base_select_admin
  ON public.knowledge_base
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_admin());

-- INSERT: 본인 업로드 + 허용 부서 값 (CHECK 제약과 동일)
DROP POLICY IF EXISTS knowledge_base_insert_own ON public.knowledge_base;

CREATE POLICY knowledge_base_insert_own
  ON public.knowledge_base
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = uploader_id);

-- -----------------------------------------------------------------------------
-- Storage: knowledge-documents 버킷 (자료실 파일 업로드)
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('knowledge-documents', 'knowledge-documents', false, 52428800)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS knowledge_documents_storage_insert ON storage.objects;
CREATE POLICY knowledge_documents_storage_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'knowledge-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS knowledge_documents_storage_select ON storage.objects;
CREATE POLICY knowledge_documents_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'knowledge-documents');

DROP POLICY IF EXISTS knowledge_documents_storage_delete ON storage.objects;
CREATE POLICY knowledge_documents_storage_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'knowledge-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- -----------------------------------------------------------------------------
-- match_document_chunks — 부서 권한 이중 필터 (JOIN knowledge_base)
-- 권한 없음 / 부서 미등록 → 빈 결과 (에러 없음)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_text text,
  document_ids uuid[],
  match_count integer DEFAULT 8,
  similarity_threshold double precision DEFAULT 0.2
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  page_number integer,
  chunk_index integer,
  filename text,
  score double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(match_count, 8), 1), 25);
  v_threshold double precision := GREATEST(COALESCE(similarity_threshold, 0.2), 0.0);
  v_query text := lower(trim(coalesce(query_text, '')));
BEGIN
  IF v_query = '' OR document_ids IS NULL OR array_length(document_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH terms AS (
    SELECT unnest(regexp_split_to_array(v_query, '\s+')) AS term
  ),
  authorized_chunks AS (
    SELECT dc.*
    FROM public.document_chunks dc
    WHERE dc.document_id = ANY (document_ids)
      AND (
        (
          dc.source_kind = 'knowledge_base'
          AND public.user_can_access_knowledge_document(dc.document_id)
        )
        OR (
          dc.source_kind = 'user_upload'
          AND EXISTS (
            SELECT 1
            FROM public.user_uploaded_documents u
            WHERE u.id = dc.document_id
              AND u.user_id = auth.uid()
          )
        )
      )
  ),
  scored AS (
    SELECT
      ac.id,
      ac.document_id,
      ac.content,
      ac.page_number,
      ac.chunk_index,
      ac.filename,
      (
        SELECT count(*)::double precision
        FROM terms t
        WHERE t.term <> ''
          AND lower(ac.content) LIKE '%' || t.term || '%'
      ) / GREATEST((SELECT count(*) FROM terms WHERE term <> ''), 1)::double precision AS term_score
    FROM authorized_chunks ac
  )
  SELECT
    s.id,
    s.document_id,
    s.content,
    s.page_number,
    s.chunk_index,
    s.filename,
    s.term_score AS score
  FROM scored s
  WHERE s.term_score >= v_threshold
  ORDER BY s.term_score DESC, s.page_number NULLS LAST, s.chunk_index
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.match_document_chunks(text, uuid[], integer, double precision) IS
  '[30단계] 키워드 매칭 + knowledge_base 부서 RLS + user_upload 본인 한정.';

REVOKE ALL ON FUNCTION public.match_document_chunks(text, uuid[], integer, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(text, uuid[], integer, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(text, uuid[], integer, double precision) TO service_role;

-- -----------------------------------------------------------------------------
-- document_chunks SELECT — knowledge_base 부서 격리 (클라이언트 폴백 검색 이중 방어)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS document_chunks_select_authenticated ON public.document_chunks;

CREATE POLICY document_chunks_select_authenticated
  ON public.document_chunks
  FOR SELECT
  TO authenticated
  USING (
    (
      source_kind = 'knowledge_base'
      AND public.user_can_access_knowledge_document(document_id)
    )
    OR (
      source_kind = 'user_upload'
      AND EXISTS (
        SELECT 1
        FROM public.user_uploaded_documents u
        WHERE u.id = document_chunks.document_id
          AND u.user_id = auth.uid()
      )
    )
  );

