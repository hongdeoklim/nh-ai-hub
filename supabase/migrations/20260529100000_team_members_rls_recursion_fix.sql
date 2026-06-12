-- team_members RLS self-reference → infinite recursion (42P17) 수정
-- SECURITY DEFINER 헬퍼로 멤버십 검사를 RLS 밖에서 수행합니다.

CREATE OR REPLACE FUNCTION public.is_team_member(
  p_team_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = COALESCE(p_user_id, auth.uid())
  );
$$;

COMMENT ON FUNCTION public.is_team_member(uuid, uuid) IS
  '팀 멤버십 여부(RLS 재귀 방지용 SECURITY DEFINER).';

CREATE OR REPLACE FUNCTION public.is_team_owner(
  p_team_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = COALESCE(p_user_id, auth.uid())
      AND tm.role = 'owner'
  );
$$;

COMMENT ON FUNCTION public.is_team_owner(uuid, uuid) IS
  '팀 owner 여부(RLS 재귀 방지용 SECURITY DEFINER).';

REVOKE ALL ON FUNCTION public.is_team_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_team_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_owner(uuid, uuid) TO authenticated;

-- teams
DROP POLICY IF EXISTS teams_select_member ON public.teams;
CREATE POLICY teams_select_member
  ON public.teams
  FOR SELECT
  TO authenticated
  USING (
    public.is_team_member(teams.id)
    OR teams.created_by = auth.uid()
  );

-- team_members
DROP POLICY IF EXISTS team_members_select_team_member ON public.team_members;
CREATE POLICY team_members_select_team_member
  ON public.team_members
  FOR SELECT
  TO authenticated
  USING (public.is_team_member(team_members.team_id));

DROP POLICY IF EXISTS team_members_insert_owner ON public.team_members;
CREATE POLICY team_members_insert_owner
  ON public.team_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      EXISTS (
        SELECT 1
        FROM public.teams t
        WHERE t.id = team_members.team_id
          AND t.created_by = auth.uid()
      )
      AND team_members.user_id = auth.uid()
      AND team_members.role = 'owner'
    )
    OR public.is_team_owner(team_members.team_id)
  );

DROP POLICY IF EXISTS team_members_delete_self_or_owner ON public.team_members;
CREATE POLICY team_members_delete_self_or_owner
  ON public.team_members
  FOR DELETE
  TO authenticated
  USING (
    team_members.user_id = auth.uid()
    OR public.is_team_owner(team_members.team_id)
  );

-- team_conversations
DROP POLICY IF EXISTS team_conversations_select_team_member ON public.team_conversations;
CREATE POLICY team_conversations_select_team_member
  ON public.team_conversations
  FOR SELECT
  TO authenticated
  USING (public.is_team_member(team_conversations.team_id));

DROP POLICY IF EXISTS team_conversations_insert_team_member ON public.team_conversations;
CREATE POLICY team_conversations_insert_team_member
  ON public.team_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_team_member(team_conversations.team_id)
  );

-- conversation_participants
DROP POLICY IF EXISTS conversation_participants_select_if_member ON public.conversation_participants;
CREATE POLICY conversation_participants_select_if_member
  ON public.conversation_participants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_conversations tc
      WHERE tc.id = conversation_participants.conversation_id
        AND public.is_team_member(tc.team_id)
    )
  );

DROP POLICY IF EXISTS conversation_participants_insert_by_conv_creator ON public.conversation_participants;
CREATE POLICY conversation_participants_insert_by_conv_creator
  ON public.conversation_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.team_conversations tc
      WHERE tc.id = conversation_participants.conversation_id
        AND tc.created_by = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.team_conversations tc
      WHERE tc.id = conversation_participants.conversation_id
        AND public.is_team_member(tc.team_id, conversation_participants.user_id)
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
      SELECT 1
      FROM public.team_conversations tc
      WHERE tc.id = conversation_participants.conversation_id
        AND public.is_team_member(tc.team_id)
    )
  );

-- RPC: 팀원 디렉터리
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
    AND public.is_team_member(p_team_id);
$$;

REVOKE ALL ON FUNCTION public.team_members_with_email(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_members_with_email(uuid) TO authenticated;

-- RPC: 이메일 초대
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

  IF NOT public.is_team_owner(p_team_id, v_actor) THEN
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
