-- Wire the AutoCAD agent's last mile: expose cad-job-gateway as an AI plugin
-- tool so chat can actually queue CAD jobs (the local PC agent then polls
-- cad_jobs and executes via AutoCAD COM). auth_type='none' — the gateway is
-- called server-side and authenticates the proxy via the shared
-- X-NH-Internal-Secret (see cad-job-gateway authorize()). No per-user
-- credential; the user just needs the local agent installed + running.
-- The command whitelist (allowed_programs) still gates what can actually run,
-- and destructive commands (e.g. run_lisp) are queued as pending_approval.
insert into public.plugins (
  plugin_id, name, description, provider, category, extension_type,
  required_scopes, auth_type, auth_header_name, connection_mode,
  config_schema, manifest, tool_function_name, endpoint_url,
  setup_url, docs_url, is_active, enabled, approval_status, version
) values (
  'nh.plugin.autocad',
  'AutoCAD 원격 실행',
  '사용자 PC의 정품 AutoCAD를 화이트리스트 명령으로 원격 실행합니다(로컬 에이전트 설치 필요). arguments.command 에 실행할 명령을, 나머지 키에 인자를 넣으세요. 지원 명령: open_dwg(도면 열기, path=C:\NH-AI-HUB-workspace 하위 .dwg 경로), save_dwg(현재 도면 저장), run_lisp(AutoLISP 스크립트 실행 — 파괴적이라 관리자 승인 후 실행). 예: {"command":"open_dwg","path":"C:\\NH-AI-HUB-workspace\\plan.dwg"}. 안전 명령은 즉시 큐잉되고, 파괴적 명령은 승인 대기로 등록됩니다.',
  'NH Internal', 'developer', 'plugin',
  '[]'::jsonb, 'none', 'Authorization', 'admin_shared',
  '{"type":"object","properties":{}}'::jsonb,
  '{"icon":"📐","tools":[{"name":"nh_autocad_command","description":"AutoCAD 명령을 큐에 등록해 로컬 에이전트가 실행하게 합니다."}]}'::jsonb,
  'nh_autocad_command',
  'https://wndnjrcljdvbnezfpisb.supabase.co/functions/v1/cad-job-gateway',
  null,
  null,
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
  is_active = excluded.is_active,
  enabled = excluded.enabled,
  approval_status = excluded.approval_status,
  version = excluded.version;
