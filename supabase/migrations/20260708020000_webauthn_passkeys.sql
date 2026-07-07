-- 생체(지문/FaceID/Windows Hello) 로그인 = WebAuthn 패스키.
-- 등록된 패스키 공개키와 1회용 challenge 를 저장한다. 실제 검증/발급은 엣지함수(webauthn)가
-- service_role 로 수행한다.

create table if not exists user_passkeys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,              -- base64url
  public_key    text not null,                     -- base64url (COSE public key bytes)
  counter       bigint not null default 0,
  transports    text[] not null default '{}',
  device_label  text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index if not exists idx_user_passkeys_user on user_passkeys(user_id);

create table if not exists webauthn_challenges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,  -- 인증(usernameless) 시 null
  challenge  text not null,
  purpose    text not null check (purpose in ('register', 'authenticate')),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  created_at timestamptz not null default now()
);
create index if not exists idx_webauthn_challenges_expires on webauthn_challenges(expires_at);

alter table user_passkeys       enable row level security;
alter table webauthn_challenges enable row level security;

-- 사용자는 본인 패스키 목록 조회/삭제 가능 (등록·검증 write 는 엣지함수 service_role).
drop policy if exists "user_read_own_passkeys" on user_passkeys;
create policy "user_read_own_passkeys" on user_passkeys
  for select using (user_id = auth.uid());

drop policy if exists "user_delete_own_passkeys" on user_passkeys;
create policy "user_delete_own_passkeys" on user_passkeys
  for delete using (user_id = auth.uid());

-- challenges 는 정책 없음 → 클라이언트 직접 접근 불가, 엣지함수(service_role)만 사용.
