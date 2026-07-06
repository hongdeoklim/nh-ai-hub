-- The marketplace seed extensions from 20260624100000 were inserted as
-- is_active=true/approval_status='approved' but their endpoint_url values
-- are placeholder strings (builtin://weather, builtin://jira, ...) or null
-- (MCP entries) that were never wired to a real backend. dynamic-plugin-tools.ts
-- treats endpoint_url as a literal fetch() target, so every one of these
-- silently fails whenever the AI actually tries to call the tool. Hiding them
-- from the marketplace/automation studio and from AI tool-loading until real
-- integrations exist.
update public.plugins
set is_active = false
where plugin_id in (
  'nh.plugin.weather',
  'nh.plugin.jira',
  'nh.plugin.slack',
  'nh.plugin.google-calendar',
  'nh.mcp.filesystem',
  'nh.mcp.github',
  'nh.mcp.database',
  'nh.skill.weekly-summary',
  'nh.skill.email-draft',
  'nh.skill.code-review',
  'nh.skill.meeting-minutes',
  'nh.public-data.weather-forecast',
  'nh.public-data.stats-korea'
);

-- Defensive: the get_weather/get_exchange_rate builtin stub tools return
-- fabricated data presented as if real (see _shared/builtin-plugin-tools.ts).
-- They were seeded is_active=false by default, but ensure that holds even if
-- an admin toggled them on via PluginManager, since the stub implementation
-- is being removed from the code-level registry in this same change.
update public.plugins
set is_active = false
where tool_function_name in ('get_weather', 'get_exchange_rate');
