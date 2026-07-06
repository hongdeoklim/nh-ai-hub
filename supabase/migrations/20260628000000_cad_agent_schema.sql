-- Phase 6 — AutoCAD 에이전트 스키마 (AUTOCAD_AGENT_SPEC.md 3번)

-- 실행 가능한 프로그램 화이트리스트
create table if not exists allowed_programs (
  id                  uuid primary key default gen_random_uuid(),
  command_name        text unique not null,
  exe_path            text not null,
  arg_template        text[] not null default '{}',
  allowed_input_roots text[] not null default '{}',
  risk_tier           text not null default 'safe'
                        check (risk_tier in ('safe', 'destructive')),
  enabled             boolean not null default true,
  created_at          timestamptz not null default now()
);

-- 작업 큐
create table if not exists cad_jobs (
  id                      uuid primary key default gen_random_uuid(),
  command                 text not null,
  params                  jsonb not null default '{}',
  status                  text not null default 'pending'
                            check (status in (
                              'pending', 'pending_approval',
                              'running', 'completed', 'failed'
                            )),
  risk_tier               text not null default 'safe'
                            check (risk_tier in ('safe', 'destructive')),
  project_classification  text not null default 'general'
                            check (project_classification in ('general', 'confidential')),
  requested_by            uuid references auth.users(id) on delete set null,
  approved_by             uuid references auth.users(id) on delete set null,
  result                  jsonb,
  error                   text,
  created_at              timestamptz not null default now()
);

-- Step 단위 실행 로그
create table if not exists cad_job_logs (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references cad_jobs(id) on delete cascade,
  step_no       int not null,
  status        text not null check (status in ('done', 'failed')),
  snapshot_path text not null default '',
  env_info      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

-- 인덱스
create index if not exists idx_cad_jobs_status     on cad_jobs(status);
create index if not exists idx_cad_jobs_created_at on cad_jobs(created_at);
create index if not exists idx_cad_job_logs_job_id on cad_job_logs(job_id);

-- RLS: 에이전트(service_role)만 쓰기, 관리자 JWT는 읽기
alter table allowed_programs   enable row level security;
alter table cad_jobs           enable row level security;
alter table cad_job_logs       enable row level security;

-- service_role은 RLS 우회 — 별도 정책 불필요
-- 관리자 JWT 읽기 정책
create policy "admin_read_allowed_programs" on allowed_programs
  for select using (
    exists (
      select 1 from users
      where id = auth.uid() and is_admin = true
    )
  );

create policy "admin_read_cad_jobs" on cad_jobs
  for select using (
    exists (
      select 1 from users
      where id = auth.uid() and is_admin = true
    )
  );

create policy "admin_read_cad_job_logs" on cad_job_logs
  for select using (
    exists (
      select 1 from users
      where id = auth.uid() and is_admin = true
    )
  );

-- 기본 화이트리스트 시드 (AutoCAD 작업 폴더는 설치 마법사에서 덮어씀)
insert into allowed_programs (command_name, exe_path, arg_template, allowed_input_roots, risk_tier)
values
  (
    'open_dwg',
    'C:\Program Files\Autodesk\AutoCAD 2025\acad.exe',
    array['._OPEN', '{path}'],
    array['C:\NH-AI-HUB-workspace'],
    'safe'
  ),
  (
    'save_dwg',
    'C:\Program Files\Autodesk\AutoCAD 2025\acad.exe',
    array['._QSAVE'],
    array['C:\NH-AI-HUB-workspace'],
    'safe'
  ),
  (
    'run_lisp',
    'C:\Program Files\Autodesk\AutoCAD 2025\acad.exe',
    array['{expr}'],
    array['C:\NH-AI-HUB-workspace'],
    'safe'
  ),
  (
    'purge_dwg',
    'C:\Program Files\Autodesk\AutoCAD 2025\acad.exe',
    array['._PURGE', 'All', '*', 'No'],
    array['C:\NH-AI-HUB-workspace'],
    'destructive'
  ),
  (
    'explode_entities',
    'C:\Program Files\Autodesk\AutoCAD 2025\acad.exe',
    array['._EXPLODE'],
    array['C:\NH-AI-HUB-workspace'],
    'destructive'
  )
on conflict (command_name) do nothing;
