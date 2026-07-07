-- Push notifications (FCM) + biometric-login consent.
-- Stores per-user FCM device tokens and two opt-in consent flags used by the
-- My Page toggles. Actual FCM sending is done by the send-push edge function
-- (gated on FCM_SERVICE_ACCOUNT_JSON secret); this migration is just the
-- data model + RLS.

-- Consent flags on the user profile.
alter table public.users
  add column if not exists push_consent boolean not null default false,
  add column if not exists biometric_consent boolean not null default false;

-- One row per (user, browser/device) FCM registration token.
create table if not exists public.user_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null default 'web',
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (token)
);

create index if not exists user_device_tokens_user_id_idx
  on public.user_device_tokens (user_id);

alter table public.user_device_tokens enable row level security;

-- Users manage only their own tokens.
drop policy if exists user_device_tokens_select_own on public.user_device_tokens;
create policy user_device_tokens_select_own
  on public.user_device_tokens for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_device_tokens_insert_own on public.user_device_tokens;
create policy user_device_tokens_insert_own
  on public.user_device_tokens for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_device_tokens_update_own on public.user_device_tokens;
create policy user_device_tokens_update_own
  on public.user_device_tokens for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_device_tokens_delete_own on public.user_device_tokens;
create policy user_device_tokens_delete_own
  on public.user_device_tokens for delete
  to authenticated
  using (auth.uid() = user_id);

-- Audit log of admin-sent pushes (optional, admin-visible).
create table if not exists public.push_notification_log (
  id uuid primary key default gen_random_uuid(),
  sent_by uuid references auth.users(id) on delete set null,
  title text not null,
  body text not null,
  target_type text not null default 'all',
  target_value text,
  recipients_count integer not null default 0,
  success_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.push_notification_log enable row level security;

-- Admins can read the log (service role bypasses RLS for inserts from the function).
drop policy if exists push_notification_log_admin_select on public.push_notification_log;
create policy push_notification_log_admin_select
  on public.push_notification_log for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and (u.is_admin = true or u.role = 'admin')
    )
  );
