-- Productivity platform integrations
-- Google Workspace, Microsoft 365, KakaoTalk/KakaoWork, HWP(한글), Zoom, Naver Works, Notion, Dropbox
-- Each row is a separate INSERT to avoid parser truncation.

-- ════════════════════════════════════════════════════════════════
-- GOOGLE WORKSPACE
-- ════════════════════════════════════════════════════════════════

-- ── Google Drive ─────────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.google-drive',
  'Google Drive',
  'Google Drive API로 파일·폴더를 검색하고, 파일 목록 조회, 공유 설정, 다운로드 링크 생성을 AI 채팅에서 바로 처리합니다. 팀 공유 드라이브도 지원합니다.',
  'Google',
  'google_workspace',
  'plugin',
  '["drive.read","drive.write"]',
  'bearer',
  'Authorization',
  'per_user',
  '{}',
  '{"icon":"💾","oauth":true,"tools":[{"name":"nh_gdrive_search","description":"Drive에서 파일을 검색합니다."},{"name":"nh_gdrive_list_folder","description":"폴더 내 파일 목록을 조회합니다."},{"name":"nh_gdrive_get_file_link","description":"파일 공유 링크를 생성합니다."},{"name":"nh_gdrive_upload","description":"파일을 Drive에 업로드합니다."},{"name":"nh_gdrive_move","description":"파일을 다른 폴더로 이동합니다."}],"docs_url":"https://developers.google.com/drive/api"}',
  'nh_gdrive_search',
  'builtin://google-drive',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Google Sheets ─────────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.google-sheets',
  'Google Sheets',
  'Google Sheets API로 스프레드시트 데이터를 읽고 쓰며, 셀 범위 조회·업데이트·수식 삽입·새 시트 생성을 AI 채팅에서 처리합니다. 발전량 집계, 렌탈 현황표 자동화에 활용합니다.',
  'Google',
  'google_workspace',
  'plugin',
  '["sheets.read","sheets.write"]',
  'bearer',
  'Authorization',
  'per_user',
  '{}',
  '{"icon":"📊","oauth":true,"tools":[{"name":"nh_sheets_read_range","description":"셀 범위 데이터를 읽습니다."},{"name":"nh_sheets_write_range","description":"셀 범위에 데이터를 씁니다."},{"name":"nh_sheets_append_rows","description":"시트 하단에 행을 추가합니다."},{"name":"nh_sheets_create_sheet","description":"새 시트를 생성합니다."},{"name":"nh_sheets_get_metadata","description":"스프레드시트 구조와 시트 목록을 조회합니다."}],"docs_url":"https://developers.google.com/sheets/api"}',
  'nh_sheets_read_range',
  'builtin://google-sheets',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Google Docs ───────────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.google-docs',
  'Google Docs',
  'Google Docs API로 문서를 생성·편집하고, 특정 텍스트 검색 및 교체, 문서 내용 요약을 AI 채팅에서 처리합니다. 계약서·보고서·제안서 초안 자동 작성에 활용합니다.',
  'Google',
  'google_workspace',
  'plugin',
  '["docs.read","docs.write"]',
  'bearer',
  'Authorization',
  'per_user',
  '{}',
  '{"icon":"📝","oauth":true,"tools":[{"name":"nh_gdocs_read","description":"Google Docs 문서 내용을 읽습니다."},{"name":"nh_gdocs_create","description":"새 Google Docs 문서를 생성합니다."},{"name":"nh_gdocs_insert_text","description":"문서에 텍스트를 삽입합니다."},{"name":"nh_gdocs_replace_text","description":"문서 내 텍스트를 검색·교체합니다."},{"name":"nh_gdocs_export_pdf","description":"문서를 PDF로 내보냅니다."}],"docs_url":"https://developers.google.com/docs/api"}',
  'nh_gdocs_read',
  'builtin://google-docs',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Google Slides ─────────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.google-slides',
  'Google Slides',
  'Google Slides API로 프레젠테이션을 생성하고, 슬라이드 추가·텍스트 교체·이미지 삽입을 자동화합니다. 영업 제안서·발표 자료 대량 제작에 활용합니다.',
  'Google',
  'google_workspace',
  'plugin',
  '["slides.read","slides.write"]',
  'bearer',
  'Authorization',
  'per_user',
  '{}',
  '{"icon":"📋","oauth":true,"tools":[{"name":"nh_gslides_read","description":"프레젠테이션 슬라이드 목록과 내용을 읽습니다."},{"name":"nh_gslides_create","description":"새 프레젠테이션을 생성합니다."},{"name":"nh_gslides_add_slide","description":"슬라이드를 추가합니다."},{"name":"nh_gslides_replace_text","description":"슬라이드 내 텍스트를 일괄 교체합니다."},{"name":"nh_gslides_export_pdf","description":"프레젠테이션을 PDF로 내보냅니다."}],"docs_url":"https://developers.google.com/slides/api"}',
  'nh_gslides_read',
  'builtin://google-slides',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Gmail ─────────────────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.gmail',
  'Gmail',
  'Gmail API로 받은편지함 조회, 메일 검색, 초안 작성, 발송을 AI 채팅에서 처리합니다. 고객 문의 메일 자동 분류, 미답변 메일 알림에 활용합니다.',
  'Google',
  'google_workspace',
  'plugin',
  '["gmail.read","gmail.send"]',
  'bearer',
  'Authorization',
  'per_user',
  '{}',
  '{"icon":"📧","oauth":true,"tools":[{"name":"nh_gmail_list","description":"받은편지함 메일 목록을 조회합니다."},{"name":"nh_gmail_search","description":"메일을 키워드·발신자로 검색합니다."},{"name":"nh_gmail_read","description":"메일 내용을 읽습니다."},{"name":"nh_gmail_send","description":"메일을 발송합니다."},{"name":"nh_gmail_create_draft","description":"메일 초안을 저장합니다."},{"name":"nh_gmail_reply","description":"메일에 답장합니다."}],"docs_url":"https://developers.google.com/gmail/api"}',
  'nh_gmail_list',
  'builtin://gmail',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Google Workspace MCP ──────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.mcp.google-workspace',
  'Google Workspace MCP',
  'Google 공식 MCP 서버로 Drive·Docs·Sheets·Slides·Gmail·Calendar를 AI 채팅에서 통합 제어합니다. 개별 플러그인보다 더 깊은 자동화가 가능합니다.',
  'Google',
  'google_workspace',
  'mcp',
  '["drive.read","drive.write","docs.read","docs.write","sheets.read","sheets.write","gmail.read","gmail.send"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["client_id","client_secret"],"properties":{"client_id":{"type":"string","description":"Google OAuth2 Client ID"},"client_secret":{"type":"string","description":"Google OAuth2 Client Secret"},"server_url":{"type":"string","description":"Google Workspace MCP 서버 URL (기본값 사용 권장)"}}}',
  '{"icon":"🔵","mcp":true,"transport":"http","setup":"Google Cloud Console에서 OAuth2 앱을 생성하고 Workspace API를 활성화한 뒤 Client ID와 Secret을 입력하세요.","tools":["search_drive","read_doc","write_doc","read_sheet","write_sheet","send_gmail","list_calendar","create_event"]}',
  'nh_mcp_google_workspace',
  null,
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ════════════════════════════════════════════════════════════════
-- MICROSOFT 365
-- ════════════════════════════════════════════════════════════════

-- ── Microsoft Graph API (Excel·Word·PPT·OneDrive 통합) ────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.ms-graph',
  'Microsoft 365 (Graph API)',
  'Microsoft Graph API로 Excel·Word·PowerPoint·OneDrive·Outlook을 AI 채팅에서 통합 제어합니다. 파일 검색, 내용 읽기·쓰기, 공유, 메일 발송까지 한 번에 처리합니다.',
  'Microsoft',
  'microsoft_365',
  'plugin',
  '["files.read","files.write","mail.read","mail.send"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["client_id","client_secret","tenant_id"],"properties":{"client_id":{"type":"string","description":"Azure AD App Client ID"},"client_secret":{"type":"string","description":"Azure AD App Client Secret"},"tenant_id":{"type":"string","description":"Azure AD Tenant ID"}}}',
  '{"icon":"🪟","tools":[{"name":"nh_ms_search_files","description":"OneDrive·SharePoint에서 파일을 검색합니다."},{"name":"nh_ms_read_excel","description":"Excel 워크시트 데이터를 읽습니다."},{"name":"nh_ms_write_excel","description":"Excel 셀에 데이터를 씁니다."},{"name":"nh_ms_read_word","description":"Word 문서 내용을 읽습니다."},{"name":"nh_ms_create_word","description":"Word 문서를 생성합니다."},{"name":"nh_ms_read_ppt","description":"PowerPoint 슬라이드 내용을 읽습니다."},{"name":"nh_ms_send_outlook","description":"Outlook 메일을 발송합니다."},{"name":"nh_ms_list_mail","description":"받은편지함 메일을 조회합니다."}],"docs_url":"https://learn.microsoft.com/graph/overview"}',
  'nh_ms_search_files',
  'builtin://ms-graph',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Microsoft Teams ───────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.ms-teams',
  'Microsoft Teams',
  'Microsoft Teams Graph API로 채널 메시지 조회·발송, 팀 목록 확인, 회의 일정 생성을 AI 채팅에서 처리합니다.',
  'Microsoft',
  'microsoft_365',
  'plugin',
  '["teams.read","teams.send"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["client_id","client_secret","tenant_id"],"properties":{"client_id":{"type":"string","description":"Azure AD App Client ID"},"client_secret":{"type":"string","description":"Azure AD App Client Secret"},"tenant_id":{"type":"string","description":"Azure AD Tenant ID"}}}',
  '{"icon":"💬","tools":[{"name":"nh_teams_list_channels","description":"팀 채널 목록을 조회합니다."},{"name":"nh_teams_send_message","description":"채널에 메시지를 전송합니다."},{"name":"nh_teams_get_messages","description":"채널 최근 메시지를 조회합니다."},{"name":"nh_teams_create_meeting","description":"Teams 온라인 회의를 생성합니다."}],"docs_url":"https://learn.microsoft.com/graph/api/resources/teams-api-overview"}',
  'nh_teams_list_channels',
  'builtin://ms-teams',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Microsoft 365 MCP (로컬 Office 앱 연동) ──────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.mcp.ms-office',
  'Microsoft Office MCP (로컬)',
  '로컬에 설치된 Excel·Word·PowerPoint를 Office JavaScript Add-in 브릿지로 AI 채팅과 연결합니다. 현재 열린 파일을 직접 편집하거나, 매크로 실행, 차트 생성을 자동화합니다.',
  'Community / Microsoft',
  'microsoft_365',
  'mcp',
  '["office.read","office.write"]',
  'none',
  'Authorization',
  'per_user',
  '{"type":"object","required":["server_url"],"properties":{"server_url":{"type":"string","description":"Office MCP 브릿지 서버 URL (예: http://localhost:4010)"}}}',
  '{"icon":"🪟","mcp":true,"transport":"http","setup":"Office Add-in 사이드로드 또는 AppSource를 통해 MCP 브릿지 애드인을 설치하면 로컬 서버가 실행됩니다.","tools":["excel_read_sheet","excel_write_cell","excel_run_macro","excel_create_chart","word_read_doc","word_insert_text","word_replace_text","ppt_read_slides","ppt_add_slide","ppt_replace_text"]}',
  'nh_mcp_ms_office',
  null,
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ════════════════════════════════════════════════════════════════
-- 카카오 (KakaoTalk / KakaoWork)
-- ════════════════════════════════════════════════════════════════

-- ── 카카오워크 (KakaoWork — 기업 메신저) ─────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.kakaowork',
  '카카오워크 메신저',
  '카카오워크 API로 특정 사용자·채널에 메시지를 전송하고, 봇 메시지 발송, 대화방 생성, 사용자 목록 조회를 AI 채팅에서 처리합니다. 사내 공지·업무 알림 자동화에 활용합니다.',
  'Kakao',
  'messenger',
  'plugin',
  '["kakaowork.send","kakaowork.read"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["app_key"],"properties":{"app_key":{"type":"string","description":"카카오워크 App Key (Developers 콘솔)"}}}',
  '{"icon":"💛","tools":[{"name":"nh_kakaowork_send_message","description":"카카오워크 사용자 또는 채널에 메시지를 보냅니다."},{"name":"nh_kakaowork_send_block","description":"버튼·이미지가 포함된 블록 메시지를 전송합니다."},{"name":"nh_kakaowork_list_users","description":"워크스페이스 구성원 목록을 조회합니다."},{"name":"nh_kakaowork_create_dm","description":"1:1 대화를 시작합니다."}],"docs_url":"https://docs.kakaowork.com/docs"}',
  'nh_kakaowork_send_message',
  'builtin://kakaowork',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 카카오 알림톡 (고객 대상 메시지) ────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.kakao-alimtalk',
  '카카오 알림톡',
  '카카오 비즈메시지 API로 고객의 카카오톡으로 계약 만료 안내, 렌탈 일정 알림, 여행 예약 확인 등 공식 알림톡을 발송합니다.',
  'Kakao',
  'messenger',
  'plugin',
  '["alimtalk.send"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["api_key","sender_key"],"properties":{"api_key":{"type":"string","description":"카카오 비즈메시지 API Key"},"sender_key":{"type":"string","description":"발신 프로필 키 (카카오채널 연결)"}}}',
  '{"icon":"🟡","tools":[{"name":"nh_alimtalk_send","description":"고객에게 알림톡 메시지를 발송합니다."},{"name":"nh_alimtalk_send_bulk","description":"고객 목록에 알림톡을 일괄 발송합니다."},{"name":"nh_alimtalk_get_templates","description":"등록된 알림톡 템플릿 목록을 조회합니다."}],"docs_url":"https://business.kakao.com/info/bizmessage/"}',
  'nh_alimtalk_send',
  'builtin://kakao-alimtalk',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ════════════════════════════════════════════════════════════════
-- 한글 (HWP / Hancom)
-- ════════════════════════════════════════════════════════════════

-- ── Hancom Docs API (클라우드 한컴 문서) ─────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.hancom-docs',
  'Hancom Docs (한컴독스)',
  '한컴 Docs API로 한글(.hwp·.hwpx) 문서를 생성·편집하고, 내용을 읽어 AI로 분석하거나 요약합니다. 공문서·보고서·계약서를 한글 형식으로 자동 생성합니다.',
  '한글과컴퓨터',
  'hancom',
  'plugin',
  '["docs.read","docs.write"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["client_id","client_secret"],"properties":{"client_id":{"type":"string","description":"한컴Docs API Client ID"},"client_secret":{"type":"string","description":"한컴Docs API Client Secret"}}}',
  '{"icon":"🇰🇷","tools":[{"name":"nh_hwp_read","description":"한글 문서 내용을 텍스트로 읽습니다."},{"name":"nh_hwp_create","description":"새 한글 문서를 생성합니다."},{"name":"nh_hwp_replace_text","description":"문서 내 텍스트를 검색·교체합니다."},{"name":"nh_hwp_export_pdf","description":"한글 문서를 PDF로 변환합니다."},{"name":"nh_hwp_list_docs","description":"한컴Docs 문서 목록을 조회합니다."}],"docs_url":"https://www.hancom.com/etc/hancomDocs.do"}',
  'nh_hwp_read',
  'builtin://hancom-docs',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 한글 MCP (로컬 HWP 앱 연동) ─────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.mcp.hwp',
  '한글(HWP) MCP',
  '로컬에 설치된 한글 오피스를 HWP COM API 브릿지로 AI 채팅에 연결합니다. 공문서 양식에 데이터 자동 입력, 표 생성, 문서 내보내기, 인쇄 자동화가 가능합니다.',
  '한글과컴퓨터 / Community',
  'hancom',
  'mcp',
  '["hwp.read","hwp.write"]',
  'none',
  'Authorization',
  'per_user',
  '{"type":"object","required":["server_url"],"properties":{"server_url":{"type":"string","description":"HWP MCP 브릿지 서버 URL (예: http://localhost:4020)"},"hwp_base_path":{"type":"string","description":"HWP 파일 기본 경로"}}}',
  '{"icon":"🇰🇷","mcp":true,"transport":"http","setup":"한글 오피스가 설치된 PC에서 HWP COM 브릿지 실행파일(hwp-mcp-bridge.exe)을 실행하면 로컬 MCP 서버가 시작됩니다. Windows 전용.","tools":["open_hwp","read_text","insert_text","replace_text","fill_table","insert_image","export_pdf","print_doc","run_macro"]}',
  'nh_mcp_hwp',
  null,
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ════════════════════════════════════════════════════════════════
-- 추가 협업 도구
-- ════════════════════════════════════════════════════════════════

-- ── Zoom ─────────────────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.zoom',
  'Zoom 화상회의',
  'Zoom API로 회의 생성·예약, 참석자 목록 조회, 녹화 파일 링크 가져오기, 웨비나 등록을 AI 채팅에서 처리합니다. 고객 미팅·원격 회의 운영 자동화에 활용합니다.',
  'Zoom',
  'collaboration',
  'plugin',
  '["zoom.meeting","zoom.read"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["client_id","client_secret","account_id"],"properties":{"client_id":{"type":"string","description":"Zoom Server-to-Server OAuth Client ID"},"client_secret":{"type":"string","description":"Zoom Server-to-Server OAuth Client Secret"},"account_id":{"type":"string","description":"Zoom Account ID"}}}',
  '{"icon":"📹","tools":[{"name":"nh_zoom_create_meeting","description":"Zoom 회의를 생성합니다."},{"name":"nh_zoom_list_meetings","description":"예약된 회의 목록을 조회합니다."},{"name":"nh_zoom_get_recording","description":"회의 녹화 파일 링크를 가져옵니다."},{"name":"nh_zoom_delete_meeting","description":"회의를 취소합니다."}],"docs_url":"https://developers.zoom.us/docs/api/"}',
  'nh_zoom_create_meeting',
  'builtin://zoom',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Naver Works (LINE WORKS) ─────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.naver-works',
  'Naver Works (LINE WORKS)',
  'LINE WORKS API로 채널 메시지 발송, 멤버 조회, 캘린더 일정 추가, 공지 등록을 AI 채팅에서 처리합니다. 네이버 웍스를 사용하는 팀의 업무 자동화에 활용합니다.',
  'Naver / LINE',
  'messenger',
  'plugin',
  '["works.send","works.read"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["client_id","client_secret","service_account"],"properties":{"client_id":{"type":"string","description":"LINE WORKS API Client ID"},"client_secret":{"type":"string","description":"LINE WORKS API Client Secret"},"service_account":{"type":"string","description":"서비스 계정 ID"}}}',
  '{"icon":"🟩","tools":[{"name":"nh_works_send_message","description":"채널 또는 멤버에게 메시지를 발송합니다."},{"name":"nh_works_list_members","description":"워크스페이스 구성원을 조회합니다."},{"name":"nh_works_post_board","description":"게시판에 공지를 등록합니다."},{"name":"nh_works_create_calendar","description":"캘린더 일정을 생성합니다."}],"docs_url":"https://developers.worksmobile.com/kr/docs/"}',
  'nh_works_send_message',
  'builtin://naver-works',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Notion ────────────────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.notion',
  'Notion',
  'Notion API로 페이지 생성·편집, 데이터베이스 조회·필터링, 블록 추가를 AI 채팅에서 처리합니다. 프로젝트 관리, 회의록 자동 저장, 업무 현황 대시보드에 활용합니다.',
  'Notion',
  'collaboration',
  'plugin',
  '["notion.read","notion.write"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["api_key"],"properties":{"api_key":{"type":"string","description":"Notion Integration API Key"}}}',
  '{"icon":"📓","tools":[{"name":"nh_notion_search","description":"Notion 페이지와 데이터베이스를 검색합니다."},{"name":"nh_notion_read_page","description":"페이지 내용을 읽습니다."},{"name":"nh_notion_create_page","description":"새 페이지를 생성합니다."},{"name":"nh_notion_append_block","description":"페이지에 블록을 추가합니다."},{"name":"nh_notion_query_database","description":"데이터베이스를 필터·정렬하여 조회합니다."},{"name":"nh_notion_add_db_row","description":"데이터베이스에 새 항목을 추가합니다."}],"docs_url":"https://developers.notion.com/"}',
  'nh_notion_search',
  'builtin://notion',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Dropbox ───────────────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.dropbox',
  'Dropbox',
  'Dropbox API로 파일·폴더 조회, 업로드·다운로드, 공유 링크 생성, 팀 폴더 관리를 AI 채팅에서 처리합니다. 도면·견적서·계약서 파일 공유 자동화에 활용합니다.',
  'Dropbox',
  'collaboration',
  'plugin',
  '["files.read","files.write","sharing.write"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["app_key","app_secret"],"properties":{"app_key":{"type":"string","description":"Dropbox App Key"},"app_secret":{"type":"string","description":"Dropbox App Secret"}}}',
  '{"icon":"📦","tools":[{"name":"nh_dropbox_search","description":"파일을 이름·내용으로 검색합니다."},{"name":"nh_dropbox_list_folder","description":"폴더 내 파일 목록을 조회합니다."},{"name":"nh_dropbox_create_link","description":"파일 공유 링크를 생성합니다."},{"name":"nh_dropbox_upload","description":"파일을 Dropbox에 업로드합니다."},{"name":"nh_dropbox_move","description":"파일을 이동·복사합니다."}],"docs_url":"https://www.dropbox.com/developers/documentation/"}',
  'nh_dropbox_search',
  'builtin://dropbox',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ════════════════════════════════════════════════════════════════
-- SKILL — 플랫폼별 업무 자동화 프롬프트
-- ════════════════════════════════════════════════════════════════

-- ── Excel 데이터 분석 보고서 ──────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.excel-analysis',
  'Excel 데이터 분석 보고서',
  'Excel 데이터를 붙여넣거나 Microsoft Graph로 읽어온 데이터를 분석해 핵심 인사이트, 트렌드, 이상치를 발견하고 경영 보고서를 작성합니다.',
  'NH Internal',
  'microsoft_365',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"📊","prompt":"당신은 데이터 분석 전문가입니다. 아래 Excel 데이터를 분석하여 경영 보고서를 작성해 주세요.\n\n## 분석 항목\n1. **데이터 요약**: 행 수, 주요 컬럼, 기간\n2. **핵심 지표**: 합계, 평균, 최대·최소, 증감률\n3. **트렌드**: 기간별 변화 패턴\n4. **이상치**: 평균 대비 크게 벗어난 값\n5. **인사이트**: 비즈니스적 의미와 시사점\n6. **권고사항**: 조치가 필요한 항목\n\n## 출력 형식\n**데이터 분석 보고서**\n\n### 1. 데이터 개요\n### 2. 핵심 지표 요약\n| 지표 | 값 | 전기 대비 | 평가 |\n|------|-----|----------|------|\n\n### 3. 주요 발견 사항\n### 4. 권고 조치\n\n데이터:\n{{excel_data}}"}',
  'nh_skill_excel_analysis',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── PowerPoint 슬라이드 구성안 ────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.ppt-structure',
  'PowerPoint 슬라이드 구성안',
  '발표 목적과 청중을 입력하면 PowerPoint 슬라이드별 제목, 핵심 내용, 디자인 방향, 발표자 노트가 포함된 완성형 구성안을 생성합니다. Graph API 또는 로컬 Office MCP로 바로 적용 가능합니다.',
  'NH Internal',
  'microsoft_365',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"📑","prompt":"당신은 경영 프레젠테이션 전문가입니다. 아래 조건으로 PowerPoint 구성안을 작성해 주세요.\n\n## 입력\n- 발표 주제: {{주제}}\n- 청중: {{경영진/고객/팀 내부 등}}\n- 슬라이드 목표 수: {{n장}}\n- 핵심 메시지 3가지: {{메시지1 / 메시지2 / 메시지3}}\n- 발표 시간: {{분}}\n\n## 출력 형식\n각 슬라이드를 아래 구조로 작성하세요:\n\n---\n**[슬라이드 번호] 슬라이드 제목**\n- 레이아웃: {{제목만/제목+내용/두 콘텐츠/그림+내용 등}}\n- 핵심 내용:\n  - 불릿 1\n  - 불릿 2\n- 시각 자료: {{차트 유형/이미지 설명/표 구조}}\n- 발표자 노트: {{강조할 내용, 예상 소요 시간}}\n---\n\n마지막 슬라이드는 반드시 핵심 요약 + 다음 단계 액션으로 마무리하세요.\n\n조건:\n{{requirements}}"}',
  'nh_skill_ppt_structure',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 한글 공문서 작성 ─────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.hwp-official-doc',
  '한글 공문서 작성',
  '공문서 유형(품의서·결재문서·협조전·공문)과 내용을 입력하면 행정 표준에 맞는 한글 공문서 초안을 생성합니다. Hancom Docs API 또는 HWP MCP로 바로 파일로 저장 가능합니다.',
  'NH Internal',
  'hancom',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"🇰🇷","prompt":"당신은 행정 문서 작성 전문가입니다. 아래 요건으로 공문서를 작성해 주세요.\n\n## 입력\n- 문서 유형: {{품의서/협조전/공문/보고서/계획서}}\n- 수신: {{수신처}}\n- 제목: {{문서 제목}}\n- 핵심 내용: {{전달 내용}}\n- 요청 사항: {{승인/검토/회신 요청 등}}\n- 첨부: {{첨부파일 목록}}\n\n## 출력 형식 (한글 공문서 표준)\n\n수 신: {{수신}}\n참 조: (해당 시)\n제 목: {{제목}}\n\n1. 관련 근거\n  가. {{근거 1}}\n  나. {{근거 2}}\n\n2. 내용\n  가. {{본문 내용 1}}\n  나. {{본문 내용 2}}\n\n3. 요청 사항\n  {{요청 내용}}\n\n붙임: {{첨부파일}} 1부. 끝.\n\n⚠️ 생성된 초안을 검토 후 결재권자 확인을 받으세요.\n\n요건:\n{{requirements}}"}',
  'nh_skill_hwp_official_doc',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 카카오워크 공지사항 작성 ──────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.kakaowork-notice',
  '카카오워크 공지사항 작성',
  '공지 내용과 대상을 입력하면 카카오워크 채널에 적합한 구조화된 공지 메시지(블록 메시지 포함)를 자동 생성합니다. 긴급도별 톤·이모지 자동 적용.',
  'NH Internal',
  'messenger',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"💛","prompt":"당신은 사내 커뮤니케이션 전문가입니다. 아래 내용으로 카카오워크 공지 메시지를 작성해 주세요.\n\n## 입력\n- 공지 유형: {{긴급/일반/안내/이벤트}}\n- 수신 대상: {{전체/팀명/직급}}\n- 핵심 내용: {{공지 내용}}\n- 행동 요청: {{확인 후 회신/첨부파일 다운로드/일정 등록 등}}\n- 마감일: {{있으면 입력}}\n\n## 출력 형식\n\n[긴급도 이모지] **[제목]**\n\n안녕하세요, [발신 부서]입니다.\n\n[본문 내용 — 간결하고 명확하게 3~5줄]\n\n📌 **주요 사항**\n• 항목 1\n• 항목 2\n• 항목 3\n\n⏰ **기한**: [날짜]\n✅ **요청 사항**: [행동 요청]\n\n문의: [담당자 또는 채널]\n\n---\n*카카오워크 블록 메시지용 JSON도 함께 제공합니다.*\n\n요건:\n{{requirements}}"}',
  'nh_skill_kakaowork_notice',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Google Sheets 자동화 보고서 ───────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.sheets-report',
  'Google Sheets 자동화 보고서',
  'Google Sheets 데이터를 읽어 월간 KPI 보고서, 수익 현황표, 차량·기기 운영 현황을 자동으로 요약하고 다음 달 계획을 제안합니다.',
  'NH Internal',
  'google_workspace',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"📊","prompt":"당신은 경영 보고서 전문가입니다. 아래 Google Sheets 데이터를 바탕으로 월간 운영 보고서를 작성해 주세요.\n\n## 출력 형식\n**월간 운영 보고서**\n- 보고 기간: {{연월}}\n- 작성 부서: {{부서명}}\n\n### 1. KPI 달성 현황\n| 지표 | 목표 | 실적 | 달성률 | 전월 대비 |\n|------|------|------|-------|----------|\n\n### 2. 주요 성과\n### 3. 미달 항목 및 원인 분석\n### 4. 다음 달 계획 및 목표\n### 5. 경영진 보고용 한줄 요약\n\n데이터:\n{{sheets_data}}"}',
  'nh_skill_sheets_report',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;
