export type AssistantGuideStatus = 'available' | 'admin_setup' | 'account_setup'
export type AssistantConnectionMode = 'per_user' | 'workspace_install' | 'admin_shared' | 'hybrid'

export interface AssistantIntegrationGuide {
  id: string
  icon: string
  title: string
  service: string
  status: AssistantGuideStatus
  connectionMode: AssistantConnectionMode
  actionKey: 'gmail_unread_summary' | 'calendar_upcoming_summary' | null
  summary: string
  accountUrl?: string
  docsUrl?: string
  prerequisites: string[]
  userSteps: string[]
  adminSteps: string[]
  verification: string[]
  troubleshooting: string[]
}

const googleAdminSteps = [
  'Google Cloud Console에서 NH-AX-HUB용 프로젝트를 선택하거나 새 프로젝트를 만듭니다.',
  'API 및 서비스 → 라이브러리에서 사용할 Workspace API를 활성화합니다.',
  'OAuth 동의 화면에서 앱 이름·지원 이메일을 입력하고, 사내용이면 조직 내부(Internal) 앱으로 설정합니다.',
  '사용자 인증 정보 → OAuth 클라이언트 ID → 웹 애플리케이션을 선택합니다.',
  '승인된 리디렉션 URI에 NH-AX-HUB의 /oauth/google-integration 콜백 주소를 정확히 등록합니다.',
  '발급된 Client ID와 Client Secret을 Supabase Edge Function Secret의 GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET에 저장합니다.',
]

const googleTroubleshooting = [
  'redirect_uri_mismatch: Google Cloud에 등록한 콜백 주소와 현재 사이트 주소가 문자 하나까지 같은지 확인합니다.',
  'access_denied: 회사 Google Workspace 관리자가 앱 사용 또는 요청한 OAuth 범위를 차단했는지 확인합니다.',
  '연결됐지만 조회 실패: 해당 API가 활성화됐는지, 연결한 계정에 실제 데이터 접근 권한이 있는지 확인합니다.',
]

function googleGuide(args: {
  id: string
  icon: string
  title: string
  service: string
  actionKey: AssistantIntegrationGuide['actionKey']
  apiName: string
  scopeDescription: string
  testInstruction: string
}): AssistantIntegrationGuide {
  return {
    ...args,
    status: args.actionKey ? 'available' : 'admin_setup',
    connectionMode: 'per_user',
    summary: `${args.service} 계정을 OAuth로 연결해 ${args.scopeDescription} 작업을 수행합니다.`,
    accountUrl: 'https://accounts.google.com/',
    docsUrl: 'https://developers.google.com/workspace/guides/configure-oauth-consent',
    prerequisites: ['회사 또는 개인 Google 계정', '팝업이 허용된 최신 브라우저', `관리자 설정: ${args.apiName} 활성화`],
    userSteps: [
      'NH-AX-HUB 우측 상단 설정을 열고 개인 연동 → Google 연결하기를 누릅니다.',
      '새 창에서 업무에 사용할 Google 계정을 선택합니다. 다른 계정으로 연결하면 해당 계정의 데이터만 조회됩니다.',
      '요청 권한 목록에서 서비스 이름과 접근 범위를 확인한 뒤 계속 또는 허용을 누릅니다.',
      'NH-AX-HUB로 돌아온 뒤 연결된 이메일 주소와 연결됨 표시를 확인합니다.',
      args.testInstruction,
    ],
    adminSteps: [...googleAdminSteps, `Google Cloud API 라이브러리에서 ${args.apiName}가 사용 설정인지 다시 확인합니다.`],
    verification: ['설정 화면에 실제 Google 이메일 주소가 표시됩니다.', '테스트 실행 후 최근 실행 기록이 완료로 바뀌고 실제 계정 데이터와 일치합니다.'],
    troubleshooting: googleTroubleshooting,
  }
}

function externalGuide(
  args: Omit<AssistantIntegrationGuide, 'status' | 'actionKey' | 'connectionMode'> & {
    connectionMode?: AssistantConnectionMode
  },
): AssistantIntegrationGuide {
  const perUser = new Set(['notion', 'calendly', 'notion-ai', 'figma', 'clickup'])
  const workspaceInstall = new Set(['slack', 'discord'])
  const hybrid = new Set(['zapier', 'ads', 'youtube', 'content'])
  const inferredMode: AssistantConnectionMode = perUser.has(args.id)
    ? 'per_user'
    : workspaceInstall.has(args.id)
      ? 'workspace_install'
      : hybrid.has(args.id)
        ? 'hybrid'
        : 'admin_shared'
  return {
    ...args,
    status: 'admin_setup',
    actionKey: null,
    connectionMode: args.connectionMode ?? inferredMode,
  }
}

export const ASSISTANT_INTEGRATION_GUIDES: AssistantIntegrationGuide[] = [
  googleGuide({ id: 'gmail', icon: '✉️', title: 'Gmail 비서', service: 'Gmail', actionKey: 'gmail_unread_summary', apiName: 'Gmail API', scopeDescription: '안 읽은 메일을 조회·요약하는', testInstruction: 'Workflows에서 Gmail 워크플로를 만든 후 지금 실행을 눌러 안 읽은 메일 수가 일치하는지 확인합니다.' }),
  googleGuide({ id: 'calendar', icon: '📅', title: 'Calendar 비서', service: 'Google Calendar', actionKey: 'calendar_upcoming_summary', apiName: 'Google Calendar API', scopeDescription: '예정 일정을 조회하는', testInstruction: 'Calendar에 테스트 일정을 하나 만든 뒤 워크플로를 실행해 예정 일정 결과를 확인합니다.' }),
  externalGuide({ id: 'notion', icon: '📝', title: 'Notion 비서', service: 'Notion', summary: '선택한 Notion 페이지를 검색하고 회의록 페이지를 생성합니다.', accountUrl: 'https://www.notion.so/signup', docsUrl: 'https://developers.notion.com/docs/authorization', prerequisites: ['Notion 계정', '연동할 워크스페이스의 관리자 또는 앱 설치 권한', '비서가 접근할 상위 페이지'], userSteps: ['Notion에서 비서가 읽고 쓸 상위 페이지를 정합니다.', 'NH-AX-HUB 설정 → 개인 연동 → Notion 연결 방법 보기를 엽니다.', '관리자가 OAuth 연결 기능을 배포한 뒤 Notion 연결하기를 누릅니다.', 'Notion 승인 화면에서 올바른 워크스페이스와 접근할 페이지를 선택하고 액세스 허용을 누릅니다.', '연결 후 테스트용 회의록 페이지 생성을 실행하고 Notion에서 실제 페이지가 생겼는지 확인합니다.'], adminSteps: ['Notion My integrations에서 Public integration을 만들고 OAuth 도메인과 Redirect URI를 등록합니다.', 'OAuth Client ID와 Client Secret을 Supabase Secret에 저장합니다.', 'Authorization Code 교환·refresh token 저장 Edge Function을 구현하고 user_integrations에 암호화 저장합니다.', 'create_notion_page/search_notion_pages Mock 실행기를 실제 Notion API 호출로 교체한 뒤 액션을 허용 목록에 추가합니다.'], verification: ['Notion 승인 화면에서 선택한 페이지가 표시됩니다.', '테스트 페이지 URL이 mock 주소가 아닌 실제 notion.so URL입니다.'], troubleshooting: ['페이지를 못 찾음: 해당 페이지의 연결 메뉴에서 NH-AX-HUB에 접근 권한을 공유했는지 확인합니다.', '권한 없음: 개인 페이지가 아니라 다른 팀 공간의 페이지인지 확인하고 관리자 승인을 요청합니다.'] }),
  googleGuide({ id: 'sheets', icon: '📊', title: 'Sheets 비서', service: 'Google Sheets', actionKey: null, apiName: 'Google Sheets API', scopeDescription: '시트 데이터를 읽고 행을 추가하는', testInstruction: '관리자가 실제 액션을 활성화한 뒤 테스트 시트 URL과 탭 이름을 입력해 한 행이 추가되는지 확인합니다.' }),
  googleGuide({ id: 'drive', icon: '📁', title: 'Drive 비서', service: 'Google Drive', actionKey: null, apiName: 'Google Drive API', scopeDescription: '파일을 검색하고 내용을 읽는', testInstruction: '테스트 문서 제목을 검색해 실제 Drive 파일 링크가 결과로 나오는지 확인합니다.' }),
  externalGuide({ id: 'design', icon: '🎨', title: '디자인 비서', service: '이미지 생성 모델', summary: '텍스트 설명으로 배너와 그래픽 이미지를 생성합니다.', docsUrl: 'https://ai.google.dev/gemini-api/docs/image-generation', prerequisites: ['사용자는 별도 계정 설치 불필요', '관리자: 이미지 생성 API 키와 결제 한도', '저장 결과를 보관할 Supabase Storage 버킷'], userSteps: ['원하는 이미지 크기, 용도, 포함 문구, 색상, 금지 요소를 준비합니다.', '관리자가 이미지 생성 액션을 활성화했는지 상태를 확인합니다.', '테스트 실행 시 개인정보·상표·저작권 보호 이미지가 포함되지 않은 프롬프트를 사용합니다.', '완료 후 실제 미리보기와 Storage URL이 생성됐는지 확인합니다.'], adminSteps: ['선택한 이미지 모델 제공자에서 API 키와 결제 한도를 설정합니다.', 'API 키를 브라우저가 아닌 Supabase Secret에 저장합니다.', 'generate_graphic_image를 실제 API 호출과 Storage 업로드로 구현합니다.', '콘텐츠 정책 오류·시간 초과·비용 한도를 처리한 후 액션 허용 목록에 등록합니다.'], verification: ['결과 URL이 placeholder.com이 아닌 Supabase Storage 또는 제공자 URL입니다.', '실행 기록에 모델명·생성 크기·실패 이유가 남습니다.'], troubleshooting: ['생성 거절: 사람·상표·민감 콘텐츠 표현을 제거하고 다시 작성합니다.', '빈 이미지: API 결제 상태와 Storage 쓰기 권한을 확인합니다.'] }),
  externalGuide({ id: 'video', icon: '🎬', title: '영상 비서', service: '영상 생성 제공자', summary: '대본과 이미지를 영상 렌더링 작업으로 전달합니다.', prerequisites: ['영상 제공자 계정과 API 요금제', '렌더링 완료 Webhook URL', '대용량 결과 저장소'], userSteps: ['대본, 화면 비율, 길이, 음성 언어와 배경 자료를 준비합니다.', '관리자가 연결한 제공자의 이용약관과 예상 비용을 확인합니다.', '짧은 테스트 대본으로 실행하고 처리 중 → 완료 상태가 갱신되는지 확인합니다.'], adminSteps: ['영상 제공자를 선정하고 API 키를 Supabase Secret에 저장합니다.', '비동기 job ID를 workflow_runs에 기록하고 Webhook 서명을 검증합니다.', 'example.com mock URL을 제거하고 실제 렌더링 결과 URL을 저장합니다.', '실패·취소·시간 초과와 과금 한도를 구현한 뒤 액션을 활성화합니다.'], verification: ['실행 기록에 실제 provider job ID가 존재합니다.', '완료 결과가 재생 가능한 영상이며 만료 시각이 표시됩니다.'], troubleshooting: ['오래 실행 중: 제공자 대시보드의 job 상태와 Webhook 전달 기록을 확인합니다.', '렌더링 실패: 대본 길이·지원 언어·업로드 파일 형식을 확인합니다.'] }),
  externalGuide({ id: 'calendly', icon: '🤝', title: 'Calendly 비서', service: 'Calendly', summary: '이벤트 유형을 조회하고 고객에게 예약 링크를 전달합니다.', accountUrl: 'https://calendly.com/signup', docsUrl: 'https://developer.calendly.com/how-to-authenticate-with-oauth/', prerequisites: ['Calendly 계정', '활성 이벤트 유형 1개 이상', 'OAuth 앱을 만들 수 있는 관리자 권한'], userSteps: ['Calendly에서 30분 미팅 같은 이벤트 유형을 먼저 만들고 가능한 시간을 설정합니다.', '관리자가 연결 기능을 배포한 뒤 Calendly 연결하기를 누릅니다.', '승인 화면에서 조직과 사용자 정보 접근을 허용합니다.', '테스트 고객 이메일로 예약 링크를 생성하되 실제 발송 전 주소를 확인합니다.'], adminSteps: ['Calendly Developer Portal에서 OAuth 앱과 Redirect URI를 등록합니다.', 'Client ID/Secret을 Supabase Secret에 저장하고 토큰 교환 함수를 구현합니다.', 'create_calendly_event를 실제 Scheduling API 호출로 교체합니다.', 'Webhook signing key를 등록해 예약·취소 이벤트를 검증합니다.'], verification: ['결과 링크가 calendly.com의 실제 이벤트 링크입니다.', '테스트 예약이 Calendly와 연결된 Calendar 양쪽에 나타납니다.'], troubleshooting: ['시간이 안 보임: 이벤트 유형 활성 상태와 연결 Calendar의 충돌 일정을 확인합니다.', '조직 접근 오류: 개인 계정과 조직 계정 중 올바른 계정으로 승인했는지 확인합니다.'] }),
  externalGuide({ id: 'research', icon: '🔍', title: '리서치 비서', service: '웹 검색 API', summary: '공개 웹 자료를 검색하고 출처가 포함된 보고서를 생성합니다.', docsUrl: 'https://docs.exa.ai/reference/getting-started', prerequisites: ['관리자: 검색 API 키', '허용 도메인과 월간 비용 한도', '사용자: 조사 질문과 기준일'], userSteps: ['조사 대상, 국가, 기간, 원하는 결과 형식을 구체적으로 작성합니다.', '회사 기밀이나 개인정보를 검색어에 넣지 않습니다.', '결과의 출처 링크와 발행일을 열어 원문이 주장을 뒷받침하는지 확인합니다.'], adminSteps: ['검색 제공자 API 키를 Supabase Secret에 저장합니다.', 'fetch_deep_research_report Mock을 실제 검색·본문 추출·인용 파이프라인으로 교체합니다.', '도메인 차단, 요청 제한, 비용 상한과 인용 원문 보존 정책을 설정합니다.'], verification: ['보고서의 각 핵심 주장에 열리는 출처 링크가 붙습니다.', '실행 기록에 검색 시각과 사용한 검색 제공자가 남습니다.'], troubleshooting: ['결과 부족: 기간·언어·지역 필터를 완화합니다.', '출처 불일치: 해당 결과를 사용하지 말고 검색식을 구체화합니다.'] }),
  externalGuide({ id: 'zapier', icon: '⚡', title: 'Zapier 비서', service: 'Zapier', summary: '승인된 Zap 또는 Webhook을 호출해 앱 간 자동화를 시작합니다.', accountUrl: 'https://zapier.com/sign-up', docsUrl: 'https://help.zapier.com/hc/en-us/articles/8496288690317-Trigger-Zaps-from-webhooks', prerequisites: ['Zapier 계정', 'Catch Hook 트리거가 있는 Zap', '테스트용 데이터와 중복 실행 방지 키'], userSteps: ['Zapier에서 Create → Zaps를 열고 Webhooks by Zapier의 Catch Hook 트리거를 선택합니다.', '생성된 Webhook URL을 공개 채팅에 붙이지 말고 관리자에게 안전한 방법으로 전달합니다.', '테스트 데이터를 보내 Zapier에서 필드가 올바르게 인식되는지 확인합니다.', '후속 앱 액션을 설정하고 Publish한 뒤 NH-AX-HUB에서 한 번만 테스트합니다.'], adminSteps: ['Webhook URL을 사용자 메타데이터나 브라우저가 아닌 서버 암호 저장소에 보관합니다.', '허용된 Zap ID만 호출하도록 trigger_zapier_webhook을 구현합니다.', 'idempotency key, 서명 또는 별도 secret, 재시도 제한을 적용합니다.'], verification: ['Zap History에 테스트 실행이 1건만 성공으로 표시됩니다.', '후속 앱에서 기대한 레코드가 실제 생성됩니다.'], troubleshooting: ['여러 번 실행됨: idempotency key와 Zap 재시도 설정을 확인합니다.', '필드 누락: Catch Hook 테스트 데이터를 다시 받아 Zap 필드를 재매핑합니다.'] }),
  externalGuide({ id: 'ads', icon: '📈', title: '광고 비서', service: 'Google Ads / Meta Ads', summary: '승인된 광고 계정의 성과 지표를 읽어 분석합니다.', docsUrl: 'https://developers.google.com/google-ads/api/docs/get-started/introduction', prerequisites: ['광고 계정 읽기 권한', 'Google Ads 개발자 토큰 또는 Meta 앱', '고객 ID와 통화·시간대 확인'], userSteps: ['광고 플랫폼에서 본인이 대상 계정의 읽기 권한을 갖고 있는지 확인합니다.', '관리자가 만든 OAuth 연결 화면에서 계정을 승인하고 광고 고객 ID를 선택합니다.', '최근 7일처럼 짧은 기간으로 테스트하고 플랫폼 대시보드의 노출·비용과 비교합니다.'], adminSteps: ['광고 플랫폼 개발자 앱과 OAuth 동의 화면을 구성합니다.', '토큰과 customer/account ID를 서버에서 암호화 저장합니다.', 'analyze_ad_performance를 실제 읽기 전용 API로 구현하고 캠페인 변경 권한은 별도 승인 흐름으로 분리합니다.'], verification: ['비용·통화·기간이 광고 플랫폼 화면과 일치합니다.', '분석 실행이 광고 설정을 변경하지 않습니다.'], troubleshooting: ['데이터 불일치: 계정 시간대, 통화, attribution window를 맞춥니다.', '권한 오류: 관리자 계정과 하위 고객 계정 관계를 확인합니다.'] }),
  externalGuide({ id: 'youtube', icon: '▶️', title: 'YouTube 비서', service: 'YouTube', summary: '공개 영상 검색과 허용된 자막 데이터를 분석합니다.', accountUrl: 'https://www.youtube.com/', docsUrl: 'https://developers.google.com/youtube/v3/getting-started', prerequisites: ['Google 계정', '관리자: YouTube Data API v3 활성화', '자막 사용 권한과 저작권 확인'], userSteps: ['분석할 영상 URL이 공개 또는 본인 계정에서 접근 가능한지 확인합니다.', '타인의 자막은 저작권과 이용 목적을 확인하고 전체 재배포하지 않습니다.', '영상 URL 또는 검색 키워드로 테스트하고 결과 영상 ID가 실제 URL과 같은지 확인합니다.'], adminSteps: ['Google Cloud에서 YouTube Data API v3를 활성화하고 quota를 설정합니다.', '비공개 데이터가 필요하면 OAuth 범위를 추가하고, 공개 검색만이면 제한된 API 키를 서버에 저장합니다.', 'mock 자막과 mock 영상 URL을 실제 API 응답으로 교체합니다.'], verification: ['결과 videoId가 실제 YouTube 영상과 일치합니다.', 'quota 사용량과 오류가 실행 기록에 남습니다.'], troubleshooting: ['quotaExceeded: 다음 할당량 갱신을 기다리거나 관리자에게 증액을 요청합니다.', '자막 없음: 영상에 제공되는 자막 트랙이 있는지 확인합니다.'] }),
  externalGuide({ id: 'notion-ai', icon: '🧠', title: 'Notion AI 비서', service: 'Notion', summary: 'Notion에 공유된 사내 문서를 검색해 답변합니다.', accountUrl: 'https://www.notion.so/signup', docsUrl: 'https://developers.notion.com/docs/authorization', prerequisites: ['Notion 계정', '검색 대상 페이지 공유 권한', '조직의 문서 반출 정책 확인'], userSteps: ['Notion 비서와 동일하게 OAuth 연결 및 페이지 선택을 완료합니다.', '질문에 사용할 문서가 선택한 상위 페이지 아래에 있는지 확인합니다.', '테스트 질문의 답을 원문 페이지와 비교하고 출처 링크가 표시되는지 확인합니다.'], adminSteps: ['Notion OAuth와 토큰 저장을 구현합니다.', '허용 페이지를 동기화·색인하고 사용자별 접근 제어를 검색 단계에도 적용합니다.', 'ask_notion_ai Mock을 접근 권한이 검증된 RAG 검색으로 교체합니다.'], verification: ['답변에 실제 Notion 페이지 제목과 URL이 표시됩니다.', '공유하지 않은 페이지는 검색되지 않습니다.'], troubleshooting: ['문서 누락: 페이지 공유 범위와 마지막 동기화 시간을 확인합니다.', '권한 초과 노출: 즉시 사용을 중지하고 관리자에게 접근 제어 점검을 요청합니다.'] }),
  googleGuide({ id: 'forms', icon: '📋', title: 'Forms 비서', service: 'Google Forms', actionKey: null, apiName: 'Google Forms API', scopeDescription: '설문지를 생성하고 응답을 읽는', testInstruction: '테스트 설문을 생성한 뒤 실제 forms.google.com 편집 링크와 응답 시트가 만들어졌는지 확인합니다.' }),
  externalGuide({ id: 'content', icon: '✍️', title: '콘텐츠 비서', service: 'AI 작성 + 게시 채널', summary: '초안을 작성하며, 실제 게시에는 별도 CMS 또는 SNS 연결이 필요합니다.', prerequisites: ['초안 작성만 할 경우 별도 계정 불필요', '게시할 경우 CMS/SNS API 앱과 게시 권한', '브랜드 문체·금칙어·승인 담당자'], userSteps: ['채널, 독자, 목적, 길이, 반드시 포함할 사실을 입력합니다.', '생성된 초안의 사실·표현·개인정보를 사람이 검토합니다.', '게시 연동이 활성화돼도 최종 게시 전 미리보기와 승인 단계를 거칩니다.'], adminSteps: ['write_blog_post를 초안 생성과 실제 게시 액션으로 분리합니다.', '게시 액션에는 대상 채널 allow-list와 사람 승인 상태를 필수로 둡니다.', 'CMS/SNS 토큰은 서버 Secret 또는 암호화된 user_integrations에 저장합니다.'], verification: ['초안 상태와 게시 상태가 구분되어 표시됩니다.', '실제 게시 후 반환된 post URL을 직접 열어 확인합니다.'], troubleshooting: ['잘못 게시됨: 자동 재실행을 중지하고 게시 채널에서 즉시 비공개 처리합니다.', '문체 불일치: 브랜드 예시와 금칙어를 워크플로 입력에 추가합니다.'] }),
  externalGuide({ id: 'heygen', icon: '🤖', title: 'HeyGen 비서', service: 'HeyGen', summary: '대본을 HeyGen 아바타 영상 작업으로 전송합니다.', accountUrl: 'https://app.heygen.com/signup', docsUrl: 'https://docs.heygen.com/docs/quick-start', prerequisites: ['HeyGen 계정과 API 사용 가능 요금제', '사용 권한이 있는 아바타와 음성', '영상 생성 크레딧'], userSteps: ['HeyGen에서 사용할 아바타와 음성을 미리 선택해 테스트합니다.', '관리자가 API 연결을 완료한 뒤 짧은 대본으로 먼저 실행합니다.', '인물·음성 사용 동의와 사내 공개 범위를 확인한 후 최종 렌더링합니다.'], adminSteps: ['HeyGen API key를 Supabase Secret에 저장합니다.', 'video generation 요청의 video_id를 workflow_runs에 기록합니다.', '상태 조회 또는 Webhook으로 완료를 반영하고 mock URL을 실제 영상 URL로 교체합니다.'], verification: ['HeyGen 대시보드와 NH-AX-HUB 실행 기록의 video_id가 일치합니다.', '결과 영상의 아바타·음성·대본이 요청과 같습니다.'], troubleshooting: ['크레딧 부족: HeyGen 요금제와 잔여 크레딧을 확인합니다.', '발음 오류: 대본 문장부호와 언어·voice 설정을 확인합니다.'] }),
  externalGuide({ id: 'discord', icon: '🎮', title: 'Discord 비서', service: 'Discord', summary: '선택한 서버와 채널에 공지를 보내거나 메시지를 읽습니다.', accountUrl: 'https://discord.com/register', docsUrl: 'https://discord.com/developers/docs/topics/oauth2', prerequisites: ['Discord 계정', '대상 서버의 서버 관리 권한', 'Discord Developer Application과 Bot'], userSteps: ['Discord에서 대상 서버를 선택하고 본인에게 서버 관리 권한이 있는지 확인합니다.', '관리자가 제공한 설치 URL을 열어 정확한 서버를 선택합니다.', '요청 권한에서 메시지 보기·보내기 등 필요한 최소 권한만 승인합니다.', '대상 채널 설정에서 Bot 역할이 채널을 보고 메시지를 보낼 수 있는지 확인합니다.'], adminSteps: ['Developer Portal에서 Application과 Bot을 만들고 bot token을 Supabase Secret에 저장합니다.', 'OAuth2 URL Generator에서 bot 및 필요한 최소 permissions만 선택합니다.', 'send_discord_message를 실제 Discord API로 구현하고 guild/channel allow-list를 적용합니다.'], verification: ['서버 멤버 목록에 Bot이 온라인 또는 설치됨으로 표시됩니다.', '테스트 채널에 NH-AX-HUB가 보낸 메시지가 1건 나타납니다.'], troubleshooting: ['Missing Permissions: Bot 역할을 대상 채널 권한보다 위로 올리고 채널별 거부 설정을 확인합니다.', 'Unknown Channel: 다른 서버의 channel ID를 입력하지 않았는지 확인합니다.'] }),
  externalGuide({ id: 'figma', icon: '🖌️', title: 'Figma 비서', service: 'Figma', summary: '권한이 있는 Figma 파일 구조를 읽고 UI 피드백을 만듭니다.', accountUrl: 'https://www.figma.com/signup', docsUrl: 'https://developers.figma.com/docs/rest-api/authentication/', prerequisites: ['Figma 계정', '분석할 파일의 Can view 이상 권한', 'OAuth 앱 또는 제한된 개인 토큰'], userSteps: ['Figma에서 분석할 파일을 열고 Share에서 본인 계정의 접근 권한을 확인합니다.', '관리자가 OAuth 연결을 배포한 뒤 Figma 연결하기를 누르고 접근을 승인합니다.', '파일 URL을 복사해 테스트하고 파일명과 최상위 Frame 목록이 일치하는지 확인합니다.'], adminSteps: ['Figma 개발자 설정에서 OAuth 앱과 Redirect URI를 등록합니다.', 'Client Secret 또는 개인 토큰을 서버에서만 저장합니다.', 'read_figma_file Mock을 실제 Files API 호출로 교체하고 허용 파일/team 범위를 제한합니다.'], verification: ['결과의 file key와 실제 URL의 file key가 일치합니다.', '고정된 mock Frame이 아니라 해당 파일의 실제 Page/Frame 이름이 표시됩니다.'], troubleshooting: ['Not found: 링크 권한과 로그인한 Figma 계정이 같은지 확인합니다.', '파일이 너무 큼: 특정 Page 또는 node ID로 범위를 줄입니다.'] }),
  externalGuide({ id: 'clickup', icon: '🎯', title: 'ClickUp 비서', service: 'ClickUp', summary: '허용된 Workspace의 프로젝트와 작업 상태를 조회합니다.', accountUrl: 'https://clickup.com/signup', docsUrl: 'https://developer.clickup.com/docs/authentication', prerequisites: ['ClickUp 계정', '대상 Workspace·Space·List 접근 권한', 'OAuth 앱 또는 개인 API 토큰'], userSteps: ['ClickUp에서 조회할 Workspace와 List를 열 수 있는지 확인합니다.', '관리자가 만든 OAuth 연결을 승인할 때 올바른 Workspace를 선택합니다.', '테스트 List의 실제 작업 수와 상태를 NH-AX-HUB 결과와 비교합니다.'], adminSteps: ['ClickUp 앱을 만들고 Redirect URI를 등록하거나 서버용 개인 토큰을 준비합니다.', '토큰을 Supabase Secret/암호화 저장소에 저장합니다.', 'query_clickup_tasks Mock을 실제 API로 교체하고 workspace/list allow-list를 적용합니다.'], verification: ['실제 task ID와 이름·상태가 ClickUp 화면과 일치합니다.', '접근 권한이 없는 Workspace는 결과에 나오지 않습니다.'], troubleshooting: ['빈 결과: team/workspace ID와 list ID가 맞는지 확인합니다.', '401 오류: 토큰 만료 또는 연결 해제 여부를 확인합니다.'] }),
  externalGuide({ id: 'slack', icon: '💬', title: 'Slack 비서', service: 'Slack', summary: '설치된 Workspace의 채널 메시지를 읽거나 승인된 메시지를 전송합니다.', accountUrl: 'https://slack.com/get-started', docsUrl: 'https://api.slack.com/authentication/oauth-v2', prerequisites: ['Slack 계정', '앱 설치가 허용된 Workspace', '관리자 승인 또는 앱 관리 권한'], userSteps: ['업무용 Slack Workspace에 로그인하고 앱 설치 정책을 확인합니다.', '관리자가 만든 Add to Slack 버튼을 누르고 올바른 Workspace를 선택합니다.', '요청 범위에서 채널 읽기·메시지 보내기 등 필요한 권한을 확인하고 허용합니다.', '비공개 채널에서 사용할 경우 채널에서 /invite로 NH-AX-HUB Bot을 초대합니다.', '테스트 채널에만 메시지를 보내 실제 전송을 확인합니다.'], adminSteps: ['Slack API에서 앱을 만들고 OAuth Redirect URL을 등록합니다.', 'Bot Token Scopes를 최소 권한으로 구성하고 Client Secret/Signing Secret을 Supabase Secret에 저장합니다.', 'OAuth token 교환과 workspace/team_id 저장을 구현합니다.', 'send_slack_message/read_slack_thread Mock을 실제 Web API로 교체하고 channel allow-list를 적용합니다.'], verification: ['Slack의 Apps 목록에 NH-AX-HUB가 표시됩니다.', '테스트 결과의 ts/channel 값이 실제 Slack 메시지와 일치합니다.'], troubleshooting: ['not_in_channel: 대상 채널에 Bot을 초대합니다.', 'missing_scope: Slack 앱 Scope 추가 후 반드시 Workspace에 앱을 다시 설치합니다.', '관리자 승인 대기: Slack 앱 관리 화면에서 요청 상태를 확인합니다.'] }),
]

export const ASSISTANT_GUIDE_BY_ID = new Map(
  ASSISTANT_INTEGRATION_GUIDES.map((guide) => [guide.id, guide]),
)
