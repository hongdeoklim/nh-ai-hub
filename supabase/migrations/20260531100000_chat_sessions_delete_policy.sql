-- 개인 채팅 원격 삭제: chat_sessions DELETE RLS
DROP POLICY IF EXISTS chat_sessions_delete_own ON public.chat_sessions;
CREATE POLICY chat_sessions_delete_own
  ON public.chat_sessions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
