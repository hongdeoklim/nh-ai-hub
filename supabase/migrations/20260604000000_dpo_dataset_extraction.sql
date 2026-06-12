-- -----------------------------------------------------------------------------
-- [4단계 고도화] DPO(Direct Preference Optimization) 파인튜닝 데이터셋 추출 RPC 구축
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_dpo_preference_dataset()
RETURNS TABLE (
  prompt text,
  chosen text,
  rejected text,
  feedback_id_chosen uuid,
  feedback_id_rejected uuid,
  created_at timestamptz,
  message_type text,
  user_email text
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
  WITH positive_feedbacks AS (
    -- 1. 긍정 피드백(👍) 기반 chosen 데이터 추출
    SELECT 
      f.id AS feedback_id,
      f.message_id,
      f.message_type,
      f.user_id,
      f.created_at,
      CASE 
        WHEN f.message_type = 'session' THEN (SELECT m.content FROM public.chat_session_messages m WHERE m.id = f.message_id LIMIT 1)
        ELSE (SELECT m.content FROM public.chat_messages m WHERE m.id = f.message_id LIMIT 1)
      END AS chosen_text,
      CASE 
        WHEN f.message_type = 'session' THEN (
          SELECT m.session_id FROM public.chat_session_messages m WHERE m.id = f.message_id LIMIT 1
        )
        ELSE NULL
      END AS session_id,
      CASE 
        WHEN f.message_type = 'team' THEN (
          SELECT m.conversation_id FROM public.chat_messages m WHERE m.id = f.message_id LIMIT 1
        )
        ELSE NULL
      END AS conversation_id,
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
    WHERE f.rating = 1
  ),
  negative_feedbacks AS (
    -- 2. 부정 피드백(👎) 또는 일반 재생성으로 밀려난 rejected 데이터 추출
    SELECT 
      f.id AS feedback_id,
      f.message_id,
      f.message_type,
      CASE 
        WHEN f.message_type = 'session' THEN (SELECT m.content FROM public.chat_session_messages m WHERE m.id = f.message_id LIMIT 1)
        ELSE (SELECT m.content FROM public.chat_messages m WHERE m.id = f.message_id LIMIT 1)
      END AS rejected_text,
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
    WHERE f.rating = -1
  )
  SELECT 
    p.user_prompt AS prompt,
    p.chosen_text AS chosen,
    coalesce(n.rejected_text, '이 답변은 부적절하거나 직원의 업무 흐름에 유용하지 않은 평범한 답변입니다.') AS rejected,
    p.feedback_id AS feedback_id_chosen,
    n.feedback_id AS feedback_id_rejected,
    p.created_at,
    p.message_type,
    u.email AS user_email
  FROM positive_feedbacks p
  LEFT JOIN negative_feedbacks n ON n.user_prompt = p.user_prompt
  JOIN public.users u ON u.id = p.user_id
  ORDER BY p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dpo_preference_dataset() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dpo_preference_dataset() TO authenticated;
