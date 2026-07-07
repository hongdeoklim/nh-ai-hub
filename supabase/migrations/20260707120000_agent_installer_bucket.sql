-- 로컬 에이전트 설치본(setup.exe) 배포용 공개 버킷.
-- 관리자가 빌드한 설치본을 이 버킷에 올리면 앱의 CAD 에이전트 페이지에서
-- 다운로드 링크가 자동으로 노출된다(공개 버킷 → getPublicUrl).
insert into storage.buckets (id, name, public)
values ('agent-installer', 'agent-installer', true)
on conflict (id) do update set public = true;

-- 공개 읽기(다운로드)는 공개 버킷 기본 동작으로 허용된다.
-- 업로드/수정/삭제는 관리자만 가능하도록 제한한다.
drop policy if exists "admin_write_agent_installer" on storage.objects;
create policy "admin_write_agent_installer" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'agent-installer'
    and exists (select 1 from users where id = auth.uid() and is_admin = true)
  );

drop policy if exists "admin_update_agent_installer" on storage.objects;
create policy "admin_update_agent_installer" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'agent-installer'
    and exists (select 1 from users where id = auth.uid() and is_admin = true)
  );

drop policy if exists "admin_delete_agent_installer" on storage.objects;
create policy "admin_delete_agent_installer" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'agent-installer'
    and exists (select 1 from users where id = auth.uid() and is_admin = true)
  );
