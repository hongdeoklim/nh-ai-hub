-- =============================================================================
-- 사용자 AI 프로필(마크다운), 팀·공유 대화, 토큰 할당 요청, 관리자 플래그
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) 사용자별 AI 컨텍스트(스킬/기억) — 1행/사용자
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_ai_profile_context (
  user_id uuid NOT NULL,
  context_markdown text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_ai_profile_context_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_ai_profile_context_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE
);

COMMENT ON TABLE public.user_ai_profile_context IS '사용자가 설정하는 AI용 스타일·기억 마크다운. Edge(ai-chat)에서 모델 시스템 컨텍스트로 주입.';
COMMENT ON COLUMN public.user_ai_profile_context.context_markdown IS '민감정보 입력 비권장. 서버에서 길이 상한 적용 후 시스템 메시지에 합류.';

ALTER TABLE public.user_ai_profile_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_ai_profile_context_select_own ON public.user_ai_profile_context;
CREATE POLICY user_ai_profile_context_select_own
  ON public.user_ai_profile_context
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_ai_profile_context_insert_own ON public.user_ai_profile_context;
CREATE POLICY user_ai_profile_context_insert_own
  ON public.user_ai_profile_context
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_ai_profile_context_update_own ON public.user_ai_profile_context;
CREATE POLICY user_ai_profile_context_update_own
  ON public.user_ai_profile_context
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_ai_profile_context_delete_own ON public.user_ai_profile_context;
CREATE POLICY user_ai_profile_context_delete_own
  ON public.user_ai_profile_context
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 2) 관리자 플래그 (토큰 요청 처리 UI 게이트)
-- -----------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_admin IS 'true 이면 토큰 할당 요청 관리 등 내부 관리 화면 접근.';

UPDATE public.users SET is_admin = false WHERE is_admin IS NULL;

-- -----------------------------------------------------------------------------
-- 3) 토큰 추가 할당 요청
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.token_allocation_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz NULL,

  CONSTRAINT token_allocation_requests_pkey PRIMARY KEY (id),
  CONSTRAINT token_allocation_requests_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE,
  CONSTRAINT token_allocation_requests_message_check
    CHECK (char_length(trim(message)) >= 1)
);

COMMENT ON TABLE public.token_allocation_requests IS '토큰 부족 시 사용자가 관리자에게 추가 한도 등을 요청하는 큐.';
COMMENT ON COLUMN public.token_allocation_requests.status IS 'pending → approved/rejected 수동 처리(MVP).';

CREATE INDEX IF NOT EXISTS token_allocation_requests_status_created_idx
  ON public.token_allocation_requests (status, created_at DESC);

ALTER TABLE public.token_allocation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS token_allocation_requests_select_own ON public.token_allocation_requests;
CREATE POLICY token_allocation_requests_select_own
  ON public.token_allocation_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS token_allocation_requests_insert_own ON public.token_allocation_requests;
CREATE POLICY token_allocation_requests_insert_own
  ON public.token_allocation_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS token_allocation_requests_select_admin ON public.token_allocation_requests;
CREATE POLICY token_allocation_requests_select_admin
  ON public.token_allocation_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND COALESCE(u.is_admin, false) = true
    )
  );

DROP POLICY IF EXISTS token_allocation_requests_update_admin ON public.token_allocation_requests;
CREATE POLICY token_allocation_requests_update_admin
  ON public.token_allocation_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND COALESCE(u.is_admin, false) = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND COALESCE(u.is_admin, false) = true
    )
  );

-- -----------------------------------------------------------------------------
-- 4) 팀 (재실행·부분 적용 DB 호환)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT teams_pkey PRIMARY KEY (id),
  CONSTRAINT teams_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users (id) ON DELETE CASCADE,
  CONSTRAINT teams_name_check CHECK (char_length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS teams_created_at_idx ON public.teams (created_at DESC);

CREATE TABLE IF NOT EXISTS public.team_members (
  team_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT team_members_pkey PRIMARY KEY (team_id, user_id),
  CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams (id) ON DELETE CASCADE,
  CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS team_members_user_id_idx ON public.team_members (user_id);

-- -----------------------------------------------------------------------------
-- 5) 팀 소속 공유 대화 + 참여자 + 메시지
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  title text NOT NULL DEFAULT '공유 채팅',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT team_conversations_pkey PRIMARY KEY (id),
  CONSTRAINT team_conversations_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams (id) ON DELETE CASCADE,
  CONSTRAINT team_conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users (id) ON DELETE CASCADE,
  CONSTRAINT team_conversations_title_check CHECK (char_length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS team_conversations_team_id_updated_idx ON public.team_conversations (team_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT conversation_participants_pkey PRIMARY KEY (conversation_id, user_id),
  CONSTRAINT conversation_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.team_conversations (id) ON DELETE CASCADE,
  CONSTRAINT conversation_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS conversation_participants_user_id_idx ON public.conversation_participants (user_id);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL DEFAULT '',
  author_user_id uuid NULL,
  author_label text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.team_conversations (id) ON DELETE CASCADE,
  CONSTRAINT chat_messages_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_created_idx ON public.chat_messages (conversation_id, created_at ASC);

COMMENT ON COLUMN public.chat_messages.author_label IS '표시용 스냅샷(MVP): 발신 시점 이메일 등. 신뢰 경계는 author_user_id.';

-- ————————————————————————————————————————————————————————————————————————
-- RLS: teams
-- ————————————————————————————————————————————————————————————————————————
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teams_select_member ON public.teams;
CREATE POLICY teams_select_member
  ON public.teams
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = teams.id AND tm.user_id = auth.uid()
    )
    OR teams.created_by = auth.uid()
  );

DROP POLICY IF EXISTS teams_insert_creator ON public.teams;
CREATE POLICY teams_insert_creator
  ON public.teams
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS teams_update_creator ON public.teams;
CREATE POLICY teams_update_creator
  ON public.teams
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS teams_delete_creator ON public.teams;
CREATE POLICY teams_delete_creator
  ON public.teams
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- ————————————————————————————————————————————————————————————————————————
-- RLS: team_members
-- ————————————————————————————————————————————————————————————————————————
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_members_select_team_member ON public.team_members;
CREATE POLICY team_members_select_team_member
  ON public.team_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members me
      WHERE me.team_id = team_members.team_id AND me.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS team_members_insert_owner ON public.team_members;
CREATE POLICY team_members_insert_owner
  ON public.team_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.teams t
        WHERE t.id = team_members.team_id
          AND t.created_by = auth.uid()
      )
      AND team_members.user_id = auth.uid()
      AND team_members.role = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members om
      WHERE om.team_id = team_members.team_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
    )
  );

DROP POLICY IF EXISTS team_members_delete_self_or_owner ON public.team_members;
CREATE POLICY team_members_delete_self_or_owner
  ON public.team_members
  FOR DELETE
  TO authenticated
  USING (
    team_members.user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members om
      WHERE om.team_id = team_members.team_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
    )
  );

-- ————————————————————————————————————————————————————————————————————————
-- RLS: team_conversations (팀원 전체 열람 MVP)
-- ————————————————————————————————————————————————————————————————————————
ALTER TABLE public.team_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_conversations_select_team_member ON public.team_conversations;
CREATE POLICY team_conversations_select_team_member
  ON public.team_conversations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_conversations.team_id AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS team_conversations_insert_team_member ON public.team_conversations;
CREATE POLICY team_conversations_insert_team_member
  ON public.team_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_conversations.team_id AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS team_conversations_update_creator ON public.team_conversations;
CREATE POLICY team_conversations_update_creator
  ON public.team_conversations
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- ————————————————————————————————————————————————————————————————————————
-- RLS: conversation_participants
-- ————————————————————————————————————————————————————————————————————————
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_participants_select_if_member ON public.conversation_participants;
CREATE POLICY conversation_participants_select_if_member
  ON public.conversation_participants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_conversations tc
      JOIN public.team_members tm ON tm.team_id = tc.team_id
      WHERE tc.id = conversation_participants.conversation_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS conversation_participants_insert_by_conv_creator ON public.conversation_participants;
CREATE POLICY conversation_participants_insert_by_conv_creator
  ON public.conversation_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_conversations tc
      WHERE tc.id = conversation_participants.conversation_id
        AND tc.created_by = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.team_conversations tc
      JOIN public.team_members tm ON tm.team_id = tc.team_id
      WHERE tc.id = conversation_participants.conversation_id
        AND tm.user_id = conversation_participants.user_id
    )
  );

DROP POLICY IF EXISTS conversation_participants_insert_self_when_team_member ON public.conversation_participants;
CREATE POLICY conversation_participants_insert_self_when_team_member
  ON public.conversation_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.team_conversations tc
      JOIN public.team_members tm ON tm.team_id = tc.team_id
      WHERE tc.id = conversation_participants.conversation_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS conversation_participants_delete_self ON public.conversation_participants;
CREATE POLICY conversation_participants_delete_self
  ON public.conversation_participants
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ————————————————————————————————————————————————————————————————————————
-- RLS: chat_messages
-- ————————————————————————————————————————————————————————————————————————
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_messages_select_participant ON public.chat_messages;
CREATE POLICY chat_messages_select_participant
  ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = chat_messages.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS chat_messages_insert_participant ON public.chat_messages;
CREATE POLICY chat_messages_insert_participant
  ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = chat_messages.conversation_id
        AND cp.user_id = auth.uid()
    )
    AND (
      (role = 'user' AND author_user_id = auth.uid())
      OR (role = 'assistant' AND author_user_id IS NULL)
      OR (role = 'system' AND author_user_id IS NULL)
    )
  );

-- -----------------------------------------------------------------------------
-- 같은 팀원 디렉터리 조회(public.users 타인 행 직접 SELECT 불가 → RPC)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.team_members_with_email(p_team_id uuid)
RETURNS TABLE (user_id uuid, email text, role text, joined_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email, tm.role, tm.joined_at
  FROM public.team_members tm
  JOIN public.users u ON u.id = tm.user_id
  WHERE tm.team_id = p_team_id
    AND EXISTS (
      SELECT 1 FROM public.team_members me
      WHERE me.team_id = p_team_id AND me.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.team_members_with_email(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_members_with_email(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 팀 오너: 이메일로 팀원 추가
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_team_member_by_email(
  p_team_id uuid,
  p_email text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_target uuid;
  v_norm text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_norm := lower(trim(p_email));
  IF char_length(v_norm) < 3 THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = v_actor
      AND tm.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  SELECT u.id INTO v_target
  FROM public.users u
  WHERE lower(trim(u.email)) = v_norm
  LIMIT 1;

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (p_team_id, v_target, 'member')
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.add_team_member_by_email(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_team_member_by_email(uuid, text) TO authenticated;

