-- Deterministic workflow execution model.
-- Workflows select a server-side allow-listed action instead of relying on an LLM prompt.

alter table public.user_workflows
  add column if not exists action_key text,
  add column if not exists action_config jsonb not null default '{}'::jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

alter table public.user_workflows
  drop constraint if exists user_workflows_action_key_check;

alter table public.user_workflows
  add constraint user_workflows_action_key_check
  check (
    action_key is null or action_key in (
      'gmail_unread_summary',
      'calendar_upcoming_summary'
    )
  );

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.user_workflows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_key text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists workflow_runs_user_created_idx
  on public.workflow_runs(user_id, created_at desc);
create index if not exists workflow_runs_workflow_created_idx
  on public.workflow_runs(workflow_id, created_at desc);

alter table public.workflow_runs enable row level security;

create policy workflow_runs_select_own on public.workflow_runs
  for select to authenticated using (auth.uid() = user_id);

comment on column public.user_workflows.action_key is
  'Server allow-listed action executed by workflow-execute.';
comment on table public.workflow_runs is
  'Immutable user-visible execution history for deterministic workflows.';
