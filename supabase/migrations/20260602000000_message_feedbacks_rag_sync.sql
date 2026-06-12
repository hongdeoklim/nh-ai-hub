-- -----------------------------------------------------------------------------
-- [2단계 고도화] RAG 자가 학습 루프용 DB 보완 및 RLS 수립
-- -----------------------------------------------------------------------------

-- 1) message_feedbacks 테이블에 RAG 연동 컬럼 추가
ALTER TABLE public.message_feedbacks
  ADD COLUMN IF NOT EXISTS is_rag_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rag_applied_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS work_case_id uuid NULL REFERENCES public.work_cases(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.message_feedbacks.is_rag_applied IS 'RAG 지식베이스(work_cases)에 반영되었는지 여부';
COMMENT ON COLUMN public.message_feedbacks.rag_applied_at IS 'RAG 지식베이스에 반영된 일시';
COMMENT ON COLUMN public.message_feedbacks.work_case_id IS 'RAG 지식베이스에 생성된 work_cases 레코드 ID';

-- 2) RLS 정책 보완 (관리자 권한 추가)
-- 관리자(is_admin = true)는 모든 feedback 내역을 조회 및 관리할 수 있음
DROP POLICY IF EXISTS feedbacks_admin_all ON public.message_feedbacks;
CREATE POLICY feedbacks_admin_all
  ON public.message_feedbacks
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true));

-- 3) work_cases RLS 정책 정의
-- 일반 사용자: AI 대화 및 챗봇에서 RAG를 사용하기 위해 SELECT 권한이 필요함
DROP POLICY IF EXISTS work_cases_select_all_authenticated ON public.work_cases;
CREATE POLICY work_cases_select_all_authenticated
  ON public.work_cases
  FOR SELECT
  TO authenticated
  USING (true);

-- 관리자(is_admin = true): RAG 사례를 등록/수정/삭제 가능
DROP POLICY IF EXISTS work_cases_admin_all ON public.work_cases;
CREATE POLICY work_cases_admin_all
  ON public.work_cases
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true));

-- 4) 긍정 피드백 대화 조인 조회용 고성능 RPC 함수 신설
CREATE OR REPLACE FUNCTION public.get_positive_feedbacks_with_dialogue()
RETURNS TABLE (
  feedback_id uuid,
  message_id uuid,
  message_type text,
  feedback_text text,
  rating integer,
  created_at timestamptz,
  is_rag_applied boolean,
  rag_applied_at timestamptz,
  work_case_id uuid,
  user_email text,
  assistant_response text,
  user_prompt text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 관리자 계정만 접근 허용
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.is_admin = true
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT 
    f.id AS feedback_id,
    f.message_id,
    f.message_type,
    f.feedback_text,
    f.rating,
    f.created_at,
    f.is_rag_applied,
    f.rag_applied_at,
    f.work_case_id,
    u.email AS user_email,
    -- AI 답변 본문 추출
    CASE 
      WHEN f.message_type = 'session' THEN (SELECT m.content FROM public.chat_session_messages m WHERE m.id = f.message_id LIMIT 1)
      ELSE (SELECT m.content FROM public.chat_messages m WHERE m.id = f.message_id LIMIT 1)
    END AS assistant_response,
    -- 사용자의 직전 질문 본문 추출
    CASE 
      WHEN f.message_type = 'session' THEN (
        SELECT m_prev.content 
        FROM public.chat_session_messages m 
        JOIN public.chat_session_messages m_prev ON m_prev.session_id = m.session_id
        WHERE m.id = f.message_id AND m_prev.role = 'user' AND m_prev.created_at < m.created_at
        ORDER BY m_prev.created_at DESC
        LIMIT 1
      )
      ELSE (
        SELECT m_prev.content 
        FROM public.chat_messages m 
        JOIN public.chat_messages m_prev ON m_prev.conversation_id = m.conversation_id
        WHERE m.id = f.message_id AND m_prev.role = 'user' AND m_prev.created_at < m.created_at
        ORDER BY m_prev.created_at DESC
        LIMIT 1
      )
    END AS user_prompt
  FROM public.message_feedbacks f
  JOIN public.users u ON u.id = f.user_id
  WHERE f.rating = 1
  ORDER BY f.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_positive_feedbacks_with_dialogue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_positive_feedbacks_with_dialogue() TO authenticated;
