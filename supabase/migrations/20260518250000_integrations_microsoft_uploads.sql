-- -----------------------------------------------------------------------------
-- 연동 provider 확장(Microsoft) · 사용자 문서 업로드 메타(HWPX·Office 등)
--
-- user_integration_* 테이블은 20260518210000_user_integrations.sql 에서 생성되지만,
-- 일부 환경에서 해당 마이그레이션 없이 본 파일만 실행되는 경우가 있어
-- 테이블이 없으면 여기서 동일 스키마(+ microsoft)로 생성합니다.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.user_integration_accounts') IS NULL THEN
    CREATE TABLE public.user_integration_accounts (
      user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
      provider text NOT NULL CHECK (
        provider IN ('google', 'notion', 'microsoft')
      ),
      connected_at timestamptz NOT NULL DEFAULT now(),
      provider_account_email text NULL,
      scopes text NULL,

      CONSTRAINT user_integration_accounts_pkey PRIMARY KEY (user_id, provider)
    );

    COMMENT ON TABLE public.user_integration_accounts IS
      '연동 상태 요약(민감 정보 없음). 자격 증명은 user_integration_credentials 참조.';
    COMMENT ON COLUMN public.user_integration_accounts.provider IS
      'google: Workspace API; notion: 예약; microsoft: Microsoft Graph(M365·Outlook 등)';

    ALTER TABLE public.user_integration_accounts ENABLE ROW LEVEL SECURITY;

    CREATE POLICY user_integration_accounts_select_own
      ON public.user_integration_accounts
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);

    CREATE TABLE public.user_integration_credentials (
      user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
      provider text NOT NULL CHECK (
        provider IN ('google', 'notion', 'microsoft')
      ),
      ciphertext text NOT NULL,
      iv text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),

      CONSTRAINT user_integration_credentials_pkey PRIMARY KEY (user_id, provider)
    );

    COMMENT ON TABLE public.user_integration_credentials IS
      '암호화된 리프레시 토큰 등. RLS 정책 없음 → 일반 클라이언트는 접근 불가, 서비스 롤(Edge)만 사용.';

    ALTER TABLE public.user_integration_credentials ENABLE ROW LEVEL SECURITY;
  ELSE
    ALTER TABLE public.user_integration_accounts
      DROP CONSTRAINT IF EXISTS user_integration_accounts_provider_check;

    ALTER TABLE public.user_integration_accounts
      ADD CONSTRAINT user_integration_accounts_provider_check CHECK (
        provider IN ('google', 'notion', 'microsoft')
      );

    ALTER TABLE public.user_integration_credentials
      DROP CONSTRAINT IF EXISTS user_integration_credentials_provider_check;

    ALTER TABLE public.user_integration_credentials
      ADD CONSTRAINT user_integration_credentials_provider_check CHECK (
        provider IN ('google', 'notion', 'microsoft')
      );

    COMMENT ON COLUMN public.user_integration_accounts.provider IS
      'google: Workspace API; notion: 예약; microsoft: Microsoft Graph(M365·Outlook 등)';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
CREATE TABLE public.user_uploaded_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (
    kind IN ('hwpx', 'hwp', 'xlsx', 'xls', 'pptx', 'ppt', 'pdf', 'csv', 'other')
  ),
  original_name text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'user-uploads',
  storage_object_path text NOT NULL,
  byte_size integer NULL,
  mime_type text NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_uploaded_documents_pkey PRIMARY KEY (id),
  CONSTRAINT user_uploaded_documents_original_name_check CHECK (
    char_length(trim(original_name)) > 0
  ),
  CONSTRAINT user_uploaded_documents_storage_path_check CHECK (
    char_length(trim(storage_object_path)) > 0
  )
);

COMMENT ON TABLE public.user_uploaded_documents IS
  'Edge Function 경유 업로드 문서 메타(HWPX 등). 바이너리는 Storage에 저장.';

CREATE INDEX user_uploaded_documents_user_created_idx
  ON public.user_uploaded_documents (user_id, created_at DESC);

ALTER TABLE public.user_uploaded_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_uploaded_documents_select_own
  ON public.user_uploaded_documents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY user_uploaded_documents_insert_own
  ON public.user_uploaded_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_uploaded_documents_delete_own
  ON public.user_uploaded_documents
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Storage 버킷 (Edge에서 서비스 롤로 업로드; 클라이언트 직접 업로드는 정책 없음)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('user-uploads', 'user-uploads', false, 52428800)
ON CONFLICT (id) DO NOTHING;
