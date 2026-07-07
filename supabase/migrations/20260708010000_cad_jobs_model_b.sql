-- Model B (직원 개인 PC): 에이전트가 직원 개인 계정으로 로그인해 '본인 작업'만 처리.
-- service_role 키를 개인 PC에 배포하지 않아도 되도록, 본인 작업에 대한 UPDATE/로그 INSERT를 허용.
--
-- 보안 핵심: 파괴적 명령 '자가 승인' 차단.
--   USING에 status <> 'pending_approval' 을 넣어, 승인 대기 중인 작업은 본인도 UPDATE 불가.
--   → 파괴적 명령(=pending_approval로 큐잉됨)은 여전히 관리자만 승인(pending으로 전환) 가능.
--   에이전트의 정상 전이(pending→running→completed/failed, pending→pending_approval 재분류)는
--   모두 원본 상태가 pending_approval이 아니므로 허용된다.
drop policy if exists "user_update_own_cad_jobs" on cad_jobs;
create policy "user_update_own_cad_jobs" on cad_jobs
  for update
  using (requested_by = auth.uid() and status <> 'pending_approval')
  with check (requested_by = auth.uid());

-- 본인 작업의 실행 step 로그 기록 허용.
drop policy if exists "user_insert_own_cad_job_logs" on cad_job_logs;
create policy "user_insert_own_cad_job_logs" on cad_job_logs
  for insert to authenticated
  with check (
    exists (
      select 1 from cad_jobs
      where cad_jobs.id = cad_job_logs.job_id
        and cad_jobs.requested_by = auth.uid()
    )
  );
