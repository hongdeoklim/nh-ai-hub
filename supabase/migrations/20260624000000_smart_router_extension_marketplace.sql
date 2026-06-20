-- Smart Router provider expansion and installable extension marketplace.
-- Existing RAG, Dify, plugin runtime, credentials, and usage tables remain authoritative.

alter table public.ai_models drop constraint if exists ai_models_provider_check;
alter table public.ai_models add constraint ai_models_provider_check
  check (provider in ('anthropic', 'openai', 'google', 'deepseek', 'hermes', 'openrouter'));

do $$
declare
  v_has_model_name boolean;
  v_has_model_id boolean;
  v_extra_columns text := '';
  v_extra_values text := '';
  v_models jsonb := '[
    {"provider":"deepseek","display_name":"DeepSeek Chat","api_id":"deepseek-chat","model_type":"text","hint":"반복 처리, 저비용 요약 및 배치성 업무","is_active":true,"sort_order":310},
    {"provider":"deepseek","display_name":"DeepSeek Reasoner","api_id":"deepseek-reasoner","model_type":"text","hint":"수학, 분석 및 단계적 추론 업무","is_active":true,"sort_order":320},
    {"provider":"hermes","display_name":"Hermes","api_id":"hermes-default","model_type":"text","hint":"회사 내부 특화 업무용 관리자 구성 모델","is_active":true,"sort_order":410}
  ]'::jsonb;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_models' and column_name = 'model_name'
  ) into v_has_model_name;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_models' and column_name = 'model_id'
  ) into v_has_model_id;

  if v_has_model_name then
    v_extra_columns := v_extra_columns || ', model_name';
    v_extra_values := v_extra_values || ', display_name';
  end if;
  if v_has_model_id then
    v_extra_columns := v_extra_columns || ', model_id';
    v_extra_values := v_extra_values || ', api_id';
  end if;

  execute format(
    'insert into public.ai_models (
       provider, display_name, api_id, model_type, hint, is_active, sort_order%s
     )
     select provider, display_name, api_id, model_type, hint, is_active, sort_order%s
     from jsonb_to_recordset($1) as x(
       provider text, display_name text, api_id text, model_type text,
       hint text, is_active boolean, sort_order integer
     )
     on conflict (api_id) do update set
       provider = excluded.provider,
       display_name = excluded.display_name,
       hint = excluded.hint,
       updated_at = now()',
    v_extra_columns,
    v_extra_values
  ) using v_models;
end $$;

alter table public.plugins
  add column if not exists plugin_id text,
  add column if not exists provider text not null default 'internal',
  add column if not exists category text not null default 'general',
  add column if not exists extension_type text not null default 'plugin',
  add column if not exists required_scopes jsonb not null default '[]'::jsonb,
  add column if not exists config_schema jsonb not null default '{}'::jsonb,
  add column if not exists manifest jsonb not null default '{}'::jsonb,
  add column if not exists enabled boolean not null default false,
  add column if not exists approval_status text not null default 'draft',
  add column if not exists installed_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists version text not null default '1.0.0';

update public.plugins
set
  plugin_id = coalesce(nullif(trim(plugin_id), ''), 'plugin_' || replace(id::text, '-', '')),
  enabled = is_active,
  approval_status = case when is_active then 'approved' else approval_status end;

alter table public.plugins alter column plugin_id set not null;
create unique index if not exists plugins_plugin_id_unique on public.plugins(plugin_id);

alter table public.plugins drop constraint if exists plugins_extension_type_check;
alter table public.plugins add constraint plugins_extension_type_check
  check (extension_type in ('plugin', 'mcp', 'skill', 'public_data'));
alter table public.plugins drop constraint if exists plugins_approval_status_check;
alter table public.plugins add constraint plugins_approval_status_check
  check (approval_status in ('draft', 'pending', 'approved', 'rejected'));
alter table public.plugins drop constraint if exists plugins_required_scopes_array_check;
alter table public.plugins add constraint plugins_required_scopes_array_check
  check (jsonb_typeof(required_scopes) = 'array');
alter table public.plugins drop constraint if exists plugins_config_schema_object_check;
alter table public.plugins add constraint plugins_config_schema_object_check
  check (jsonb_typeof(config_schema) = 'object');

create or replace function public.sync_plugins_enabled()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.enabled = new.is_active;
  elsif new.enabled is distinct from old.enabled
    and new.is_active is not distinct from old.is_active then
    new.is_active = new.enabled;
  else
    new.enabled = new.is_active;
  end if;
  return new;
end;
$$;

drop trigger if exists plugins_sync_enabled on public.plugins;
create trigger plugins_sync_enabled
  before insert or update on public.plugins
  for each row execute function public.sync_plugins_enabled();

create table if not exists public.extension_installations (
  id uuid primary key default gen_random_uuid(),
  extension_id uuid not null references public.plugins(id) on delete cascade,
  scope_type text not null check (scope_type in ('workspace', 'department', 'user')),
  scope_id text not null,
  installed_by uuid references auth.users(id) on delete set null,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(extension_id, scope_type, scope_id)
);

create table if not exists public.extension_permissions (
  id uuid primary key default gen_random_uuid(),
  extension_id uuid not null references public.plugins(id) on delete cascade,
  subject_type text not null check (subject_type in ('user', 'department', 'role')),
  subject_id text not null,
  allowed_scopes jsonb not null default '[]'::jsonb,
  can_use boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(extension_id, subject_type, subject_id)
);

create table if not exists public.smart_router_policies (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('global', 'department', 'user')),
  scope_id text not null,
  task_type text not null,
  preferred_providers jsonb not null default '[]'::jsonb,
  preferred_models jsonb not null default '[]'::jsonb,
  fallback_models jsonb not null default '[]'::jsonb,
  max_cost_usd numeric,
  require_confirmation boolean not null default false,
  tool_policy jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scope_type, scope_id, task_type)
);

create table if not exists public.ai_usage_limits (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('user', 'department')),
  scope_id text not null,
  provider text,
  model_id text,
  period text not null default 'monthly' check (period in ('daily', 'monthly')),
  token_limit bigint,
  cost_limit_usd numeric,
  request_limit integer,
  hard_block boolean not null default true,
  warning_threshold_percent integer not null default 80
    check (warning_threshold_percent between 1 and 100),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tool_execution_logs (
  id uuid primary key default gen_random_uuid(),
  request_id text,
  user_id uuid references auth.users(id) on delete set null,
  department text,
  extension_id uuid references public.plugins(id) on delete set null,
  tool_name text not null,
  provider text,
  status text not null check (status in ('started', 'succeeded', 'failed', 'blocked')),
  latency_ms integer,
  input_summary text,
  output_summary text,
  token_usage bigint,
  cost_usd numeric,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists extension_installations_scope_idx
  on public.extension_installations(scope_type, scope_id, enabled);
create index if not exists extension_permissions_subject_idx
  on public.extension_permissions(subject_type, subject_id, can_use);
create index if not exists tool_execution_logs_user_created_idx
  on public.tool_execution_logs(user_id, created_at desc);
create index if not exists tool_execution_logs_extension_created_idx
  on public.tool_execution_logs(extension_id, created_at desc);

alter table public.extension_installations enable row level security;
alter table public.extension_permissions enable row level security;
alter table public.smart_router_policies enable row level security;
alter table public.ai_usage_limits enable row level security;
alter table public.tool_execution_logs enable row level security;

create policy extension_installations_admin_all on public.extension_installations
  for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());
create policy extension_installations_user_select on public.extension_installations
  for select to authenticated
  using (scope_type = 'user' and scope_id = auth.uid()::text);

create policy extension_permissions_admin_all on public.extension_permissions
  for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());
create policy extension_permissions_user_select on public.extension_permissions
  for select to authenticated
  using (subject_type = 'user' and subject_id = auth.uid()::text);

create policy smart_router_policies_admin_all on public.smart_router_policies
  for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());
create policy smart_router_policies_authenticated_select on public.smart_router_policies
  for select to authenticated using (enabled = true);

create policy ai_usage_limits_admin_all on public.ai_usage_limits
  for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());
create policy ai_usage_limits_user_select on public.ai_usage_limits
  for select to authenticated
  using (scope_type = 'user' and scope_id = auth.uid()::text);

create policy tool_execution_logs_admin_select on public.tool_execution_logs
  for select to authenticated using (public.current_user_is_admin());
create policy tool_execution_logs_user_select on public.tool_execution_logs
  for select to authenticated using (user_id = auth.uid());

grant all on public.extension_installations, public.extension_permissions,
  public.smart_router_policies, public.ai_usage_limits, public.tool_execution_logs
  to service_role;
grant select on public.extension_installations, public.extension_permissions,
  public.smart_router_policies, public.ai_usage_limits, public.tool_execution_logs
  to authenticated;

insert into public.plugins (
  plugin_id, name, description, provider, category, extension_type,
  required_scopes, auth_type, auth_header_name, connection_mode,
  config_schema, manifest, tool_function_name, endpoint_url,
  is_active, enabled, approval_status, version
)
values (
  'kr.go.data.public-api',
  '공공데이터 API',
  '공공데이터포털 API를 표준 도구 형태로 연결하는 비활성 기본 커넥터',
  'data.go.kr',
  'public_data',
  'public_data',
  '["public_data.read"]'::jsonb,
  'api_key',
  'serviceKey',
  'hybrid',
  '{"type":"object","properties":{"api_key":{"type":"string","secret":true},"endpoint_url":{"type":"string","format":"uri"}},"required":["api_key","endpoint_url"]}'::jsonb,
  '{"tools":[{"name":"search_public_data","description":"승인된 공공데이터 API에서 통계와 공공기관 자료를 조회합니다."}]}'::jsonb,
  'search_public_data',
  '',
  false,
  false,
  'pending',
  '1.0.0'
)
on conflict (plugin_id) do nothing;
