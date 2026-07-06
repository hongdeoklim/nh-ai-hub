-- Business-domain marketplace extensions
-- Domains: 시설(건축/부동산/태양광/신재생), 미디어, 여행, 차량렌탈, 사무기기렌탈, 공통 업무
-- Each row is a separate INSERT to avoid parser truncation.

-- ════════════════════════════════════════════════════════════════
-- PLUGIN
-- ════════════════════════════════════════════════════════════════

-- ── 부동산: 국토교통부 실거래가 조회 ──────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.realestate-price',
  '부동산 실거래가 조회',
  '국토교통부 실거래가 공개시스템 API로 아파트·오피스텔·단독주택 실거래가를 조회합니다. 지역코드, 거래 연월로 검색 가능합니다.',
  '국토교통부',
  'realestate',
  'plugin',
  '["public_data.read"]',
  'api_key',
  'Authorization',
  'admin_shared',
  '{"type":"object","required":["api_key"],"properties":{"api_key":{"type":"string","description":"공공데이터포털 API 인증키"}}}',
  '{"icon":"🏢","tools":[{"name":"nh_get_apt_trade_price","description":"아파트 실거래가를 조회합니다."},{"name":"nh_get_officetel_trade_price","description":"오피스텔 실거래가를 조회합니다."}],"portal_url":"https://www.data.go.kr/data/15057511/openapi.do"}',
  'nh_get_apt_trade_price',
  'builtin://realestate-price',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 건축: 세움터 건축인허가 조회 ─────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.building-permit',
  '건축인허가 조회 (세움터)',
  '세움터 건축행정시스템 API로 건축허가·착공·사용승인 현황을 조회합니다. 주소 또는 건물 관리번호로 검색합니다.',
  '국토교통부 세움터',
  'construction',
  'plugin',
  '["public_data.read"]',
  'api_key',
  'Authorization',
  'admin_shared',
  '{"type":"object","required":["api_key"],"properties":{"api_key":{"type":"string","description":"공공데이터포털 API 인증키"}}}',
  '{"icon":"🏗️","tools":[{"name":"nh_get_building_permit","description":"건축허가 현황을 조회합니다."},{"name":"nh_get_building_register","description":"건물 대장을 조회합니다."}],"portal_url":"https://www.eais.go.kr"}',
  'nh_get_building_permit',
  'builtin://building-permit',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 태양광: 한국에너지공단 신재생에너지 통계 ───────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.solar-energy',
  '신재생에너지 통계 (에너지공단)',
  '한국에너지공단 API로 태양광·풍력·연료전지 발전 현황, 설치 용량, REC 발급 현황 등을 조회합니다.',
  '한국에너지공단',
  'energy',
  'plugin',
  '["public_data.read"]',
  'api_key',
  'Authorization',
  'admin_shared',
  '{"type":"object","required":["api_key"],"properties":{"api_key":{"type":"string","description":"공공데이터포털 API 인증키"}}}',
  '{"icon":"☀️","tools":[{"name":"nh_get_solar_stats","description":"태양광 발전 통계를 조회합니다."},{"name":"nh_get_rec_status","description":"REC 발급 및 거래 현황을 조회합니다."},{"name":"nh_get_energy_capacity","description":"신재생에너지 설치 용량을 조회합니다."}],"portal_url":"https://www.knrec.or.kr"}',
  'nh_get_solar_stats',
  'builtin://solar-energy',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 태양광: 일사량·발전량 예측 ─────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.solar-forecast',
  '태양광 발전량 예측',
  '기상청 일사량 데이터를 기반으로 설치 예정지의 태양광 연간·월별 발전량을 추정합니다. 패널 용량, 경사각, 방위각을 입력합니다.',
  'KMA / NH Internal',
  'energy',
  'plugin',
  '["energy.read"]',
  'none',
  'Authorization',
  'admin_shared',
  '{"type":"object","required":["latitude","longitude","capacity_kw"],"properties":{"latitude":{"type":"number","description":"위도"},"longitude":{"type":"number","description":"경도"},"capacity_kw":{"type":"number","description":"설치 용량 (kW)"},"tilt":{"type":"number","description":"경사각 (도, 기본 30)"},"azimuth":{"type":"number","description":"방위각 (도, 기본 180=남향)"}}}',
  '{"icon":"⚡","tools":[{"name":"nh_estimate_solar_output","description":"연간·월별 태양광 발전량을 추정합니다."},{"name":"nh_get_irradiance","description":"지점별 일사량 데이터를 조회합니다."}]}',
  'nh_estimate_solar_output',
  'builtin://solar-forecast',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 미디어: 네이버 뉴스 검색 ──────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.naver-news',
  '네이버 뉴스 검색',
  '네이버 검색 API로 최신 뉴스를 키워드로 검색합니다. 부동산, 에너지, 건축 관련 업계 동향 파악에 활용합니다.',
  'Naver',
  'media',
  'plugin',
  '["news.read"]',
  'api_key',
  'Authorization',
  'per_user',
  '{"type":"object","required":["client_id","client_secret"],"properties":{"client_id":{"type":"string","description":"네이버 API Client ID"},"client_secret":{"type":"string","description":"네이버 API Client Secret"}}}',
  '{"icon":"📰","tools":[{"name":"nh_search_naver_news","description":"키워드로 뉴스를 검색하고 요약합니다."}],"docs_url":"https://developers.naver.com/docs/serviceapi/search/news/news.md"}',
  'nh_search_naver_news',
  'builtin://naver-news',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 미디어: YouTube Data API ───────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.youtube',
  'YouTube 콘텐츠 분석',
  'YouTube Data API로 채널 통계, 영상 조회수, 댓글 트렌드를 분석합니다. 미디어 콘텐츠 기획과 경쟁사 벤치마킹에 활용합니다.',
  'Google',
  'media',
  'plugin',
  '["media.read"]',
  'api_key',
  'Authorization',
  'per_user',
  '{"type":"object","required":["api_key"],"properties":{"api_key":{"type":"string","description":"Google API Key"}}}',
  '{"icon":"▶️","tools":[{"name":"nh_search_youtube","description":"YouTube 영상을 검색합니다."},{"name":"nh_get_channel_stats","description":"채널 통계를 조회합니다."},{"name":"nh_get_video_stats","description":"영상 조회수·댓글을 조회합니다."}]}',
  'nh_search_youtube',
  'builtin://youtube',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 여행: 한국관광공사 관광정보 ───────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.tour-korea',
  '한국관광공사 관광정보',
  '한국관광공사 TourAPI로 관광지, 숙박, 음식점, 축제·행사 정보를 조회합니다. 여행 상품 기획 및 고객 안내에 활용합니다.',
  '한국관광공사',
  'travel',
  'plugin',
  '["public_data.read"]',
  'api_key',
  'Authorization',
  'admin_shared',
  '{"type":"object","required":["api_key"],"properties":{"api_key":{"type":"string","description":"TourAPI 인증키"}}}',
  '{"icon":"🗺️","tools":[{"name":"nh_search_tourist_spot","description":"관광지 정보를 검색합니다."},{"name":"nh_search_accommodation","description":"숙박 정보를 검색합니다."},{"name":"nh_search_festival","description":"축제·행사 정보를 검색합니다."},{"name":"nh_get_area_based_list","description":"지역별 관광 콘텐츠를 조회합니다."}],"portal_url":"https://apis.data.go.kr/B551011/KorService1"}',
  'nh_search_tourist_spot',
  'builtin://tour-korea',
  true, true, 'approved', '2.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 여행: 항공편 조회 ────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.flight-search',
  '항공편 조회',
  '국토교통부 항공정보포털 API로 국내외 항공편 스케줄과 운임을 조회합니다. 출장 및 여행 상품 기획에 활용합니다.',
  '국토교통부 항공정보포털',
  'travel',
  'plugin',
  '["public_data.read"]',
  'api_key',
  'Authorization',
  'admin_shared',
  '{"type":"object","required":["api_key"],"properties":{"api_key":{"type":"string","description":"항공정보포털 API 인증키"}}}',
  '{"icon":"✈️","tools":[{"name":"nh_search_flight_schedule","description":"항공편 스케줄을 조회합니다."},{"name":"nh_get_airport_info","description":"공항 정보를 조회합니다."}],"portal_url":"https://www.airportal.go.kr"}',
  'nh_search_flight_schedule',
  'builtin://flight-search',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 차량렌탈: 차량 관리 시스템 연동 ────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.vehicle-rental',
  '차량 렌탈 관리',
  '사내 차량 렌탈 관리 시스템과 연동해 차량 가용 현황, 예약, 반납, 정비 이력을 조회합니다.',
  'NH Internal',
  'vehicle_rental',
  'plugin',
  '["vehicle.read","vehicle.write"]',
  'bearer',
  'Authorization',
  'per_user',
  '{}',
  '{"icon":"🚗","tools":[{"name":"nh_check_vehicle_availability","description":"차량 가용 현황을 조회합니다."},{"name":"nh_reserve_vehicle","description":"차량을 예약합니다."},{"name":"nh_get_vehicle_history","description":"차량 운행 및 정비 이력을 조회합니다."},{"name":"nh_get_rental_contract","description":"렌탈 계약 정보를 조회합니다."}]}',
  'nh_check_vehicle_availability',
  'builtin://vehicle-rental',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 사무기기렌탈: 계약·자산 조회 ────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.office-equipment',
  '사무기기 렌탈 관리',
  '복합기, 프로젝터, 노트북 등 사무기기 렌탈 계약 현황, 자산 위치, 만료일, AS 이력을 조회합니다.',
  'NH Internal',
  'office_rental',
  'plugin',
  '["asset.read","asset.write"]',
  'bearer',
  'Authorization',
  'per_user',
  '{}',
  '{"icon":"🖨️","tools":[{"name":"nh_list_rental_equipment","description":"렌탈 중인 사무기기 목록을 조회합니다."},{"name":"nh_get_equipment_contract","description":"사무기기 렌탈 계약 상세를 조회합니다."},{"name":"nh_check_equipment_expiry","description":"계약 만료 예정 기기를 조회합니다."},{"name":"nh_request_equipment_as","description":"AS 접수를 등록합니다."}]}',
  'nh_list_rental_equipment',
  'builtin://office-equipment',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 업무 공통: 전자결재·문서관리 ──────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.edoc',
  '전자결재 조회',
  '사내 전자결재 시스템과 연동해 기안 현황, 결재 대기 문서, 반려 사유를 AI 채팅에서 바로 확인합니다.',
  'NH Internal',
  'workflow',
  'plugin',
  '["edoc.read"]',
  'bearer',
  'Authorization',
  'per_user',
  '{}',
  '{"icon":"📄","tools":[{"name":"nh_get_pending_approvals","description":"결재 대기 중인 문서 목록을 조회합니다."},{"name":"nh_get_doc_status","description":"문서 결재 현황을 조회합니다."},{"name":"nh_search_docs","description":"기안 문서를 검색합니다."}]}',
  'nh_get_pending_approvals',
  'builtin://edoc',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 업무 공통: DART 기업공시 ────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.plugin.dart',
  'DART 기업공시 조회',
  '금융감독원 DART API로 고객사·협력사의 사업보고서, 재무제표, 공시 이력을 조회합니다. 계약 체결 전 기업 신용도 확인에 활용합니다.',
  '금융감독원',
  'finance',
  'plugin',
  '["public_data.read"]',
  'api_key',
  'Authorization',
  'admin_shared',
  '{"type":"object","required":["api_key"],"properties":{"api_key":{"type":"string","description":"DART API 인증키"}}}',
  '{"icon":"📊","tools":[{"name":"nh_search_dart_company","description":"기업 공시 정보를 검색합니다."},{"name":"nh_get_dart_financials","description":"재무제표를 조회합니다."},{"name":"nh_get_dart_disclosures","description":"최근 공시 목록을 조회합니다."}],"portal_url":"https://opendart.fss.or.kr"}',
  'nh_search_dart_company',
  'builtin://dart',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ════════════════════════════════════════════════════════════════
-- MCP
-- ════════════════════════════════════════════════════════════════

-- ── ERP 시스템 MCP ───────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.mcp.erp',
  'ERP 시스템 MCP',
  '사내 ERP(회계·구매·재고·인사)를 AI 채팅에서 자연어로 조회합니다. MCP 서버를 사내 ERP 인스턴스에 연결해 사용합니다.',
  'NH Internal',
  'erp',
  'mcp',
  '["erp.read"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["server_url","token"],"properties":{"server_url":{"type":"string","description":"ERP MCP 서버 URL"},"token":{"type":"string","description":"ERP API 인증 토큰"}}}',
  '{"icon":"🏭","mcp":true,"transport":"http","tools":["get_purchase_order","list_invoices","get_inventory","get_hr_info","get_budget_status"]}',
  'nh_mcp_erp',
  null,
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── CRM 고객관리 MCP ─────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.mcp.crm',
  'CRM 고객관리 MCP',
  '고객사 정보, 계약 이력, 미팅 노트, 영업 파이프라인을 AI 채팅에서 조회하고 업데이트합니다.',
  'NH Internal',
  'crm',
  'mcp',
  '["crm.read","crm.write"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["server_url","token"],"properties":{"server_url":{"type":"string","description":"CRM MCP 서버 URL"},"token":{"type":"string","description":"CRM API 인증 토큰"}}}',
  '{"icon":"🤝","mcp":true,"transport":"http","tools":["search_customer","get_contract_history","list_opportunities","add_meeting_note","update_deal_stage"]}',
  'nh_mcp_crm',
  null,
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 계약관리 시스템 MCP ───────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.mcp.contract',
  '계약관리 시스템 MCP',
  '시설, 렌탈, 용역 계약서를 AI 채팅에서 검색하고 만료일 알림, 갱신 예정 목록을 자동으로 확인합니다.',
  'NH Internal',
  'contract',
  'mcp',
  '["contract.read","contract.write"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["server_url","token"],"properties":{"server_url":{"type":"string","description":"계약관리 MCP 서버 URL"},"token":{"type":"string","description":"API 인증 토큰"}}}',
  '{"icon":"📑","mcp":true,"transport":"http","tools":["search_contract","get_contract_detail","list_expiring_contracts","get_renewal_schedule","add_contract_memo"]}',
  'nh_mcp_contract',
  null,
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 사내 지식베이스 MCP ───────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.mcp.knowledge-base',
  '사내 지식베이스 MCP',
  '사내 Wiki, 매뉴얼, 업무 절차서를 AI 채팅에서 자연어로 검색합니다. Notion, Confluence 등과 연결 가능합니다.',
  'NH Internal',
  'knowledge',
  'mcp',
  '["kb.read"]',
  'bearer',
  'Authorization',
  'per_user',
  '{"type":"object","required":["server_url","token"],"properties":{"server_url":{"type":"string","description":"지식베이스 MCP 서버 URL"},"token":{"type":"string","description":"API 인증 토큰"},"workspace":{"type":"string","description":"Notion/Confluence 워크스페이스 ID (선택)"}}}',
  '{"icon":"📚","mcp":true,"transport":"http","tools":["search_kb","get_page","list_recent_pages","search_procedures"]}',
  'nh_mcp_knowledge_base',
  null,
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ════════════════════════════════════════════════════════════════
-- SKILL
-- ════════════════════════════════════════════════════════════════

-- ── 건축 공사비 견적 분석 ────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.construction-cost',
  '건축 공사비 견적 분석',
  '제출된 건축 공사비 내역서를 분석해 항목별 적정성, 과다 계상 항목, 누락 항목을 검토하고 개선 의견을 제시합니다.',
  'NH Internal',
  'construction',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"🏗️","prompt":"당신은 건축 견적 전문가입니다. 아래 공사비 내역서를 분석해 주세요.\n\n## 검토 항목\n1. **항목별 적정성**: 단가·수량·금액이 시장 기준에 부합하는지\n2. **과다 계상**: 불필요하거나 중복된 항목\n3. **누락 항목**: 빠진 공종이나 자재\n4. **총액 검증**: 합계 오류 여부\n5. **개선 의견**: 절감 가능 항목 및 방법\n\n## 출력 형식\n**공사비 검토 보고서**\n- 총 견적액: {{금액}}\n- 검토 결과 요약\n\n### 항목별 검토\n| 공종 | 견적액 | 적정 여부 | 의견 |\n|------|--------|----------|------|\n\n### 주요 지적 사항\n### 절감 제안\n\n내역서:\n{{cost_breakdown}}"}',
  'nh_skill_construction_cost',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 태양광 발전량 보고서 ────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.solar-report',
  '태양광 발전량 보고서',
  '태양광 발전소의 월간 발전량, 수익, REC 현황 데이터를 입력하면 투자자·고객용 보고서를 자동 생성합니다.',
  'NH Internal',
  'energy',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"☀️","prompt":"당신은 신재생에너지 전문가입니다. 아래 데이터를 바탕으로 월간 발전소 운영 보고서를 작성해 주세요.\n\n## 출력 형식\n**태양광 발전소 월간 운영 보고서**\n- 보고 기간: {{연월}}\n- 발전소명: {{발전소명}}\n- 설치 용량: {{kW}}\n\n### 발전 현황\n- 월 발전량: {{kWh}}\n- 가동률: {{%}}\n- 전월 대비: {{+/-}}\n\n### 수익 현황\n- SMP 수익: {{원}}\n- REC 수익: {{원}}\n- 합계: {{원}}\n\n### 특이사항 및 유지보수\n{{이슈 및 점검 이력}}\n\n### 다음 달 전망\n{{일사량 예측 기반 발전량 추정}}\n\n입력 데이터:\n{{generation_data}}"}',
  'nh_skill_solar_report',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 부동산 계약서 검토 ───────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.realestate-contract',
  '부동산 계약서 검토',
  '매매·임대차 계약서 내용을 붙여넣으면 위험 조항, 누락 사항, 법적 주의사항을 분석해 검토 의견을 제시합니다.',
  'NH Internal',
  'realestate',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"🏠","prompt":"당신은 부동산 계약 전문가입니다. 아래 계약서를 검토해 주세요.\n\n## 검토 항목\n1. **필수 조항 확인**: 목적물 특정, 계약금·중도금·잔금 일정, 소유권 이전 조건\n2. **위험 조항**: 일방에 불리한 조항, 모호한 표현\n3. **특약사항 검토**: 특약이 법적으로 유효한지\n4. **법적 주의사항**: 등기 여부, 선순위 권리관계 확인 필요 항목\n5. **권고사항**: 추가하면 좋을 조항\n\n## 출력 형식\n**계약서 검토 보고서**\n\n### 요약\n- 계약 유형: {{매매/임대차}}\n- 주요 위험도: {{높음/중간/낮음}}\n\n### 항목별 검토 결과\n### 위험 조항 목록\n### 권고사항\n\n⚠️ 본 검토는 참고용이며, 법적 효력이 있는 조언은 아닙니다.\n\n계약서 내용:\n{{contract_text}}"}',
  'nh_skill_realestate_contract',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 에너지 절감 제안서 ───────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.energy-saving',
  '에너지 절감 제안서',
  '건물 또는 시설의 에너지 사용 현황을 입력하면 절감 방안(태양광, LED 교체, 단열 등)과 투자 회수 기간을 포함한 제안서를 작성합니다.',
  'NH Internal',
  'energy',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"💡","prompt":"당신은 에너지 효율화 컨설턴트입니다. 아래 시설 정보를 바탕으로 에너지 절감 제안서를 작성해 주세요.\n\n## 출력 형식\n**에너지 절감 종합 제안서**\n\n### 현황 분석\n- 연간 에너지 사용량: {{kWh}}\n- 연간 에너지 비용: {{원}}\n\n### 절감 방안\n| 방안 | 예상 절감량 | 투자비 | 회수 기간 | 우선순위 |\n|------|------------|--------|----------|--------|\n| 태양광 설치 | | | | |\n| LED 조명 교체 | | | | |\n| 단열 보강 | | | | |\n| 고효율 설비 교체 | | | | |\n\n### 정부 지원금 현황\n{{관련 보조금·세액공제 안내}}\n\n### 실행 로드맵\n{{단계별 실행 계획}}\n\n시설 정보:\n{{facility_info}}"}',
  'nh_skill_energy_saving',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 미디어 콘텐츠 기획안 ─────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.media-planning',
  '미디어 콘텐츠 기획안',
  '타겟, 채널, 주제를 입력하면 SNS·유튜브·블로그 콘텐츠 기획안과 콘텐츠 캘린더를 자동으로 작성합니다.',
  'NH Internal',
  'media',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"🎬","prompt":"당신은 디지털 마케팅 전문가입니다. 아래 요구사항을 바탕으로 콘텐츠 기획안을 작성해 주세요.\n\n## 입력\n- 타겟: {{타겟 고객층}}\n- 채널: {{유튜브/인스타그램/블로그/네이버 등}}\n- 주제/테마: {{핵심 주제}}\n- 기간: {{기획 기간}}\n- 목표: {{인지도 향상/리드 확보/전환 등}}\n\n## 출력 형식\n**콘텐츠 기획안**\n\n### 콘셉트 및 방향성\n### 채널별 전략\n\n### 콘텐츠 캘린더\n| 주차 | 주제 | 포맷 | 핵심 메시지 | 해시태그 |\n|------|------|------|------------|--------|\n\n### KPI 및 성과 측정 방법\n### 예산 배분 제안\n\n요구사항:\n{{requirements}}"}',
  'nh_skill_media_planning',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 여행 상품 기획서 ─────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.travel-product',
  '여행 상품 기획서',
  '목적지, 일정, 타겟 고객, 예산을 입력하면 여행 상품 기획서와 일정표, 예상 수익 구조를 작성합니다.',
  'NH Internal',
  'travel',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"✈️","prompt":"당신은 여행 상품 기획 전문가입니다. 아래 조건으로 여행 상품 기획서를 작성해 주세요.\n\n## 입력\n- 목적지: {{국내/해외 목적지}}\n- 여행 기간: {{박/일}}\n- 타겟 고객: {{가족여행/커플/단체/VIP 등}}\n- 예산 범위: {{1인 기준 금액}}\n- 테마: {{힐링/액티비티/문화탐방/미식 등}}\n\n## 출력 형식\n**여행 상품 기획서**\n- 상품명: {{매력적인 상품명}}\n- 판매가: {{1인 기준}}\n\n### 상품 특징 (셀링포인트 3가지)\n### 상세 일정표\n| 일차 | 일정 | 숙박 | 식사 |\n|------|------|------|------|\n\n### 포함/불포함 사항\n### 원가 구조 분석\n| 항목 | 비용 |\n|------|------|\n\n### 마케팅 포인트\n\n요건:\n{{requirements}}"}',
  'nh_skill_travel_product',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 렌탈 견적 비교표 ─────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.rental-quote',
  '렌탈 견적 비교표 작성',
  '차량 또는 사무기기 렌탈 견적서 여러 개를 붙여넣으면 항목별 비교표와 최적 업체 선정 의견을 생성합니다.',
  'NH Internal',
  'rental',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"📋","prompt":"당신은 구매·렌탈 협상 전문가입니다. 아래 렌탈 견적서들을 비교 분석해 주세요.\n\n## 출력 형식\n**렌탈 견적 비교 분석표**\n\n### 견적 요약 비교\n| 항목 | 업체A | 업체B | 업체C |\n|------|------|------|------|\n| 월 렌탈료 | | | |\n| 계약 기간 | | | |\n| 보증금 | | | |\n| AS 조건 | | | |\n| 소모품 포함 여부 | | | |\n| 중도 해지 위약금 | | | |\n| 총 비용 (기간 합산) | | | |\n\n### 업체별 장단점\n### 추천 업체 및 선정 이유\n### 협상 시 요청할 사항\n\n견적서 내용:\n{{quotes}}"}',
  'nh_skill_rental_quote',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 입찰 제안서 작성 ─────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.bid-proposal',
  '입찰 제안서 작성',
  '공고문 내용을 입력하면 시설공사·용역·물품 입찰에 맞는 제안서 목차와 주요 내용을 자동 생성합니다.',
  'NH Internal',
  'construction',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"📝","prompt":"당신은 입찰 제안서 작성 전문가입니다. 아래 입찰 공고를 바탕으로 제안서를 작성해 주세요.\n\n## 출력 형식\n**입찰 제안서**\n\n### 1. 회사 개요\n- 회사명, 설립 연도, 주요 실적\n\n### 2. 사업 이해도\n- 발주처 요구사항 파악\n- 사업 목표 및 기대 효과\n\n### 3. 수행 방법론\n- 추진 전략\n- 단계별 수행 계획\n- 일정표 (WBS)\n\n### 4. 인력 투입 계획\n| 역할 | 자격요건 | 투입 기간 |\n|------|---------|----------|\n\n### 5. 유사 수행 실적\n### 6. 품질 관리 방안\n### 7. 리스크 관리\n\n공고 내용:\n{{bid_notice}}"}',
  'nh_skill_bid_proposal',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 계약 위험도 분석 ─────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.contract-risk',
  '계약 위험도 분석',
  '용역·시설공사·렌탈 계약서를 붙여넣으면 불리한 조항, 분쟁 가능 조항, 법적 위험요소를 항목별로 분석합니다.',
  'NH Internal',
  'contract',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"⚖️","prompt":"당신은 계약 법무 전문가입니다. 아래 계약서의 위험요소를 분석해 주세요.\n\n## 분석 항목\n1. **불리한 조항**: 우리 측에 과도한 의무·책임을 부과하는 조항\n2. **분쟁 가능 조항**: 해석이 모호하거나 다툼이 생길 수 있는 표현\n3. **누락 조항**: 반드시 있어야 할 내용이 빠진 부분\n4. **위약금·손해배상**: 과도하거나 비대칭적인 페널티\n5. **해지·종료 조건**: 불리한 해지 사유 또는 제한 조건\n\n## 출력 형식\n**계약 위험도 분석 보고서**\n- 종합 위험도: {{높음/중간/낮음}}\n\n### 위험 조항 목록\n| 조항 번호 | 내용 요약 | 위험도 | 대응 방안 |\n|----------|---------|-------|----------|\n\n### 협상 요청 사항 우선순위\n### 서명 전 확인 체크리스트\n\n⚠️ 법적 조언이 필요한 경우 법무팀에 검토를 요청하세요.\n\n계약서:\n{{contract_text}}"}',
  'nh_skill_contract_risk',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 고객 제안서 작성 ─────────────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.skill.customer-proposal',
  '고객 제안서 작성',
  '고객사 정보와 제안할 서비스(시설관리, 렌탈, 에너지, 여행 등)를 입력하면 맞춤형 영업 제안서를 생성합니다.',
  'NH Internal',
  'sales',
  'skill',
  '[]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"🤝","prompt":"당신은 비즈니스 개발 전문가입니다. 아래 정보를 바탕으로 고객 맞춤형 제안서를 작성해 주세요.\n\n## 입력\n- 고객사명: {{고객사}}\n- 고객사 업종: {{업종}}\n- 제안 서비스: {{시설관리/렌탈/에너지/여행/복합}}\n- 고객 니즈: {{파악된 고객 문제 또는 요구사항}}\n- 제안 차별점: {{우리 회사의 강점}}\n\n## 출력 형식\n**서비스 제안서**\n\n### 고객사 현황 및 니즈 분석\n### 제안 솔루션\n### 도입 기대 효과\n| 효과 | 정량 지표 |\n|------|----------|\n\n### 서비스 구성 및 요금\n### 유사 고객사 도입 사례\n### 진행 일정 제안\n### 연락처 및 다음 단계\n\n정보:\n{{customer_info}}"}',
  'nh_skill_customer_proposal',
  'builtin://skill',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ════════════════════════════════════════════════════════════════
-- PUBLIC DATA
-- ════════════════════════════════════════════════════════════════

-- ── 나라장터 시설공사 입찰공고 (업데이트) ────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.public-data.g2b-bid',
  '나라장터 입찰공고',
  '조달청 나라장터 API로 시설공사·용역·물품 입찰공고를 실시간 조회합니다. 키워드, 공고 유형, 지역으로 필터링 가능합니다.',
  '조달청 / data.go.kr',
  'public_data',
  'public_data',
  '["public_data.read"]',
  'api_key',
  'Authorization',
  'per_user',
  '{"type":"object","required":["api_key"],"properties":{"api_key":{"type":"string","description":"공공데이터포털 API 인증키"}}}',
  '{"icon":"🏛️","tools":[{"name":"nh_search_g2b_bid","description":"나라장터 입찰공고를 검색합니다."},{"name":"nh_get_g2b_bid_detail","description":"입찰공고 상세 정보를 조회합니다."}],"portal_url":"https://www.data.go.kr/data/15000936/openapi.do"}',
  'nh_search_g2b_bid',
  'builtin://g2b-bid',
  true, true, 'approved', '1.1.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 토지이음 용도지역 조회 ──────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.public-data.land-use',
  '토지이음 용도지역 조회',
  '토지이음 API로 주소별 용도지역, 용도지구, 건폐율·용적률 기준을 조회합니다. 부동산 개발 가능성 검토에 활용합니다.',
  '국토교통부 토지이음',
  'public_data',
  'public_data',
  '["public_data.read"]',
  'api_key',
  'Authorization',
  'per_user',
  '{"type":"object","required":["api_key"],"properties":{"api_key":{"type":"string","description":"공공데이터포털 API 인증키"}}}',
  '{"icon":"🗾","tools":[{"name":"nh_get_land_use_zone","description":"주소의 용도지역·지구를 조회합니다."},{"name":"nh_get_land_regulation","description":"건폐율·용적률 등 토지 규제를 조회합니다."}],"portal_url":"https://www.eum.go.kr"}',
  'nh_get_land_use_zone',
  'builtin://land-use',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;

-- ── 전력거래소 SMP·REC 가격 ─────────────────────────────────────────────────
insert into public.plugins (plugin_id, name, description, provider, category, extension_type, required_scopes, auth_type, auth_header_name, connection_mode, config_schema, manifest, tool_function_name, endpoint_url, is_active, enabled, approval_status, version)
values (
  'nh.public-data.smp-rec',
  '전력거래소 SMP·REC 가격',
  '전력거래소 API로 현재 SMP(계통한계가격)와 REC 거래 가격을 조회합니다. 태양광 발전소 수익 계산에 필수입니다.',
  '전력거래소 (KPX)',
  'public_data',
  'public_data',
  '["public_data.read"]',
  'none',
  'Authorization',
  'admin_shared',
  '{}',
  '{"icon":"⚡","tools":[{"name":"nh_get_smp_price","description":"현재 및 과거 SMP 가격을 조회합니다."},{"name":"nh_get_rec_price","description":"REC 거래 가격을 조회합니다."}],"portal_url":"https://www.kpx.or.kr"}',
  'nh_get_smp_price',
  'builtin://smp-rec',
  true, true, 'approved', '1.0.0'
)
on conflict (plugin_id) do update set name=excluded.name, description=excluded.description, provider=excluded.provider, category=excluded.category, extension_type=excluded.extension_type, required_scopes=excluded.required_scopes, config_schema=excluded.config_schema, manifest=excluded.manifest, tool_function_name=excluded.tool_function_name, is_active=excluded.is_active, enabled=excluded.enabled, approval_status=excluded.approval_status, version=excluded.version;
