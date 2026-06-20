-- Minimal, privacy-preserving diagnostics for Assistant Router Shadow Mode.
-- This table records routing decisions only; it is not an Assistant execution log.

create table if not exists public.assistant_router_shadow_logs (
  id bigint generated always as identity primary key,
  request_type text not null,
  request_complexity text not null
    check (request_complexity in ('simple', 'standard', 'compound')),
  selection_mode text not null
    check (selection_mode in ('none', 'single', 'limited_parallel', 'sequential')),
  selected_assistant_ids text[] not null default '{}'::text[]
    check (cardinality(selected_assistant_ids) <= 3),
  selection_reason_codes text[] not null default '{}'::text[],
  cost_level text not null
    check (cost_level in ('low', 'medium', 'high')),
  fallback_reason_code text,
  candidate_count smallint not null default 0
    check (candidate_count between 0 and 3),
  decision_latency_ms integer
    check (decision_latency_ms is null or decision_latency_ms >= 0),
  router_version text not null default 'assistant-shadow-v1',
  created_at timestamptz not null default now(),
  check (candidate_count = cardinality(selected_assistant_ids))
);

create index if not exists assistant_router_shadow_logs_type_created_idx
  on public.assistant_router_shadow_logs(request_type, created_at desc);

alter table public.assistant_router_shadow_logs enable row level security;

drop policy if exists assistant_router_shadow_logs_admin_select
  on public.assistant_router_shadow_logs;
create policy assistant_router_shadow_logs_admin_select
  on public.assistant_router_shadow_logs
  for select
  to authenticated
  using (public.current_user_is_admin());

drop policy if exists assistant_router_shadow_logs_service_all
  on public.assistant_router_shadow_logs;
create policy assistant_router_shadow_logs_service_all
  on public.assistant_router_shadow_logs
  for all
  to service_role
  using (true)
  with check (true);

revoke all on public.assistant_router_shadow_logs from anon, authenticated;
grant select on public.assistant_router_shadow_logs to authenticated;
grant all on public.assistant_router_shadow_logs to service_role;
grant usage, select on sequence public.assistant_router_shadow_logs_id_seq to service_role;

comment on table public.assistant_router_shadow_logs is
  'Privacy-minimized Assistant Router Shadow Mode decisions; contains no prompt or user content.';
