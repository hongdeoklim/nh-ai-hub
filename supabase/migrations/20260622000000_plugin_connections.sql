-- User-connectable plugin catalog and encrypted credential storage.

alter table public.plugins
  add column if not exists auth_type text not null default 'none',
  add column if not exists auth_header_name text not null default 'Authorization',
  add column if not exists connection_mode text not null default 'admin_shared',
  add column if not exists setup_url text,
  add column if not exists docs_url text;

alter table public.plugins drop constraint if exists plugins_auth_type_check;
alter table public.plugins add constraint plugins_auth_type_check
  check (auth_type in ('none', 'bearer', 'api_key'));
alter table public.plugins drop constraint if exists plugins_connection_mode_check;
alter table public.plugins add constraint plugins_connection_mode_check
  check (connection_mode in ('per_user', 'workspace_install', 'admin_shared', 'hybrid'));

create unique index if not exists plugins_tool_function_name_unique
  on public.plugins (tool_function_name)
  where char_length(trim(tool_function_name)) > 0;

create table if not exists public.plugin_connections (
  id uuid primary key default gen_random_uuid(),
  plugin_id uuid not null references public.plugins(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_ciphertext text not null,
  credential_hint text,
  status text not null default 'untested'
    check (status in ('untested', 'connected', 'failed')),
  last_tested_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plugin_id, user_id)
);

alter table public.plugin_connections enable row level security;
-- Credentials are intentionally service-role only. Users access redacted metadata
-- through the plugin-connections Edge Function.
grant all on public.plugin_connections to service_role;
revoke all on public.plugin_connections from anon, authenticated;

create index if not exists plugin_connections_user_idx
  on public.plugin_connections(user_id, updated_at desc);

comment on column public.plugin_connections.credential_ciphertext is
  'AES-GCM encrypted credential; key is stored only in Edge Function secrets.';
