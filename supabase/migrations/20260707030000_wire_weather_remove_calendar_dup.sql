-- Wire the KMA weather forecast public-data entry to a real bridge that
-- reuses the app's existing data.go.kr service key (same one search_public_data
-- already uses) — no new per-user credential needed, so switch it to
-- auth_type='none' / connection_mode='admin_shared'.
update public.plugins
set
  is_active = true,
  endpoint_url = 'https://wndnjrcljdvbnezfpisb.supabase.co/functions/v1/plugin-weather-bridge',
  auth_type = 'none',
  connection_mode = 'admin_shared',
  config_schema = '{}'::jsonb,
  manifest = '{"icon":"⛅","tools":[{"name":"nh_get_kma_weather","description":"주요 도시의 기상청 단기예보를 반환합니다."}]}'::jsonb
where plugin_id = 'nh.public-data.weather-forecast';

-- The marketplace-seeded "Google Calendar" plugin was a non-functional
-- duplicate of the app's real, working native Google Workspace integration
-- (assistant-02-calendar / google-agent-core.ts manageCalendarEvent, wired
-- via OAuth refresh tokens, not this plugin system). Rather than build a
-- second, redundant calendar path, remove the decorative marketplace entry.
delete from public.plugins where plugin_id = 'nh.plugin.google-calendar';

-- nh.mcp.filesystem, nh.mcp.database, nh.public-data.stats-korea (KOSIS)
-- remain disabled: filesystem/database MCP need a real, separately-hosted
-- MCP server plus an explicit decision on what's exposed (security-sensitive,
-- not something to wire up unilaterally); KOSIS needs each user to obtain
-- their own KOSIS API key and its data API requires a multi-step table
-- lookup that wasn't implemented this round.
