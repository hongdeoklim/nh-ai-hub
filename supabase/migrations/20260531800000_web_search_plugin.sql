-- 웹·뉴스 검색 플러그인 (Exa API · EXA_API_KEY Edge Secret 필요)
INSERT INTO public.plugins (
  id,
  name,
  description,
  tool_function_name,
  endpoint_url,
  is_active
)
VALUES (
  'a1000000-0000-4000-8000-000000000003'::uuid,
  '웹·뉴스 검색',
  'Exa API로 최신 뉴스·업계 동향·실시간 웹 정보를 검색합니다. Supabase Secret EXA_API_KEY 필요.',
  'search_web_news',
  '',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tool_function_name = EXCLUDED.tool_function_name,
  is_active = EXCLUDED.is_active,
  updated_at = now();
