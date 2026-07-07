-- The Jira/Slack/GitHub integrations were wired to real bridges, but their
-- plugins.setup_url / docs_url were never set, so the connect dialog
-- (PluginConnectionsPanel "키 발급 ↗" / "공식 문서 ↗" links) showed nothing —
-- a user had no idea where to obtain the API token they're being asked for.
-- Point setup_url at each service's token-issuance page and docs_url at the
-- relevant API docs.

update public.plugins
set
  setup_url = 'https://id.atlassian.com/manage-profile/security/api-tokens',
  docs_url = 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/'
where plugin_id = 'nh.plugin.jira';

update public.plugins
set
  setup_url = 'https://api.slack.com/apps',
  docs_url = 'https://api.slack.com/methods/chat.postMessage'
where plugin_id = 'nh.plugin.slack';

update public.plugins
set
  setup_url = 'https://github.com/settings/tokens',
  docs_url = 'https://docs.github.com/en/rest/search/search'
where plugin_id = 'nh.mcp.github';
