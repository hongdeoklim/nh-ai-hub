-- -----------------------------------------------------------------------------
-- 사용자별 외부 서비스 연동 (OAuth 자격 증명은 Edge Functions + 서비스 롤만 접근)
-- -----------------------------------------------------------------------------

CREATE TABLE public.user_integration_accounts (
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (
    provider IN ('google', 'notion')
  ),
  connected_at timestamptz NOT NULL DEFAULT now(),
  provider_account_email text NULL,
  scopes text NULL,

  CONSTRAINT user_integration_accounts_pkey PRIMARY KEY (user_id, provider)
);

COMMENT ON TABLE public.user_integration_accounts IS '연동 상태 요약(민감 정보 없음). 자격 증명은 user_integration_credentials 참조.';
COMMENT ON COLUMN public.user_integration_accounts.provider IS 'google: Drive·Calendar·Sheets 등 Google Workspace 스코프 묶음; notion: 추후';

ALTER TABLE public.user_integration_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_integration_accounts_select_own
  ON public.user_integration_accounts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE public.user_integration_credentials (
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (
    provider IN ('google', 'notion')
  ),
  ciphertext text NOT NULL,
  iv text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_integration_credentials_pkey PRIMARY KEY (user_id, provider)
);

COMMENT ON TABLE public.user_integration_credentials IS '암호화된 리프레시 토큰 등. RLS 정책 없음 → 일반 클라이언트는 접근 불가, 서비스 롤(Edge)만 사용.';

ALTER TABLE public.user_integration_credentials ENABLE ROW LEVEL SECURITY;
