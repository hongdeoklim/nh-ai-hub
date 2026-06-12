-- -----------------------------------------------------------------------------
-- [1단계 고도화] AI 대화 답변 피드백 테이블 신설
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.message_feedbacks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL, -- chat_messages.id 또는 chat_session_messages.id
  message_type text NOT NULL CHECK (message_type IN ('session', 'team')),
  rating integer NOT NULL CHECK (rating IN (1, -1)), -- 1 = 좋아요 (Thumbs Up), -1 = 싫어요 (Thumbs Down)
  feedback_text text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT message_feedbacks_pkey PRIMARY KEY (id),
  CONSTRAINT message_feedbacks_user_message_unique UNIQUE (user_id, message_id)
);

COMMENT ON TABLE public.message_feedbacks IS '직원들의 AI 답변 피드백 로그. RAG 학습 및 고도화 파이프라인의 기초 데이터.';
COMMENT ON COLUMN public.message_feedbacks.message_id IS '개인 세션 메시지 ID 또는 팀 공유방 메시지 ID';
COMMENT ON COLUMN public.message_feedbacks.rating IS '1: 긍정 피드백(Thumbs Up), -1: 부정 피드백(Thumbs Down)';
COMMENT ON COLUMN public.message_feedbacks.feedback_text IS '구체적인 개선점 및 사용 의견';

-- 트리거를 통한 updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.touch_message_feedbacks_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS message_feedbacks_set_updated_at ON public.message_feedbacks;
CREATE TRIGGER message_feedbacks_set_updated_at
  BEFORE UPDATE ON public.message_feedbacks
  FOR EACH ROW
  EXECUTE PROCEDURE public.touch_message_feedbacks_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security (RLS) 설정
-- -----------------------------------------------------------------------------
ALTER TABLE public.message_feedbacks ENABLE ROW LEVEL SECURITY;

-- 본인의 피드백만 조회/등록/수정/삭제 가능
DROP POLICY IF EXISTS feedbacks_owner_all ON public.message_feedbacks;
CREATE POLICY feedbacks_owner_all
  ON public.message_feedbacks
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
