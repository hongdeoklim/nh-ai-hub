-- Wire the Jira/Slack/GitHub marketplace entries to real REST bridge edge
-- functions (plugin-jira-bridge, plugin-slack-bridge, plugin-github-bridge)
-- instead of the placeholder 'builtin://...' endpoint_url values, and
-- re-enable them. Each user still needs to connect their own credential via
-- /marketplace before the tool actually works (auth_type != 'none' requires a
-- connected plugin_connections row, checked per-request in
-- dynamic-plugin-tools.ts).

-- Jira: Basic auth (email:token) built server-side in the bridge from the
-- API token (forwarded via X-Api-Token) plus install-time config
-- (jira_url, jira_email).
update public.plugins
set
  is_active = true,
  endpoint_url = 'https://wndnjrcljdvbnezfpisb.supabase.co/functions/v1/plugin-jira-bridge',
  auth_type = 'api_key',
  auth_header_name = 'X-Api-Token',
  config_schema = '{"type":"object","required":["jira_url","jira_email"],"properties":{"jira_url":{"type":"string","description":"Jira 사이트 URL (예: https://yourcompany.atlassian.net)"},"jira_email":{"type":"string","description":"Jira 계정 이메일"}}}'::jsonb,
  manifest = '{"icon":"🎫","tools":[{"name":"nh_search_jira_issues","description":"JQL로 이슈를 검색합니다."}]}'::jsonb
where plugin_id = 'nh.plugin.jira';

-- Slack: Bot User OAuth token forwarded as-is via Authorization: Bearer.
update public.plugins
set
  is_active = true,
  endpoint_url = 'https://wndnjrcljdvbnezfpisb.supabase.co/functions/v1/plugin-slack-bridge',
  manifest = '{"icon":"💬","tools":[{"name":"nh_send_slack_message","description":"채널에 메시지를 전송합니다."}]}'::jsonb
where plugin_id = 'nh.plugin.slack';

-- GitHub: was seeded as extension_type='mcp' expecting a real hosted MCP
-- server. Converting to a plain 'plugin' REST bridge delivers the same
-- practical value (search issues/PRs) without requiring a separately-hosted
-- MCP server. Personal Access Token forwarded via Authorization: Bearer.
update public.plugins
set
  is_active = true,
  extension_type = 'plugin',
  tool_function_name = 'nh_search_github_issues',
  endpoint_url = 'https://wndnjrcljdvbnezfpisb.supabase.co/functions/v1/plugin-github-bridge',
  auth_type = 'bearer',
  auth_header_name = 'Authorization',
  config_schema = '{}'::jsonb,
  manifest = '{"icon":"🐙","tools":[{"name":"nh_search_github_issues","description":"GitHub 검색 문법으로 이슈·PR을 검색합니다."}]}'::jsonb
where plugin_id = 'nh.mcp.github';
