-- -----------------------------------------------------------------------------
-- [23단계] 개인 채팅 localStorage → chat_sessions / chat_session_messages 동기화
-- -----------------------------------------------------------------------------

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS client_thread_id uuid NULL;

COMMENT ON COLUMN public.chat_sessions.client_thread_id IS
  '브라우저 sessionStorage 스레드 UUID. user_id 와 쌍으로 upsert.';

CREATE UNIQUE INDEX IF NOT EXISTS chat_sessions_user_client_thread_uidx
  ON public.chat_sessions (user_id, client_thread_id)
  WHERE client_thread_id IS NOT NULL;

-- upsert 대상: client_thread_id 가 항상 설정되는 sync RPC 전용
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_sessions_user_client_thread_key'
  ) THEN
    ALTER TABLE public.chat_sessions
      ADD CONSTRAINT chat_sessions_user_client_thread_key
      UNIQUE (user_id, client_thread_id);
  END IF;
END $$;

ALTER TABLE public.chat_session_messages
  ADD COLUMN IF NOT EXISTS client_message_id text NULL;

COMMENT ON COLUMN public.chat_session_messages.client_message_id IS
  '클라이언트 ChatBubble.id — 세션 내 upsert 키.';

CREATE UNIQUE INDEX IF NOT EXISTS chat_session_messages_session_client_msg_uidx
  ON public.chat_session_messages (session_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_session_messages_session_client_msg_key'
  ) THEN
    ALTER TABLE public.chat_session_messages
      ADD CONSTRAINT chat_session_messages_session_client_msg_key
      UNIQUE (session_id, client_message_id);
  END IF;
END $$;

DROP POLICY IF EXISTS chat_sessions_update_own ON public.chat_sessions;
CREATE POLICY chat_sessions_update_own
  ON public.chat_sessions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_session_messages_update_own ON public.chat_session_messages;
CREATE POLICY chat_session_messages_update_own
  ON public.chat_session_messages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = chat_session_messages.session_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS chat_session_messages_delete_own ON public.chat_session_messages;
CREATE POLICY chat_session_messages_delete_own
  ON public.chat_session_messages
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = chat_session_messages.session_id AND s.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- RPC: 개인 채팅 전체 동기화 (세션 upsert + 메시지 merge + 고아 삭제)
-- p_messages: [{ "id": "...", "role": "user"|"assistant", "content": "...", "time": "ISO" }]
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_private_chat_session(
  p_client_thread_id uuid,
  p_title text,
  p_messages jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session_id uuid;
  v_msg jsonb;
  v_ids text[] := ARRAY[]::text[];
  v_title text;
  v_role text;
  v_content text;
  v_time timestamptz;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_client_thread_id IS NULL THEN
    RAISE EXCEPTION 'client_thread_id_required';
  END IF;

  IF p_messages IS NULL OR jsonb_typeof(p_messages) <> 'array' THEN
    RAISE EXCEPTION 'messages_must_be_array';
  END IF;

  v_count := jsonb_array_length(p_messages);
  IF v_count > 300 THEN
    RAISE EXCEPTION 'too_many_messages';
  END IF;

  v_title := coalesce(nullif(trim(p_title), ''), '개인 채팅');

  INSERT INTO public.chat_sessions (user_id, title, client_thread_id, updated_at)
  VALUES (v_uid, v_title, p_client_thread_id, now())
  ON CONFLICT ON CONSTRAINT chat_sessions_user_client_thread_key
  DO UPDATE SET
    title = EXCLUDED.title,
    updated_at = now()
  RETURNING id INTO v_session_id;

  IF v_session_id IS NULL THEN
    SELECT id INTO v_session_id
    FROM public.chat_sessions
    WHERE user_id = v_uid AND client_thread_id = p_client_thread_id
    LIMIT 1;
  END IF;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'session_upsert_failed';
  END IF;

  FOR v_msg IN SELECT value FROM jsonb_array_elements(p_messages)
  LOOP
    v_role := lower(trim(coalesce(v_msg->>'role', '')));
    IF v_role NOT IN ('user', 'assistant', 'system') THEN
      CONTINUE;
    END IF;

    v_content := coalesce(v_msg->>'content', '');
    IF char_length(trim(v_content)) = 0 THEN
      CONTINUE;
    END IF;

    IF char_length(v_content) > 32000 THEN
      v_content := left(v_content, 32000);
    END IF;

    v_time := coalesce(
      nullif(trim(v_msg->>'time'), '')::timestamptz,
      now()
    );

    IF v_msg->>'id' IS NULL OR char_length(trim(v_msg->>'id')) = 0 THEN
      INSERT INTO public.chat_session_messages (session_id, role, content, created_at)
      VALUES (v_session_id, v_role, v_content, v_time);
    ELSE
      v_ids := array_append(v_ids, trim(v_msg->>'id'));
      INSERT INTO public.chat_session_messages (
        session_id,
        role,
        content,
        client_message_id,
        created_at
      )
      VALUES (
        v_session_id,
        v_role,
        v_content,
        trim(v_msg->>'id'),
        v_time
      )
      ON CONFLICT ON CONSTRAINT chat_session_messages_session_client_msg_key
      DO UPDATE SET
        role = EXCLUDED.role,
        content = EXCLUDED.content,
        created_at = EXCLUDED.created_at;
    END IF;
  END LOOP;

  IF coalesce(array_length(v_ids, 1), 0) > 0 THEN
    DELETE FROM public.chat_session_messages m
    WHERE m.session_id = v_session_id
      AND m.client_message_id IS NOT NULL
      AND NOT (m.client_message_id = ANY (v_ids));
  END IF;

  RETURN v_session_id;
END;
$$;

COMMENT ON FUNCTION public.sync_private_chat_session(uuid, text, jsonb) IS
  '로그인 사용자의 개인 채팅 스레드를 DB에 upsert (주간 리포트·분석용).';

REVOKE ALL ON FUNCTION public.sync_private_chat_session(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_private_chat_session(uuid, text, jsonb) TO authenticated;
