-- 현장 평가 수정 피드백 컬럼 추가
alter table public.site_assessments
  add column if not exists corrections jsonb default '[]'::jsonb,
  add column if not exists feedback_status text default 'pending'
    check (feedback_status in ('pending', 'corrected', 'confirmed')),
  add column if not exists preferred_model text;

-- 수정 권한: 본인 평가만
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'site_assessments'
      and policyname = '본인 평가 수정'
  ) then
    create policy "본인 평가 수정"
      on public.site_assessments for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
