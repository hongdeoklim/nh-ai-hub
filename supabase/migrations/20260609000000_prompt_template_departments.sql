-- 프롬프트 템플릿 부서 분류를 공통·안전·교류·미디어·렌탈·시설로 변경
ALTER TABLE public.prompt_templates
  DROP CONSTRAINT IF EXISTS prompt_templates_department_check;

UPDATE public.prompt_templates
SET target_department = CASE target_department
  WHEN '시설공사부' THEN '시설'
  WHEN 'IT개발부' THEN '공통'
  WHEN '농업연수부' THEN '교류'
  WHEN '경영지원부' THEN '공통'
  ELSE target_department
END
WHERE target_department IN ('시설공사부', 'IT개발부', '농업연수부', '경영지원부');

ALTER TABLE public.prompt_templates
  ADD CONSTRAINT prompt_templates_department_check CHECK (
    target_department IN (
      '공통',
      '안전',
      '교류',
      '미디어',
      '렌탈',
      '시설'
    )
  );
