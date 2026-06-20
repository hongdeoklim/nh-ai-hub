-- AI 비서 통합 로그 테이블 생성
CREATE TABLE IF NOT EXISTS public.ai_assistant_logs (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assistant_name TEXT NOT NULL, -- 예: '01_gmail_assistant'
    task_description TEXT, -- 수행한 작업 요약
    result_text TEXT, -- 추출/생성된 텍스트 결과물
    image_url TEXT, -- 구글 클라우드에 업로드된 이미지 URL (있는 경우)
    status TEXT DEFAULT 'success' -- 'success' 또는 'error'
);

-- RLS (Row Level Security) 설정 (원하는 정책으로 수정 가능)
ALTER TABLE public.ai_assistant_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role to manage assistant logs" ON public.ai_assistant_logs;
CREATE POLICY "Allow service role to manage assistant logs"
    ON public.ai_assistant_logs
    FOR ALL
    TO service_role
    USING (true);

-- (선택 사항) 인증된 사용자만 읽기 가능
DROP POLICY IF EXISTS "Allow authenticated users to read logs" ON public.ai_assistant_logs;
CREATE POLICY "Allow authenticated users to read logs"
    ON public.ai_assistant_logs
    FOR SELECT
    TO authenticated
    USING (true);
