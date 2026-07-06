-- Design & creative tool integrations
-- AutoCAD, SketchUp, Photoshop, Gamma, Figma, Revit/BIM, Adobe services
-- Each row is a separate INSERT to avoid parser truncation.

-- ════════════════════════════════════════════════════════════════
-- PLUGIN (Cloud API 기반)
-- ════════════════════════════════════════════════════════════════

-- ── Autodesk Platform Services (APS) ─────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.autodesk-aps',
  'Autodesk APS (도면 클라우드)',
  'Autodesk Platform Services(구 Forge) API로 DWG·RVT·IFC 파일을 클라우드에서 변환·뷰잉·분석합니다. AutoCAD·Revit 파일을 AI 채팅에서 바로 열람하고 요약할 수 있습니다.',
  'Autodesk',
  'design_tools',
  'plugin',
  '["design.read","design.convert"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["client_id","client_secret"],"properties":{"client_id":{"type":"string","description":"Autodesk APS Client ID"},"client_secret":{"type":"string","description":"Autodesk APS Client Secret"}}}',
  '{"icon":"📐","tools":[{"name":"nh_aps_translate_file","description":"DWG·RVT·IFC 파일을 웹 뷰어 형식으로 변환합니다."},{"name":"nh_aps_get_model_metadata","description":"3D 모델의 객체·레이어·속성 정보를 추출합니다."},{"name":"nh_aps_list_hubs","description":"Autodesk Drive의 프로젝트 허브 목록을 조회합니다."},{"name":"nh_aps_get_drawing_sheets","description":"도면 시트 목록과 뷰포트를 가져옵니다."}],"docs_url":"https://aps.autodesk.com/developer/overview"}',
  'nh_aps_translate_file',
  'builtin://autodesk-aps',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Trimble Connect (SketchUp 클라우드) ──────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.trimble-connect',
  'Trimble Connect (SketchUp 프로젝트)',
  'Trimble Connect API로 SketchUp 프로젝트 파일, 3D 모델, 협업 댓글, 버전 이력을 AI 채팅에서 조회합니다.',
  'Trimble',
  'design_tools',
  'plugin',
  '["design.read"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["client_id","client_secret"],"properties":{"client_id":{"type":"string","description":"Trimble Connect Client ID"},"client_secret":{"type":"string","description":"Trimble Connect Client Secret"}}}',
  '{"icon":"🏛️","tools":[{"name":"nh_trimble_list_projects","description":"Trimble Connect 프로젝트 목록을 조회합니다."},{"name":"nh_trimble_get_model","description":"3D 모델 정보와 컴포넌트 목록을 가져옵니다."},{"name":"nh_trimble_list_comments","description":"프로젝트 협업 댓글을 조회합니다."},{"name":"nh_trimble_get_versions","description":"파일 버전 이력을 조회합니다."}],"docs_url":"https://app.connect.trimble.com/tc/static/apidoc.html"}',
  'nh_trimble_list_projects',
  'builtin://trimble-connect',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Adobe Firefly (AI 이미지 생성) ───────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.adobe-firefly',
  'Adobe Firefly (AI 이미지 생성)',
  'Adobe Firefly API로 텍스트 프롬프트를 입력하면 상업적으로 안전한 AI 이미지를 생성합니다. 마케팅 시안, 건축 컨셉 이미지, 여행 홍보 비주얼 제작에 활용합니다.',
  'Adobe',
  'design_tools',
  'plugin',
  '["image.generate"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["client_id","client_secret"],"properties":{"client_id":{"type":"string","description":"Adobe Developer Console Client ID"},"client_secret":{"type":"string","description":"Adobe Developer Console Client Secret"}}}',
  '{"icon":"🎨","tools":[{"name":"nh_firefly_generate_image","description":"텍스트 설명으로 AI 이미지를 생성합니다."},{"name":"nh_firefly_expand_image","description":"이미지를 특정 방향으로 확장합니다 (Generative Fill)."},{"name":"nh_firefly_remove_background","description":"이미지 배경을 자동 제거합니다."}],"docs_url":"https://developer.adobe.com/firefly-api/"}',
  'nh_firefly_generate_image',
  'builtin://adobe-firefly',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Adobe PDF Services ────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.adobe-pdf',
  'Adobe PDF Services',
  'Adobe PDF Services API로 도면·보고서 PDF를 병합·분할·압축·OCR 처리합니다. Word·Excel 파일을 PDF로 변환하거나 PDF에서 텍스트를 추출해 AI로 분석합니다.',
  'Adobe',
  'design_tools',
  'plugin',
  '["document.read","document.write"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["client_id","client_secret"],"properties":{"client_id":{"type":"string","description":"Adobe Developer Console Client ID"},"client_secret":{"type":"string","description":"Adobe Developer Console Client Secret"}}}',
  '{"icon":"📄","tools":[{"name":"nh_pdf_merge","description":"여러 PDF를 하나로 병합합니다."},{"name":"nh_pdf_split","description":"PDF를 페이지 범위로 분할합니다."},{"name":"nh_pdf_extract_text","description":"PDF에서 텍스트와 표를 추출합니다."},{"name":"nh_pdf_ocr","description":"스캔 PDF에 OCR을 적용해 검색 가능하게 만듭니다."},{"name":"nh_pdf_convert","description":"Word·Excel·PPT를 PDF로 변환합니다."}],"docs_url":"https://developer.adobe.com/document-services/apis/pdf-services/"}',
  'nh_pdf_merge',
  'builtin://adobe-pdf',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Figma REST API ────────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.figma',
  'Figma 디자인 연동',
  'Figma REST API로 디자인 파일의 컴포넌트, 에셋, 색상 팔레트, 텍스트를 추출합니다. 마케팅·미디어 디자인 시안을 AI 채팅에서 바로 검토하고 피드백을 작성합니다.',
  'Figma',
  'design_tools',
  'plugin',
  '["design.read"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["access_token"],"properties":{"access_token":{"type":"string","description":"Figma Personal Access Token"}}}',
  '{"icon":"🎯","tools":[{"name":"nh_figma_get_file","description":"Figma 파일의 페이지·프레임·레이어 구조를 가져옵니다."},{"name":"nh_figma_get_components","description":"컴포넌트 목록과 속성을 추출합니다."},{"name":"nh_figma_export_assets","description":"이미지·아이콘 에셋을 내보냅니다."},{"name":"nh_figma_get_comments","description":"디자인 코멘트 목록을 조회합니다."},{"name":"nh_figma_post_comment","description":"디자인에 코멘트를 추가합니다."}],"docs_url":"https://www.figma.com/developers/api"}',
  'nh_figma_get_file',
  'builtin://figma',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Canva Connect API ────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.canva',
  'Canva 디자인 자동화',
  'Canva Connect API로 브랜드 템플릿에 텍스트·이미지를 자동 채워 홍보 이미지, 명함, 현수막, SNS 카드뉴스를 대량 생성합니다.',
  'Canva',
  'design_tools',
  'plugin',
  '["design.read","design.write"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["client_id","client_secret"],"properties":{"client_id":{"type":"string","description":"Canva Connect Client ID"},"client_secret":{"type":"string","description":"Canva Connect Client Secret"}}}',
  '{"icon":"🖼️","tools":[{"name":"nh_canva_list_designs","description":"Canva 디자인 목록을 조회합니다."},{"name":"nh_canva_autofill","description":"템플릿에 데이터를 자동 입력해 디자인을 생성합니다."},{"name":"nh_canva_export","description":"디자인을 PNG·PDF·MP4로 내보냅니다."}],"docs_url":"https://www.canva.dev/docs/connect/"}',
  'nh_canva_list_designs',
  'builtin://canva',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ════════════════════════════════════════════════════════════════
-- MCP (로컬 데스크탑 앱 브릿지)
-- ════════════════════════════════════════════════════════════════

-- ── AutoCAD MCP ───────────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.mcp.autocad',
  'AutoCAD MCP',
  '로컬 AutoCAD에 MCP 브릿지를 연결해 AI 채팅에서 도면을 열고, 레이어·블록·치수를 조회하며, 도면 요약 보고서를 자동 생성합니다. AutoCAD LISP 또는 .NET 플러그인으로 MCP 서버를 실행해야 합니다.',
  'Community / Autodesk',
  'design_tools',
  'mcp',
  '["cad.read","cad.write"]',
  'none',
  'Authorization',
  'per_user',
  '{"type":"object","required":["server_url"],"properties":{"server_url":{"type":"string","description":"AutoCAD MCP 브릿지 서버 URL (예: http://localhost:4001)"},"dwg_base_path":{"type":"string","description":"DWG 파일 기본 경로 (예: C:/Projects/Drawings)"}}}',
  '{"icon":"📐","mcp":true,"transport":"http","setup":"AutoCAD MCP 브릿지를 로컬에 설치해야 합니다. https://github.com/autodesk-platform-services/aps-mcp-server 참고","tools":["open_drawing","list_layers","get_layer_objects","list_blocks","get_dimensions","extract_text","get_drawing_summary","run_lisp_command"]}',
  'nh_mcp_autocad',
  null,
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── SketchUp MCP ─────────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.mcp.sketchup',
  'SketchUp MCP',
  '로컬 SketchUp에 Ruby 익스텐션 MCP 서버를 연결해 3D 모델 컴포넌트, 재질, 면적·체적을 AI 채팅에서 조회합니다. 층별 면적 산출, 마감재 수량 계산에 활용합니다.',
  'Community / Trimble',
  'design_tools',
  'mcp',
  '["3d.read"]',
  'none',
  'Authorization',
  'per_user',
  '{"type":"object","required":["server_url"],"properties":{"server_url":{"type":"string","description":"SketchUp MCP Ruby 서버 URL (예: http://localhost:4002)"}}}',
  '{"icon":"🏛️","mcp":true,"transport":"http","setup":"SketchUp Extension Manager에서 MCP 브릿지 익스텐션을 설치하면 로컬 서버가 자동 실행됩니다.","tools":["list_components","get_component_info","calculate_area","calculate_volume","list_materials","get_material_usage","export_report"]}',
  'nh_mcp_sketchup',
  null,
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Photoshop MCP ─────────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.mcp.photoshop',
  'Photoshop MCP',
  'Adobe UXP 플러그인으로 로컬 Photoshop을 AI 채팅에서 제어합니다. 레이어 편집, 텍스트 교체, 배치 내보내기, 스마트오브젝트 교체를 자동화합니다. 홍보물·카탈로그 대량 제작에 활용합니다.',
  'Community / Adobe',
  'design_tools',
  'mcp',
  '["image.read","image.write"]',
  'none',
  'Authorization',
  'per_user',
  '{"type":"object","required":["server_url"],"properties":{"server_url":{"type":"string","description":"Photoshop UXP MCP 서버 URL (예: http://localhost:4003)"},"psd_base_path":{"type":"string","description":"PSD 파일 기본 경로"}}}',
  '{"icon":"🖼️","mcp":true,"transport":"http","setup":"Photoshop UXP Developer Tool에서 MCP 브릿지 플러그인을 로드해야 합니다. Adobe UXP Plugin으로 제공됩니다.","tools":["open_psd","list_layers","toggle_layer","replace_text","replace_smart_object","export_png","export_pdf","run_action","batch_export"]}',
  'nh_mcp_photoshop',
  null,
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Revit / BIM MCP ──────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.mcp.revit',
  'Revit BIM MCP',
  'Autodesk Revit .NET 애드인으로 BIM 모델의 객체 속성, 물량 산출, 일정·비용 데이터를 AI 채팅에서 조회합니다. 건축·시설 프로젝트의 설계 검토와 물량 보고서 자동화에 활용합니다.',
  'Community / Autodesk',
  'design_tools',
  'mcp',
  '["bim.read"]',
  'none',
  'Authorization',
  'per_user',
  '{"type":"object","required":["server_url"],"properties":{"server_url":{"type":"string","description":"Revit MCP 애드인 서버 URL (예: http://localhost:4004)"}}}',
  '{"icon":"🏗️","mcp":true,"transport":"http","setup":"Revit Add-In Manager에서 MCP 브릿지 애드인(.dll)을 로드해야 합니다.","tools":["list_elements","get_element_properties","run_quantity_takeoff","get_schedule","export_to_excel","check_clashes","get_rooms","get_levels"]}',
  'nh_mcp_revit',
  null,
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Figma MCP (로컬 실시간 동기화) ───────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.mcp.figma',
  'Figma MCP (실시간)',
  'Figma 공식 MCP 서버로 현재 열린 Figma 파일의 선택 항목, 프레임, 컴포넌트를 실시간으로 AI 채팅과 동기화합니다. 디자인 피드백과 스펙 문서 자동화에 활용합니다.',
  'Figma',
  'design_tools',
  'mcp',
  '["design.read","design.write"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["access_token"],"properties":{"access_token":{"type":"string","description":"Figma Personal Access Token"},"server_url":{"type":"string","description":"Figma MCP 서버 URL (기본: https://mcp.figma.com/v1/sse)"}}}',
  '{"icon":"🎯","mcp":true,"transport":"sse","setup":"Figma 공식 MCP 서버를 사용합니다. Claude Desktop config에 figma MCP를 추가하거나 서버 URL을 입력하세요.","tools":["get_figma_data","get_node","get_selection","list_frames","get_component_set","create_annotation"]}',
  'nh_mcp_figma',
  null,
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ════════════════════════════════════════════════════════════════
-- SKILL (프롬프트 템플릿 — 각 프로그램의 작업 지시서 자동 생성)
-- ════════════════════════════════════════════════════════════════

-- ── AutoCAD 도면 검토 보고서 ─────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.autocad-review',
  'AutoCAD 도면 검토 보고서',
  '도면 정보(층별 평면, 단면, 입면)를 텍스트로 붙여넣거나 APS로 추출한 데이터를 입력하면 도면 검토 보고서와 수정 지시사항을 작성합니다.',
  'NH Internal',
  'design_tools',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"📐","prompt":"당신은 건축·시설 도면 검토 전문가입니다. 아래 도면 정보를 바탕으로 검토 보고서를 작성해 주세요.\n\n## 검토 항목\n1. **도면 완성도**: 필수 도면 종류 누락 여부 (평면·단면·입면·상세)\n2. **치수 표기**: 주요 치수 누락, 불일치 여부\n3. **레이어 정리**: 레이어 명명 규칙 준수 여부\n4. **법규 검토**: 건폐율·용적률·이격거리·주차 기준 충족 여부\n5. **설계 오류**: 구조적 문제, 동선 오류, 설비 충돌\n6. **수정 지시사항**: 우선순위별 수정 목록\n\n## 출력 형식\n**도면 검토 보고서**\n- 프로젝트명: {{프로젝트명}}\n- 도면 번호: {{도면 번호}}\n- 검토일: {{날짜}}\n\n### 항목별 검토 결과\n| 항목 | 상태 | 지적 내용 |\n|------|------|----------|\n\n### 수정 지시사항 (우선순위 순)\n1. [긴급] ...\n2. [일반] ...\n\n### 승인 조건\n\n도면 정보:\n{{drawing_data}}"}',
  'nh_skill_autocad_review',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── SketchUp 3D 모델 물량 산출 ────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.sketchup-quantity',
  'SketchUp 3D 물량 산출표',
  'SketchUp MCP로 추출한 컴포넌트·재질 데이터 또는 수동 입력 값을 기반으로 마감재 수량 산출표와 견적 보조 자료를 생성합니다.',
  'NH Internal',
  'design_tools',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"🏛️","prompt":"당신은 건축 적산 전문가입니다. 아래 3D 모델 데이터를 바탕으로 물량 산출표를 작성해 주세요.\n\n## 출력 형식\n**건축 마감재 물량 산출표**\n- 프로젝트명: {{프로젝트명}}\n- 모델 버전: {{버전}}\n\n### 부위별 면적 산출\n| 부위 | 재질 | 면적(m²) | 할증률 | 발주 수량 | 단가 | 금액 |\n|------|------|---------|-------|---------|------|------|\n\n### 공종별 소계\n| 공종 | 수량 | 금액 |\n|------|------|------|\n\n### 산출 기준 및 주의사항\n### 총 마감재 견적 (VAT 별도)\n\n3D 모델 데이터:\n{{model_data}}"}',
  'nh_skill_sketchup_quantity',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Photoshop 배치 편집 지시서 ────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.photoshop-batch',
  'Photoshop 배치 편집 지시서',
  '여러 홍보물·카탈로그 이미지를 일괄 편집할 때 필요한 Photoshop 작업 지시서(액션 목록, 레이어 구조, 내보내기 설정)를 자동 생성합니다.',
  'NH Internal',
  'design_tools',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"🖼️","prompt":"당신은 Photoshop 배치 작업 전문가입니다. 아래 요구사항으로 Photoshop 배치 편집 지시서를 작성해 주세요.\n\n## 입력\n- 작업 목적: {{홍보물/카탈로그/SNS 배너 등}}\n- 원본 파일 수: {{파일 수}}\n- 공통 변경사항: {{텍스트 교체/색상 변경/로고 추가 등}}\n- 출력 형식: {{PNG/PDF/JPEG, 해상도, 크기}}\n\n## 출력 형식\n**Photoshop 배치 작업 지시서**\n\n### PSD 레이어 구조 (권장)\n```\n[레이어 그룹 구조 예시]\n```\n\n### Photoshop 액션 단계\n1. 파일 열기\n2. ...\n\n### 스마트오브젝트 교체 목록\n| 레이어명 | 교체 내용 | 파일 경로 |\n|---------|---------|----------|\n\n### 내보내기 설정\n- 형식: {{형식}}\n- 해상도: {{DPI}}\n- 색상 프로파일: {{sRGB/CMYK}}\n\n### 예상 소요 시간\n\n요구사항:\n{{requirements}}"}',
  'nh_skill_photoshop_batch',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Gamma 프레젠테이션 슬라이드 구성안 ──────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.gamma-slides',
  'Gamma 프레젠테이션 구성안',
  '주제와 대상을 입력하면 Gamma에 바로 붙여넣을 수 있는 슬라이드별 제목, 핵심 내용, 이미지 프롬프트가 포함된 완성형 구성안을 생성합니다.',
  'NH Internal',
  'design_tools',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"✨","prompt":"당신은 프레젠테이션 기획 전문가입니다. 아래 요건으로 Gamma 슬라이드 구성안을 작성해 주세요.\nGamma(gamma.app)는 마크다운 기반으로 슬라이드를 자동 생성하므로, 각 슬라이드를 마크다운 형식으로 작성해 주세요.\n\n## 입력\n- 주제: {{발표 주제}}\n- 발표 대상: {{고객/내부/투자자 등}}\n- 슬라이드 수: {{목표 장 수}}\n- 핵심 메시지: {{전달하고 싶은 핵심}}\n- 톤: {{전문적/친근한/설득적}}\n\n## 출력 형식 (Gamma 마크다운)\n각 슬라이드는 `---`로 구분하고 아래 구조를 따르세요:\n\n```\n# [표지 제목]\n[부제목]\n[발표자 | 날짜]\n\n---\n\n## [슬라이드 제목]\n- 핵심 포인트 1\n- 핵심 포인트 2\n- 핵심 포인트 3\n\n> 💡 발표자 노트: [발표 시 강조할 내용]\n> 🖼️ 이미지 제안: [Gamma AI 이미지 생성용 프롬프트]\n\n---\n```\n\n마지막 슬라이드는 반드시 행동 촉구(CTA) 또는 Q&A 슬라이드로 마무리하세요.\n\n요건:\n{{requirements}}"}',
  'nh_skill_gamma_slides',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Canva 디자인 브리프 ────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.canva-brief',
  'Canva 디자인 브리프',
  '홍보물·SNS 카드뉴스·현수막 등 제작 목적을 입력하면 디자이너에게 전달할 Canva 디자인 브리프와 텍스트 초안을 자동 생성합니다.',
  'NH Internal',
  'design_tools',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"🖌️","prompt":"당신은 비주얼 콘텐츠 기획자입니다. 아래 정보를 바탕으로 Canva 디자인 브리프를 작성해 주세요.\n\n## 입력\n- 목적물: {{현수막/카드뉴스/포스터/명함/브로슈어}}\n- 용도: {{행사 홍보/상품 소개/고객 안내 등}}\n- 핵심 메시지: {{전달 내용}}\n- 브랜드 톤: {{신뢰감/활기찬/고급스러운}}\n- 출력 크기: {{A4/SNS 정방형/현수막 3x1m 등}}\n\n## 출력 형식\n**Canva 디자인 브리프**\n\n### 디자인 방향\n- 주 색상: {{추천 색상 코드}}\n- 폰트 스타일: {{굵고 강렬한/세련된 산세리프/손글씨}}\n- 레이아웃: {{중앙 집중형/분할형/그리드형}}\n\n### 텍스트 초안\n- 헤드라인: {{짧고 강렬한 문구}}\n- 서브카피: {{보조 설명 1~2줄}}\n- CTA: {{행동 유도 문구}}\n- 연락처/URL: {{필요 시}}\n\n### 이미지·일러스트 방향\n### Canva 검색 키워드 (템플릿 찾기용)\n### 참고 레퍼런스 스타일\n\n요건:\n{{requirements}}"}',
  'nh_skill_canva_brief',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Revit BIM 물량 보고서 ─────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.revit-quantity',
  'Revit BIM 물량 보고서',
  'Revit MCP로 추출한 물량 데이터 또는 Revit 일람표를 붙여넣으면 공종별 물량 보고서와 발주 계획표를 자동 생성합니다.',
  'NH Internal',
  'design_tools',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"🏗️","prompt":"당신은 BIM 기반 건축 적산 전문가입니다. 아래 Revit 물량 데이터로 보고서를 작성해 주세요.\n\n## 출력 형식\n**BIM 기반 물량 산출 보고서**\n- 프로젝트명: {{프로젝트명}}\n- Revit 모델 버전: {{날짜}}\n\n### 공종별 물량 요약\n| 공종 | 분류 | 수량 | 단위 | 비고 |\n|------|------|------|------|------|\n| 콘크리트 | | | m³ | |\n| 철근 | | | ton | |\n| 조적 | | | m² | |\n| 창호 | | | 개소 | |\n| 기계설비 | | | 식 | |\n\n### 층별 물량 분석\n### 전회 보고 대비 변경 사항\n### 발주 계획 (우선순위 순)\n| 공종 | 발주 시기 | 납기 | 담당자 |\n|------|---------|------|--------|\n\n### 주의사항 및 설계 변경 필요 항목\n\nRevit 물량 데이터:\n{{revit_data}}"}',
  'nh_skill_revit_quantity',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── Figma 디자인 스펙 문서 자동화 ────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.figma-spec',
  'Figma 디자인 스펙 문서',
  'Figma MCP 또는 REST API로 추출한 디자인 데이터를 입력하면 개발자 전달용 디자인 스펙 문서(색상, 타이포, 간격, 컴포넌트 동작)를 자동 생성합니다.',
  'NH Internal',
  'design_tools',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"🎯","prompt":"당신은 UI/UX 디자인 시스템 전문가입니다. 아래 Figma 디자인 데이터로 개발자 전달용 스펙 문서를 작성해 주세요.\n\n## 출력 형식\n**디자인 스펙 문서**\n- 화면/컴포넌트명: {{이름}}\n- Figma 파일: {{URL}}\n\n### 색상 시스템\n| 이름 | HEX | RGB | 사용처 |\n|------|-----|-----|--------|\n\n### 타이포그래피\n| 구분 | 폰트 | 크기 | 굵기 | 행간 |\n|------|------|------|------|------|\n\n### 간격 및 레이아웃\n- 그리드: {{컬럼 수, 거터, 마진}}\n- 주요 패딩: {{값 목록}}\n\n### 컴포넌트 스펙\n| 컴포넌트 | 상태 | 설명 | 인터랙션 |\n|---------|------|------|----------|\n\n### 애니메이션 / 전환 효과\n### 반응형 브레이크포인트\n### 접근성 체크리스트\n\nFigma 데이터:\n{{figma_data}}"}',
  'nh_skill_figma_spec',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;
