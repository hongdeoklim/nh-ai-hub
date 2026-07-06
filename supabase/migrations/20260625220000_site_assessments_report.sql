-- 보고서 메타데이터 + 전문 저장
alter table public.site_assessments
  add column if not exists report_metadata jsonb default '{}'::jsonb,
  add column if not exists report_text     text;   -- 마크다운 보고서 전문
