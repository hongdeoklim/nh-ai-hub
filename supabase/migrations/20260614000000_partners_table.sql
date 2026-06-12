-- 20260614000000_partners_table.sql

CREATE TABLE IF NOT EXISTS public.partners (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_name TEXT NOT NULL,
    business_number TEXT,
    representative_name TEXT,
    contact_person TEXT,
    contact_phone TEXT,
    email TEXT,
    extra_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS 활성화
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

-- 누구나 읽을 수 있는 정책 (혹은 인증된 사용자만)
CREATE POLICY "Enable read access for all authenticated users"
    ON public.partners FOR SELECT
    TO authenticated
    USING (true);

-- 샘플 데이터 삽입 (더미)
INSERT INTO public.partners (company_name, business_number, representative_name, contact_person, contact_phone, email, extra_data)
VALUES 
('NH네트웍스', '123-45-67890', '이대표', '김담당', '010-1111-2222', 'contact@nhnetworks.com', '{"industry": "IT서비스"}'::jsonb),
('농협파트너스', '234-56-78901', '박대표', '최대리', '010-3333-4444', 'help@nhpartners.com', '{"industry": "물류"}'::jsonb),
('글로벌테크', '345-67-89012', '정대표', '강사원', '010-5555-6666', 'info@globaltech.com', '{"industry": "보안 솔루션"}'::jsonb);
