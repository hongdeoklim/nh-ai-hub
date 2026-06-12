-- Phase 3: Text-to-SQL DB 조회 도구를 위한 가상 사내 데이터베이스 구축
-- 실제 운영 환경에서는 이 테이블들이 내부 ERP/CRM 시스템과 연동되는 View 로 대체됩니다.

-- 1. 영업/매출 현황 테이블 (View 용도)
CREATE TABLE IF NOT EXISTS public.ai_db_view_sales (
    id serial PRIMARY KEY,
    year_quarter varchar(10) NOT NULL, -- e.g. "2025-Q1"
    department varchar(50) NOT NULL,    -- "여행사업", "시설사업", "차량사업", "미디어사업"
    revenue_krw bigint NOT NULL,        -- 매출 (원)
    profit_krw bigint NOT NULL          -- 영업이익 (원)
);

COMMENT ON TABLE public.ai_db_view_sales IS '사업부문별 분기별 실적 데이터';

-- 권한 (AI가 조회할 수 있도록 RLS는 해제하거나 인증된 사용자에게만 열어둠)
ALTER TABLE public.ai_db_view_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_db_view_sales_select ON public.ai_db_view_sales FOR SELECT TO authenticated USING (true);

-- 가상 데이터 삽입 (기존 데이터 삭제 후 삽입)
TRUNCATE TABLE public.ai_db_view_sales RESTART IDENTITY;

INSERT INTO public.ai_db_view_sales (year_quarter, department, revenue_krw, profit_krw) VALUES
('2024-Q1', '여행사업', 1500000000, 200000000),
('2024-Q1', '시설사업', 3000000000, 450000000),
('2024-Q1', '차량사업', 1200000000, 150000000),
('2024-Q1', '미디어사업', 800000000,  100000000),

('2024-Q2', '여행사업', 1800000000, 250000000),
('2024-Q2', '시설사업', 3200000000, 480000000),
('2024-Q2', '차량사업', 1300000000, 160000000),
('2024-Q2', '미디어사업', 850000000,  110000000),

('2024-Q3', '여행사업', 2000000000, 300000000),
('2024-Q3', '시설사업', 3500000000, 520000000),
('2024-Q3', '차량사업', 1400000000, 180000000),
('2024-Q3', '미디어사업', 900000000,  120000000),

('2024-Q4', '여행사업', 2500000000, 400000000),
('2024-Q4', '시설사업', 4000000000, 600000000),
('2024-Q4', '차량사업', 1500000000, 200000000),
('2024-Q4', '미디어사업', 1000000000, 150000000),

('2025-Q1', '여행사업', 1700000000, 220000000),
('2025-Q1', '시설사업', 3100000000, 460000000),
('2025-Q1', '차량사업', 1250000000, 155000000),
('2025-Q1', '미디어사업', 820000000,  105000000);


-- 2. 부서별 인원 현황 테이블 (View 용도)
CREATE TABLE IF NOT EXISTS public.ai_db_view_members (
    id serial PRIMARY KEY,
    department varchar(50) NOT NULL,
    employee_count int NOT NULL,
    budget_allocated_krw bigint NOT NULL
);

COMMENT ON TABLE public.ai_db_view_members IS '부서별 임직원 수 및 연간 예산 할당 현황';

ALTER TABLE public.ai_db_view_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_db_view_members_select ON public.ai_db_view_members FOR SELECT TO authenticated USING (true);

TRUNCATE TABLE public.ai_db_view_members RESTART IDENTITY;

INSERT INTO public.ai_db_view_members (department, employee_count, budget_allocated_krw) VALUES
('여행사업부', 45, 5000000000),
('시설사업부', 120, 15000000000),
('차량사업부', 35, 4000000000),
('미디어사업부', 25, 3000000000),
('경영지원본부', 40, 2000000000);
