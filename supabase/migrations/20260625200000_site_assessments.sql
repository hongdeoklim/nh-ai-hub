-- 현장 사진 기반 안전보건/품질관리 AI 평가 기록 테이블
create table if not exists public.site_assessments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  category        text not null check (category in ('safety', 'quality')),
  location        text,
  notes           text,
  image_gcs_path  text,
  image_thumb_b64 text,                  -- 미리보기용 base64 (최대 50KB)
  result          jsonb,                  -- AI 평가 결과 JSON
  overall_level   text,                  -- safety: low/medium/high/critical  quality: A/B/C/D/F
  created_at      timestamptz not null default now()
);

-- RLS
alter table public.site_assessments enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'site_assessments'
      and policyname = '본인 평가 조회'
  ) then
    create policy "본인 평가 조회"
      on public.site_assessments for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'site_assessments'
      and policyname = '본인 평가 삽입'
  ) then
    create policy "본인 평가 삽입"
      on public.site_assessments for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'site_assessments'
      and policyname = '관리자 전체 조회'
  ) then
    create policy "관리자 전체 조회"
      on public.site_assessments for select
      using (
        exists (
          select 1 from public.users
          where id = auth.uid() and lower(trim(coalesce(role, ''))) = 'admin'
        )
      );
  end if;
end $$;

create index if not exists site_assessments_user_created
  on public.site_assessments (user_id, created_at desc);

create index if not exists site_assessments_category
  on public.site_assessments (category, created_at desc);
