# PR 설명 및 리뷰 체크리스트

## 1. PR 제목

```text
Add assistant registry, shadow routing, marketplace foundations, and staging safeguards
```

- Base: `main`
- Compare: `cleanup/assistant-staging`
- 상태: PR 생성 완료, merge 전 검토 단계

## 2. PR 요약

이 PR은 기존 RAG, Vector Search, Dify, Supabase, GCS 및 모델 Smart Router를 유지하면서 Assistant 기능을 확장하기 위한 기반을 추가한다.

핵심 범위:

- 기존 Assistant Function 20개의 기반과 연동 가이드
- 중앙 Assistant Registry migration과 읽기 서비스
- 기존 모델 Smart Router에 Assistant 후보 선택 Shadow Mode 추가
- Assistant 후보 결정 진단 로그와 개인정보 최소화 RLS
- Plugin/MCP/Skill/Public Data Marketplace 확장 기반
- Workflow와 AI Planner 기반
- 채팅 입력창 및 Planner 탐색 UI 개선
- DB 적용·Staging 검증·Git 정리 절차 문서화

현재 Assistant Router는 후보만 계산한다. Assistant를 실행하지 않으며 Orchestrator도 포함하지 않는다. 일반 요청은 Assistant 0~1개, 복합 요청은 최대 3개 후보로 제한한다.

DB migration 적용, Supabase Function 배포, Feature Flag 변경은 이 PR 자체에서 수행하지 않는다.

## 3. 주요 변경사항

### Assistant Function 기반

- `assistant-01-gmail`부터 `assistant-20-slack`까지 20개 Edge Function 추가
- Assistant별 README 및 Python 예제 기반 추가
- Assistant 연동 가이드 추가
- Assistant MCP Mock 정의 추가
- Assistant 실행 로그 및 Cron migration 추가
- Gmail과 Calendar 일부 실제 연동 기반 유지
- 나머지 Assistant는 Mock/초기 구현 상태로 유지

### Plugin Marketplace 및 Smart Router 확장

- Plugin/MCP/Skill/Public Data 확장 타입 기반 추가
- Plugin 설치·승인·활성화·사용자 연결 구조 추가
- Dynamic Plugin Tool 로딩과 credential 처리 기반 추가
- Public Data Plugin Seed와 Smart Router 정책 기반 추가
- Dify Bridge, Plugin Connection, GCS 업로드 및 문서 삭제 Function 기반 추가

### Workflow 및 Planner

- AI Product Planner 화면과 client/session 서비스 추가
- `ai-planner` Edge Function 추가
- Workflow 실행 및 예약 작업 Function 추가
- Planner session, Workflow engine, Plugin connection, 데이터 수명주기 migration 추가

### UI 개선

- 채팅 입력창을 기본 한 줄, 최대 네 줄로 제한
- 최대 높이 이후 내부 스크롤 적용
- 공급자·모델 선택 영역 줄바꿈과 겹침 개선
- Composer 보조 정보 rail 제거
- 접힌 사이드바에 AI Planner 아이콘 추가
- AI Planner에 기본 페이지 복귀 버튼 추가

### Assistant Registry

- `assistant_registry` 테이블 추가
- Assistant ID, Function 이름, 상태, 활성화 여부 관리
- 기본/fallback 모델과 비용 등급 관리
- permission scope, task type, 실행 시간 제한 관리
- 기존 20개 Assistant Function Seed 추가
- Gmail/Calendar만 `partial/enabled`
- 나머지 18개는 `mock/disabled`
- 관리자 전체 관리 및 일반 사용자 제한 조회 RLS
- 프런트엔드 읽기 전용 Registry 조회 타입과 서비스 추가

### Assistant Router Shadow Mode

- 기존 provider/model 선택 결과 유지
- 별도 Assistant 후보 선택 계획 추가
- Gmail/Calendar 명시적 의도 매칭
- 일반 요청 0~1개, 복합 요청 최대 3개 제한
- 비용 등급과 모델 호환성 기반 점수화
- Registry 조회 실패 시 기존 `model_only` 경로 유지
- Feature Flag 기본 OFF
- Shadow Mode 기본 ON
- Assistant Function 호출 없음

### Shadow 진단 로그

- `assistant_router_shadow_logs` migration 추가
- request type, 복잡도, 선택 모드, Assistant ID, reason code 기록
- 후보 ID 최대 3개 DB 제약
- prompt, messages, user ID, 이메일, 문서 ID, Storage 경로, Tool 입출력 미저장
- 관리자만 조회 가능한 RLS
- service role만 insert/update/delete 가능
- Shadow 로그 Feature Flag 기본 OFF
- 로그 저장 실패 및 `EdgeRuntime.waitUntil()` 예외가 채팅으로 전파되지 않도록 방어

## 4. 포함된 커밋 목록

| 순서 | 커밋 | 메시지 | 파일 수 |
|---:|---|---|---:|
| 1 | `a7acf6d` | `feat: add assistant function foundations` | 41 |
| 2 | `4bc9175` | `feat: add plugin marketplace and smart router extension` | 20 |
| 3 | `74e6161` | `feat: add workflow and planner foundations` | 13 |
| 4 | `66163de` | `fix: compact chat composer and planner navigation` | 4 |
| 5 | `5d6685b` | `feat: add assistant registry foundation` | 4 |
| 6 | `1e5848e` | `feat: add assistant router shadow mode` | 2 |
| 7 | `e7bcd5a` | `feat: add assistant router shadow logging` | 4 |
| 8 | `3f1fd43` | `docs: add assistant staging safety checklists` | 9 |

## 5. 제외한 파일

Cleanup 과정에서 다음 파일과 경로는 의도적으로 제외했다.

- `deno-bin/`
- `deno.zip`
- `dump.sql`
- `db_schema.sql`
- `db_schema_temp.sql`
- `supabase/.temp/`
- `.firebase/hosting.ZGlzdA.cache`
- `.env*`
- 실제 API Key 또는 credential 파일
- 승인되지 않은 임시·dump·대형 binary 파일

검사 결과:

- 제외 파일 포함: 0건
- 10MiB 초과 신규 Git blob: 0건
- credential 패턴 탐지: 0건

## 6. 검증 결과

### 완료

- [x] `npm run build` 성공
- [x] Router Deno 검사 통과
- [x] Shadow Logger Deno 검사 통과
- [x] `git diff --check origin/main..HEAD` 통과
- [x] credential 패턴 검사 통과
- [x] `.env` 및 secret 파일 부재 확인
- [x] 제외 파일 부재 확인
- [x] 대형 blob 부재 확인
- [x] 필수 Registry/Router/Logger 파일 존재 확인
- [x] 후보 최대 3개 제한 확인
- [x] `waitUntil()` 예외 비전파 확인
- [x] cleanup 커밋 주제별 분리

### 참고

- Vite build에서 일부 대형 chunk 경고가 있으나 build 실패는 아니다.
- Deno 검사는 제외된 로컬 binary를 Git에 포함하지 않고 저장소 밖 임시 경로에서 실행했다.
- migration은 작성만 했으며 실제 Supabase DB에는 적용하지 않았다.
- Function 배포 및 Feature Flag 변경은 수행하지 않았다.

## 7. Staging 적용 순서

### 사전 확인

1. Staging Supabase project ref와 운영 project ref가 다른지 확인
2. Staging DB 백업 또는 복구 지점 생성
3. migration 적용 목록 검토
4. `public.users.is_admin` 존재 확인
5. `public.current_user_is_admin()` 존재와 `search_path=public` 확인
6. 모든 Assistant 관련 Flag가 안전 기본값인지 확인

안전 기본값:

```text
ASSISTANT_ROUTER_ENABLED=false
ASSISTANT_ROUTER_SHADOW_MODE=true
ASSISTANT_ROUTER_SHADOW_LOG_ENABLED=false
ASSISTANT_ROUTER_SHADOW_LOG_SAMPLE_RATE=1
```

### 적용 순서

1. `20260625000000_assistant_registry.sql`
2. Registry Seed 20개 검증
3. Gmail/Calendar만 enabled인지 확인
4. 나머지 18개가 mock/disabled인지 확인
5. `20260626000000_assistant_router_shadow_logs.sql`
6. Registry와 Shadow Log RLS 역할별 검증
7. Flag OFF 상태로 Staging `ai-chat` 배포
8. 기존 채팅·RAG·Dify·GCS·Plugin·MCP 회귀 테스트
9. Router ON + Shadow ON + Log OFF 검증
10. Router ON + Shadow ON + Log ON 검증
11. 성능·로그 비용·오류율 측정
12. 별도 승인 후 운영 반영 판단

상세 절차:

- `docs/reports/staging-deployment-checklist-assistant-system.md`
- `docs/reports/pre-migration-safety-check-assistant-system.md`

## 8. 위험 요소

### 대부분의 Assistant가 Mock 상태

20개 Function이 존재하지만 Gmail과 Calendar 외 다수는 고정 응답 또는 Mock이다. Registry에서 `mock/disabled` 상태를 유지해야 한다.

### Orchestrator 미구현

현재 Router는 후보만 계산한다. Assistant 실행과 결과 취합은 포함하지 않는다. `selectedAssistants`를 실행 지시로 해석하면 안 된다.

### Registry 일반 사용자 컬럼 노출

일반 인증 사용자는 활성 Registry 행을 조회할 수 있다. RLS는 행을 제한하지만 컬럼을 제한하지 않으므로 `function_name`, model policy, scope, metadata의 공개 범위를 검토해야 한다.

### 관리자 함수 의존성

두 신규 migration은 `public.current_user_is_admin()`에 의존한다. 선행 migration이 없는 DB에서 SQL을 단독 실행하면 policy 생성이 실패할 수 있다.

### 성능 영향

Router Flag를 켜면 모델 호출 전에 Registry 조회가 추가된다. Shadow Log Flag를 켜면 background insert가 추가된다. Staging에서 첫 토큰 p50/p95와 오류율을 측정해야 한다.

### UI 누적 변경

UI 커밋은 기존 WIP에서 이어진 Planner/Sidebar 변경을 최종 파일 상태로 복원했다. ChatInput, MainLayout, Dashboard, AiProductPlannerPage를 집중 검토해야 한다.

### 로그 보존 비용

일반 no-intent 요청을 100% 기록하면 DB 사용량이 증가할 수 있다. 초기 검증 후 sample rate와 30일 보존 정책을 확정해야 한다.

## 9. 롤백 방법

### Shadow Log만 중지

```text
ASSISTANT_ROUTER_SHADOW_LOG_ENABLED=false
```

### Assistant Router 중지

```text
ASSISTANT_ROUTER_ENABLED=false
ASSISTANT_ROUTER_SHADOW_MODE=true
ASSISTANT_ROUTER_SHADOW_LOG_ENABLED=false
```

이 상태에서는 기존 모델 Smart Router 경로만 유지된다.

### 코드 롤백

- 직전 검증된 `ai-chat` Function 버전으로 복귀
- Shadow Logger와 Assistant 후보 선택 연결 제거
- RAG/Dify/GCS/Plugin/MCP 경로는 유지

### DB 논리적 롤백

- Router/Log Flag를 먼저 OFF
- 필요하면 Registry Assistant를 모두 disabled 처리
- 신규 테이블은 즉시 drop하지 않고 보존
- Shadow 로그는 보존 정책에 따라 정리
- down migration 또는 table drop은 별도 승인과 백업 후 수행

### Git 백업

원본 정리 전 상태는 다음 로컬 백업 브랜치에 보존돼 있다.

```text
backup/pre-push-assistant-20260620
```

## 10. 리뷰어 체크리스트

### 커밋과 범위

- [ ] 8개 커밋이 주제별로 적절히 분리됐는가?
- [ ] generated/cache/binary 파일이 제외됐는가?
- [ ] PR에 unrelated 변경이 남아 있지 않은가?
- [ ] UI 누적 변경 범위가 의도와 일치하는가?

### Assistant Function

- [ ] 20개 Assistant Function 이름과 Registry Seed가 일치하는가?
- [ ] Gmail/Calendar만 초기 enabled인가?
- [ ] 나머지 18개는 mock/disabled인가?
- [ ] Assistant Function이 채팅에서 실제 호출되지 않는가?

### Registry와 RLS

- [ ] Registry 제약과 index가 적절한가?
- [ ] `current_user_is_admin()` 선행 의존성이 충족되는가?
- [ ] 일반 사용자가 Registry를 수정할 수 없는가?
- [ ] 일반 사용자 공개 컬럼 범위가 허용 가능한가?
- [ ] service role만 서버 쓰기를 수행하는가?

### Router

- [ ] 기존 provider/model 결과를 변경하지 않는가?
- [ ] 자동 모드에서만 Assistant 후보를 계산하는가?
- [ ] 일반 요청 0~1개, 복합 요청 최대 3개 제한이 강제되는가?
- [ ] Registry 오류 시 `model_only`로 안전하게 복귀하는가?
- [ ] Mock/disabled Assistant가 후보에서 제외되는가?

### Shadow Log와 개인정보

- [ ] prompt/messages/user ID/email/document ID가 저장되지 않는가?
- [ ] Storage path와 Tool/Plugin 입력·출력이 저장되지 않는가?
- [ ] selected Assistant ID가 최대 3개인가?
- [ ] 일반 사용자가 로그를 조회할 수 없는가?
- [ ] insert 또는 `waitUntil()` 실패가 채팅으로 전파되지 않는가?
- [ ] Feature Flag 기본값이 안전한가?

### 기존 기능 회귀

- [ ] 수동 모델 선택이 정상인가?
- [ ] 자동 모델 선택이 정상인가?
- [ ] RAG/Vector Search가 정상인가?
- [ ] Dify 연동이 정상인가?
- [ ] GCS 이미지·파일 경로가 정상인가?
- [ ] Plugin/MCP Tool 목록과 실행이 정상인가?
- [ ] 응답 본문과 스트림 계약이 변경되지 않았는가?

### Staging 승인

- [ ] migration 적용 순서가 승인됐는가?
- [ ] 관리자·일반 사용자·service role RLS 테스트가 준비됐는가?
- [ ] Flag OFF 기준 성능 측정 계획이 있는가?
- [ ] Router/Log 단계별 활성화 계획이 있는가?
- [ ] 롤백 담당자와 명령이 확인됐는가?
- [ ] PR merge 전 Staging 적용 여부가 명확히 결정됐는가?

## 최종 리뷰 요청

이 PR은 Assistant 실행이나 Orchestrator 도입이 아니라 **Registry, Shadow 후보 선택, 진단 로그 및 Marketplace/Workflow 기반 추가**가 목적이다.

리뷰 시 다음 세 영역을 우선 확인한다.

1. Registry Seed/RLS와 migration 안전성
2. 기존 모델·RAG·Dify·Plugin/MCP 경로의 비회귀
3. Shadow 로그의 개인정보 최소화와 실패 격리

PR merge, DB 적용, 배포 및 Feature Flag 활성화는 각각 별도 승인 단계로 진행한다.
