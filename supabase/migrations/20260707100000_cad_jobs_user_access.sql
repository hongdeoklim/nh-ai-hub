-- CAD job monitor UI needs: users see their OWN jobs, admins can approve/reject
-- (status transition), and everyone can see the command whitelist so the UI can
-- explain what's runnable. Writes/inserts stay service_role + admin-only.

-- 요청자 본인은 자기 작업을 조회할 수 있다 (기존 admin_read 정책과 공존).
drop policy if exists "user_read_own_cad_jobs" on cad_jobs;
create policy "user_read_own_cad_jobs" on cad_jobs
  for select using (requested_by = auth.uid());

-- 본인 작업의 step 로그도 조회 가능.
drop policy if exists "user_read_own_cad_job_logs" on cad_job_logs;
create policy "user_read_own_cad_job_logs" on cad_job_logs
  for select using (
    exists (
      select 1 from cad_jobs
      where cad_jobs.id = cad_job_logs.job_id
        and cad_jobs.requested_by = auth.uid()
    )
  );

-- 관리자는 작업 상태를 변경(승인/반려)할 수 있다.
drop policy if exists "admin_update_cad_jobs" on cad_jobs;
create policy "admin_update_cad_jobs" on cad_jobs
  for update using (
    exists (select 1 from users where id = auth.uid() and is_admin = true)
  ) with check (
    exists (select 1 from users where id = auth.uid() and is_admin = true)
  );

-- 인증된 사용자는 활성 명령 화이트리스트를 조회할 수 있다 (UI 설명용).
drop policy if exists "auth_read_enabled_allowed_programs" on allowed_programs;
create policy "auth_read_enabled_allowed_programs" on allowed_programs
  for select using (auth.uid() is not null and enabled = true);
