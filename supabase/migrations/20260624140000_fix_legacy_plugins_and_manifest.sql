-- Fix legacy plugins that were seeded before the Marketplace was introduced.
-- These have no manifest/icon/config_schema and appear as blank cards.

-- ── 날씨 조회 (레거시) → 비활성·비공개 유지 ─────────────────────────────────
update public.plugins set
  approval_status = 'draft',
  enabled = false,
  is_active = false
where id = 'a1000000-0000-4000-8000-000000000001'::uuid;

-- ── 환율 조회 (레거시) → 비활성·비공개 유지 ─────────────────────────────────
update public.plugins set
  approval_status = 'draft',
  enabled = false,
  is_active = false
where id = 'a1000000-0000-4000-8000-000000000002'::uuid;

-- ── 웹·뉴스 검색 (레거시) → Marketplace용으로 manifest 보완 ─────────────────
-- 이 플러그인은 실제로 AI 채팅에서 사용 중이므로 Marketplace에 올바르게 표시합니다.
update public.plugins set
  provider   = 'Exa AI',
  category   = 'search',
  extension_type = 'plugin',
  required_scopes = '["web.search","news.read"]'::jsonb,
  config_schema   = '{}'::jsonb,
  manifest = '{
    "icon": "🔍",
    "tools": [
      {"name": "search_web_news", "description": "최신 뉴스·웹 정보를 검색합니다."}
    ]
  }'::jsonb,
  approval_status = 'approved',
  enabled = true,
  is_active = true,
  version = '1.0.0'
where id = 'a1000000-0000-4000-8000-000000000003'::uuid;
