-- -----------------------------------------------------------------------------
-- [25단계] Google OAuth 액세스/리프레시 토큰 캐시 (google-agent Edge Function)
-- 기존 user_integration_credentials(암호화 refresh)와 병행합니다.
-- Edge Function은 service_role로 upsert하고, 사용자는 본인 행만 RLS로 조회 가능합니다.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_oauth_tokens (
  id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'google'
    CHECK (provider IN ('google')),
  access_token text NOT NULL DEFAULT '',
  refresh_token text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_oauth_tokens_pkey PRIMARY KEY (id, provider)
);

COMMENT ON TABLE public.user_oauth_tokens IS
  'Google Workspace agent용 OAuth 토큰 캐시. id = users.id. refresh는 integration 연동과 동기화될 수 있음.';
COMMENT ON COLUMN public.user_oauth_tokens.access_token IS '단기 Google access_token (만료 시 google-agent가 갱신)';
COMMENT ON COLUMN public.user_oauth_tokens.refresh_token IS 'Google refresh_token (없으면 user_integration_credentials에서 bootstrap)';

CREATE INDEX IF NOT EXISTS user_oauth_tokens_provider_expires_idx
  ON public.user_oauth_tokens (provider, expires_at DESC);

ALTER TABLE public.user_oauth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_oauth_tokens_select_own ON public.user_oauth_tokens;
CREATE POLICY user_oauth_tokens_select_own
  ON public.user_oauth_tokens
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS user_oauth_tokens_insert_own ON public.user_oauth_tokens;
CREATE POLICY user_oauth_tokens_insert_own
  ON public.user_oauth_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id AND provider = 'google');

DROP POLICY IF EXISTS user_oauth_tokens_update_own ON public.user_oauth_tokens;
CREATE POLICY user_oauth_tokens_update_own
  ON public.user_oauth_tokens
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND provider = 'google');

DROP POLICY IF EXISTS user_oauth_tokens_delete_own ON public.user_oauth_tokens;
CREATE POLICY user_oauth_tokens_delete_own
  ON public.user_oauth_tokens
  FOR DELETE
  TO authenticated
  USING (auth.uid() = id);
