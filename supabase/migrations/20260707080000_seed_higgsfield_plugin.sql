-- Higgsfield AI image generation, wired to a real REST bridge
-- (plugin-higgsfield-bridge). Like Jira/Slack/GitHub, each user connects their
-- own Higgsfield API key (KEY_ID:KEY_SECRET) via Settings → MCP·플러그인 연결;
-- the bridge turns it into `Authorization: Key ...` server-side. auth_type is
-- 'api_key' so dynamic-plugin-tools forwards the raw credential as
-- X-Higgsfield-Key without further transformation.
insert into public.plugins (
  plugin_id, name, description, provider, category, extension_type,
  required_scopes, auth_type, auth_header_name, connection_mode,
  config_schema, manifest, tool_function_name, endpoint_url,
  setup_url, docs_url, is_active, enabled, approval_status, version
) values (
  'nh.plugin.higgsfield',
  'Higgsfield 이미지 생성',
  'Higgsfield AI로 텍스트 프롬프트에서 고품질 이미지를 생성합니다. 채팅에서 이미지 설명을 주면 생성 결과 URL을 반환합니다.',
  'Higgsfield', 'creative', 'plugin',
  '["higgsfield.generate"]'::jsonb, 'api_key', 'X-Higgsfield-Key', 'per_user',
  '{"type":"object","properties":{}}'::jsonb,
  '{"icon":"🎨","tools":[{"name":"nh_generate_image_higgsfield","description":"프롬프트로 이미지를 생성합니다. 인자: prompt(필수), aspect_ratio(선택: 1:1/16:9/9:16/4:3/3:4), quality(선택), seed(선택)."}]}'::jsonb,
  'nh_generate_image_higgsfield',
  'https://wndnjrcljdvbnezfpisb.supabase.co/functions/v1/plugin-higgsfield-bridge',
  'https://cloud.higgsfield.ai/',
  'https://docs.higgsfield.ai/',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set
  name = excluded.name,
  description = excluded.description,
  provider = excluded.provider,
  category = excluded.category,
  extension_type = excluded.extension_type,
  required_scopes = excluded.required_scopes,
  auth_type = excluded.auth_type,
  auth_header_name = excluded.auth_header_name,
  connection_mode = excluded.connection_mode,
  config_schema = excluded.config_schema,
  manifest = excluded.manifest,
  tool_function_name = excluded.tool_function_name,
  endpoint_url = excluded.endpoint_url,
  setup_url = excluded.setup_url,
  docs_url = excluded.docs_url,
  is_active = excluded.is_active,
  enabled = excluded.enabled,
  approval_status = excluded.approval_status,
  version = excluded.version;
