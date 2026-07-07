-- Privacy fix: ai_assistant_logs held per-user content (task_description,
-- generated result_text such as email drafts, image_url) but its SELECT policy
-- was `TO authenticated USING (true)`, letting any logged-in user read every
-- other user's assistant logs. Restrict reads to the row owner. The only
-- frontend reader (fetchAssistantLogs) already filters .eq('user_id', uid), so
-- this doesn't break legitimate access; edge-function writes use service_role
-- and are unaffected.
drop policy if exists "Allow authenticated users to read logs" on public.ai_assistant_logs;

drop policy if exists ai_assistant_logs_select_own on public.ai_assistant_logs;
create policy ai_assistant_logs_select_own
  on public.ai_assistant_logs
  for select
  to authenticated
  using (auth.uid() = user_id);
