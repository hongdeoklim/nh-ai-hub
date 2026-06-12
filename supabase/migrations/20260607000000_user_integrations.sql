CREATE TABLE IF NOT EXISTS public.nh_user_integrations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(user_id, provider)
);

-- RLS 활성화
ALTER TABLE public.nh_user_integrations ENABLE ROW LEVEL SECURITY;

-- 정책 생성
CREATE POLICY "nh_integrations_select"
    ON public.nh_user_integrations
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "nh_integrations_delete"
    ON public.nh_user_integrations
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- 권한 부여
GRANT ALL ON TABLE public.nh_user_integrations TO service_role;
GRANT SELECT, DELETE ON TABLE public.nh_user_integrations TO authenticated;
