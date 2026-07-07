-- CAD 페이지의 다운로드 버튼은 storage.list()로 설치본 존재를 확인하는데,
-- list()는 storage.objects SELECT RLS를 거친다. 이전 마이그레이션은 관리자 write
-- 정책만 추가해 일반 사용자는 목록 조회가 안 돼 버튼이 계속 "준비 중"으로 남는다.
-- 이 버킷은 이미 public(공개 다운로드 가능)이므로 목록 조회도 공개로 허용한다.
drop policy if exists "public_list_agent_installer" on storage.objects;
create policy "public_list_agent_installer" on storage.objects
  for select using (bucket_id = 'agent-installer');
