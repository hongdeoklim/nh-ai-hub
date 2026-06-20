# Assistant System DB 적용 전 최종 안전 점검 보고서

작성일: 2026-06-20
점검 범위: Assistant Registry, Assistant Router Shadow Mode, Shadow 진단 로그
DB 적용·배포·Git 작업: 수행하지 않음

## 1. 결론: 보류

두 migration의 구조와 적용 순서는 전반적으로 타당하며 다음 핵심 안전장치는 확인됐다.

- 기존 20개 Assistant Function과 Registry Seed 이름이 일치한다.
- Gmail과 Calendar만 `enabled = true`다.
- 나머지 18개 Assistant는 `status = 'mock'`, `enabled = false`다.
- Router, Shadow logger 및 DB 제약에서 후보 수를 최대 3개로 제한한다.
- Shadow 로그 테이블과 insert DTO에는 프롬프트·사용자·문서·Storage·도구 원문 필드가 없다.
- Assistant Router와 Shadow 로그 Feature Flag 기본값은 안전하다.
- Assistant와 Orchestrator는 실행되지 않는다.
- 기존 모델·RAG·Dify·GCS·Plugin·MCP 응답 경로를 교체하지 않는다.

다만 운영 또는 Staging DB 적용 전에 다음 1건은 수정 후 재검증하는 것이 필요하다.

> `scheduleAssistantRouterShadowLog()`는 DB insert 오류를 내부에서 처리하지만 `EdgeRuntime.waitUntil(task)` 호출 자체는 `try/catch`로 감싸지 않는다. Runtime scheduling API가 예외를 던지는 비정상 상황에는 `ai-chat`까지 예외가 전파될 가능성을 완전히 배제할 수 없다.

추가로 다음 두 항목은 배포 전 조건 확인이 필요하다.

- `public.current_user_is_admin()` 선행 함수가 없는 DB에서 migration을 단독 실행하면 RLS policy 생성이 실패한다.
- 일반 인증 사용자는 활성 Registry 행의 모든 컬럼을 조회할 수 있다. 쓰기 권한은 없지만 `function_name`, 모델 정책, scope, metadata까지 공개할 필요가 있는지 최소 권한 관점에서 확정해야 한다.

따라서 현재 판정은 **구조적으로 적용 준비에 근접했으나, 운영 적용은 보류**다.

## 2. 안전 확인 항목

### 2.1 Assistant Registry migration

대상: `supabase/migrations/20260625000000_assistant_registry.sql`

확인 결과:

- `assistant_id`와 `function_name`에 unique 제약이 있다.
- `status`는 `mock`, `partial`, `ready`, `deprecated`로 제한된다.
- `cost_level`은 `low`, `medium`, `high`로 제한된다.
- `max_execution_ms`는 1초 이상 120초 이하로 제한된다.
- `metadata`는 JSON object만 허용한다.
- `task_types`에 GIN index가 있다.
- `updated_at` trigger 함수에 `search_path = public`이 지정되어 있다.
- Registry 추가는 기존 Assistant Function, 채팅, Workflow 및 모델 테이블을 변경하지 않는다.
- Seed는 `on conflict (assistant_id) do nothing`이므로 재실행 시 관리자 변경 상태를 덮어쓰지 않는다.

판정: **안전 확인.** 단, 기존 충돌 데이터가 있으면 Seed가 자동 교정되지 않으므로 적용 후 대조 쿼리가 필요하다.

### 2.2 20개 Assistant Seed와 실제 Function 이름

| 번호 | Registry function_name | Function 디렉터리 | 상태 |
|---:|---|---|---|
| 01 | `assistant-01-gmail` | 존재 | 일치 |
| 02 | `assistant-02-calendar` | 존재 | 일치 |
| 03 | `assistant-03-notion` | 존재 | 일치 |
| 04 | `assistant-04-sheets` | 존재 | 일치 |
| 05 | `assistant-05-drive` | 존재 | 일치 |
| 06 | `assistant-06-design` | 존재 | 일치 |
| 07 | `assistant-07-video` | 존재 | 일치 |
| 08 | `assistant-08-calendly` | 존재 | 일치 |
| 09 | `assistant-09-research` | 존재 | 일치 |
| 10 | `assistant-10-zapier` | 존재 | 일치 |
| 11 | `assistant-11-ads` | 존재 | 일치 |
| 12 | `assistant-12-youtube` | 존재 | 일치 |
| 13 | `assistant-13-notion-ai` | 존재 | 일치 |
| 14 | `assistant-14-forms` | 존재 | 일치 |
| 15 | `assistant-15-content` | 존재 | 일치 |
| 16 | `assistant-16-heygen` | 존재 | 일치 |
| 17 | `assistant-17-discord` | 존재 | 일치 |
| 18 | `assistant-18-figma` | 존재 | 일치 |
| 19 | `assistant-19-clickup` | 존재 | 일치 |
| 20 | `assistant-20-slack` | 존재 | 일치 |

확인 결과:

- Registry Seed Function 20개와 실제 Assistant Function 디렉터리 20개가 정확히 일치한다.
- Gmail과 Calendar만 `status = 'partial'`, `enabled = true`다.
- 나머지 18개는 `status = 'mock'`, `enabled = false`다.
- Router는 `enabled = true`이고 `status IN ('partial', 'ready')`인 행만 조회한다.

판정: **안전 확인.**

### 2.3 Registry RLS

관리자 정책:

- `public.current_user_is_admin()`이 true인 인증 사용자만 전체 CRUD가 가능하다.

일반 사용자 정책:

- `enabled = true`
- `status IN ('partial', 'ready')`
- SELECT만 가능
- INSERT, UPDATE, DELETE 권한 없음

Service Role:

- 전체 권한이 부여된다.
- 서버 Router는 service-role client를 사용한다.

판정: **쓰기 권한은 안전하다.**

주의:

- RLS는 행만 제한하고 컬럼은 제한하지 않는다.
- 일반 인증 사용자는 활성 행의 `function_name`, `default_model`, `fallback_model`, `permission_scopes`, `metadata`를 조회할 수 있다.
- 현재 Seed metadata는 비어 있고 credential은 저장하지 않으므로 즉각적인 비밀 유출은 아니다.
- 운영 정책상 일반 사용자에게 모든 Registry 컬럼이 필요하지 않다면 제한된 View/RPC 또는 컬럼별 grant를 사용하는 것이 더 안전하다.

### 2.4 `current_user_is_admin()` 의존성

선행 migration `20260518280000_admin_plugins_health.sql`에서 다음이 확인됐다.

- `public.users.is_admin` 컬럼을 보장한다.
- `public.current_user_is_admin()`을 `SECURITY DEFINER`로 정의한다.
- `search_path = public`이 지정되어 있다.
- `auth.uid()`와 `public.users.id`를 비교한다.
- `is_admin = true` 또는 `role = 'admin'`인 사용자만 true다.
- authenticated role에 함수 실행 권한을 부여한다.

판정: **전체 migration 순서대로 적용하면 안전하다.**

주의:

- `20260625000000` 또는 `20260626000000`을 SQL Editor에서 단독 실행하기 전에 함수 존재를 확인해야 한다.
- 운영 적용 전 함수 소유자가 불필요하게 광범위한 권한을 갖지 않는지 확인해야 한다.
- `public.users`의 관리자 상태 변경 권한도 별도로 제한되어 있어야 한다.

### 2.5 Shadow 로그 migration

대상: `supabase/migrations/20260626000000_assistant_router_shadow_logs.sql`

확인 결과:

- identity bigint PK를 사용해 UUID보다 로그 저장 비용이 작다.
- `request_complexity` 허용 값이 제한된다.
- `selection_mode` 허용 값이 제한된다.
- `cost_level` 허용 값이 제한된다.
- `candidate_count`는 0~3으로 제한된다.
- `selected_assistant_ids` cardinality는 최대 3으로 제한된다.
- `candidate_count`와 Assistant ID 배열 길이가 일치해야 한다.
- 음수 `decision_latency_ms`를 허용하지 않는다.
- 인덱스는 request type과 생성 시각의 복합 인덱스 하나만 추가한다.

판정: **안전 확인.**

### 2.6 Shadow 로그 RLS

- RLS가 활성화된다.
- service role만 INSERT, UPDATE, DELETE가 가능하다.
- authenticated role은 SELECT grant만 받는다.
- authenticated SELECT 정책은 `current_user_is_admin()`을 통과한 관리자만 허용한다.
- anon과 authenticated의 기존 권한을 먼저 revoke한 뒤 authenticated에는 SELECT만 다시 부여한다.
- 일반 인증 사용자는 Shadow 로그를 조회할 수 없다.

판정: **안전 확인.**

### 2.7 금지 데이터 부재

Shadow 로그 테이블에는 다음 컬럼이 없다.

- prompt
- messages
- user_id / userId
- user email
- document_id / documentId
- 문서 원문 또는 사용자 입력 요약
- storage path / Storage URL
- email content
- tool input/output
- Plugin input/output
- conversation ID

Logger insert DTO에도 위 정보가 포함되지 않는다.

저장되는 값:

- request type
- request complexity
- selection mode
- 최대 3개의 Assistant ID
- 허용 목록 reason code
- 비용 등급
- fallback reason code
- 후보 수
- 결정 지연 시간
- Router 버전

사람용 `reason` 문자열은 `NHAssistantPlan`에 남아 있지만 DB insert에는 포함되지 않는다.

판정: **안전 확인.**

### 2.8 최대 3개 제한

세 계층에서 제한한다.

1. Router: 복합 요청의 `MAX_COMPOUND_ASSISTANTS = 3`
2. Logger: `selectedAssistants.slice(0, 3)`
3. DB: `cardinality(selected_assistant_ids) <= 3` 및 `candidate_count between 0 and 3`

판정: **안전 확인.**

### 2.9 Feature Flag 기본값

| Flag | 기본값 | 의미 |
|---|---:|---|
| `ASSISTANT_ROUTER_ENABLED` | false | Assistant 후보 계산 전체 비활성 |
| `ASSISTANT_ROUTER_SHADOW_MODE` | true | 활성화하더라도 실행하지 않고 Shadow 판정 |
| `ASSISTANT_ROUTER_SHADOW_LOG_ENABLED` | false | DB 진단 로그 기록 비활성 |
| `ASSISTANT_ROUTER_SHADOW_LOG_SAMPLE_RATE` | 1 | 정상 로그 샘플링 100%, 0~1로 clamp |

후보 선택 또는 오류 fallback은 로그 Flag가 켜져 있으면 sample rate와 무관하게 기록된다. 일반 no-intent 요청은 sample rate를 적용한다.

판정: **기본 상태 안전.**

### 2.10 기존 경로 영향

확인 결과:

- Assistant Router는 자동 모델 선택 분기에서만 호출된다.
- Router Flag가 false면 즉시 null을 반환하고 Registry DB를 조회하지 않는다.
- Assistant 후보는 계산만 하며 Function을 호출하지 않는다.
- Orchestrator가 없다.
- `allMcpMocks: false`를 변경하지 않았다.
- RAG, Dify, GCS, Plugin/MCP 도구 구성 코드는 변경하지 않았다.
- 기존 모델 ID와 provider 선택 결과를 Assistant가 덮어쓰지 않는다.
- 사용자 응답 metadata에 Shadow 로그를 추가하지 않는다.

영향:

- Router Flag를 활성화하면 모델 호출 전에 Registry 조회가 한 번 추가되어 지연 시간이 증가할 수 있다.
- Shadow 로그 Flag를 활성화하면 DB insert background task가 추가된다.
- 응답 내용과 실행 Tool 목록은 변경되지 않는다.

판정: **기능 경로는 유지된다. 성능 영향은 Staging 측정 필요.**

## 3. 위험 항목

### 3.1 보류 항목: `EdgeRuntime.waitUntil()` 예외 전파 가능성

현재 logger는 다음 오류를 내부에서 처리한다.

- 테이블 미적용
- RLS/권한 오류
- insert 실패
- Supabase client 예외

그러나 다음 호출 자체는 보호되지 않는다.

```ts
EdgeRuntime.waitUntil(task)
```

Runtime API가 초기화되지 않았거나 scheduling 과정에서 동기 예외를 던지면 `scheduleAssistantRouterShadowLog()` 호출자까지 전파될 수 있다.

필요 조치:

- `waitUntil()` 호출을 `try/catch`로 감싼다.
- catch에서 이미 생성된 task가 자체 오류 처리를 수행하도록 두고 채팅에는 예외를 던지지 않는다.
- Runtime API 비정상 테스트를 추가한다.

심각도: **중간 — DB 적용 전 수정 권장, 운영 적용 전 필수.**

### 3.2 Registry 일반 사용자 컬럼 노출

일반 사용자는 활성 Assistant 행 전체 컬럼을 조회할 수 있다.

현재 데이터에는 credential이 없어 즉각적인 보안 사고는 아니지만 향후 `metadata`에 내부 설정이 추가되면 과다 노출이 될 수 있다.

필요 조치 후보:

- metadata에 credential·내부 endpoint·관리자 정책 저장 금지
- 일반 사용자용 제한 View 또는 RPC 제공
- 클라이언트에 필요한 컬럼만 grant하는 방안 검토

심각도: **낮음~중간 — 적용 전 정책 결정 필요.**

### 3.3 선행 관리자 함수 의존성

`current_user_is_admin()`이 없으면 두 신규 migration의 관리자 정책 생성이 실패한다.

필요 조치:

- migration 전체 순서로 적용
- 적용 전 함수 존재와 실행 결과 확인
- SQL Editor 단독 실행 금지 또는 선행 검증 블록 사용

심각도: **중간 — 적용 절차로 방지 가능.**

### 3.4 Seed 충돌 시 자동 복구되지 않음

`on conflict (assistant_id) do nothing`이므로 기존 잘못된 행이 있으면 migration 재실행으로 교정되지 않는다. 또한 다른 `assistant_id`가 같은 `function_name`을 이미 사용하면 unique 충돌로 migration이 실패할 수 있다.

필요 조치:

- 적용 전 `assistant_registry` 테이블 존재 여부 확인
- 적용 후 20개 mapping 대조
- enabled/status 대조

심각도: **낮음 — 신규 테이블이면 문제 없음.**

### 3.5 Background task 유실 가능성

`EdgeRuntime`이 없는 환경에서는 `void task`로 실행한다. 채팅 실패는 발생하지 않지만 Runtime 종료 시 로그가 유실될 수 있다.

영향:

- 진단 로그 누락 가능
- 서비스 기능에는 영향 없음

심각도: **낮음 — Staging 로그 수집률 확인 필요.**

### 3.6 전체 `ai-chat` Deno 검사 기준선

Router와 신규 logger의 개별 Deno 검사는 통과했지만, 전체 `ai-chat` Deno 검사는 기존 코드의 별도 타입/중복 선언/MCP 관련 오류 때문에 깨끗한 기준선을 제공하지 못하는 상태가 이전 점검에서 확인됐다.

영향:

- 신규 변경만의 정적 안전성을 전체 Function 단위로 증명하기 어렵다.

심각도: **중간 — 배포 전 기존 Deno 오류를 별도 정리하거나 변경 전후 오류 목록이 동일한지 비교 필요.**

## 4. DB 적용 순서

운영 DB가 아니라 Staging에서 먼저 수행해야 한다.

### 선행 확인

1. 기존 migration이 `20260518280000_admin_plugins_health.sql`까지 적용되어 있는지 확인
2. `public.users.is_admin` 컬럼 존재 확인
3. `public.current_user_is_admin()` 함수 존재 확인
4. 관리자 계정에서 함수가 true, 일반 계정에서 false인지 확인
5. `assistant_registry`와 `assistant_router_shadow_logs` 테이블이 아직 없는지 확인

### 적용 순서

1. `20260625000000_assistant_registry.sql`
2. Registry Seed 20개 및 상태 검증
3. `20260626000000_assistant_router_shadow_logs.sql`
4. Shadow 로그 RLS 및 identity sequence 권한 검증
5. Edge Function 코드는 Flag OFF 상태로 배포 검증
6. Staging에서 Router Shadow Mode만 활성화
7. 마지막으로 Shadow 로그 Flag 활성화

`20260626000000`을 `20260625000000`보다 먼저 적용하지 않는다. 로그 테이블 자체는 Registry FK가 없지만 코드·운영 의미와 검증 순서를 일관되게 유지해야 한다.

### 적용 후 Registry 검증 SQL

```sql
select assistant_id, function_name, status, enabled, sort_order
from public.assistant_registry
order by sort_order;
```

예상 결과:

- 총 20행
- `assistant-01-gmail`, `assistant-02-calendar`만 enabled
- enabled 행 2개
- mock/disabled 행 18개
- function_name 중복 0개

### 적용 후 RLS 검증

- service role: Registry 및 Shadow 로그 전체 접근 가능
- 관리자 authenticated: Registry 관리 가능, Shadow 로그 SELECT 가능
- 일반 authenticated: 활성 Registry 두 행만 SELECT 가능, Shadow 로그 SELECT 불가
- anon: 두 테이블 접근 불가

## 5. 필요한 Feature Flag

### DB 적용 및 코드 배포 직후

```text
ASSISTANT_ROUTER_ENABLED=false
ASSISTANT_ROUTER_SHADOW_MODE=true
ASSISTANT_ROUTER_SHADOW_LOG_ENABLED=false
ASSISTANT_ROUTER_SHADOW_LOG_SAMPLE_RATE=1
```

이 상태에서는 Assistant 후보 조회와 로그 기록이 모두 비활성이다.

### Staging Router 검증

```text
ASSISTANT_ROUTER_ENABLED=true
ASSISTANT_ROUTER_SHADOW_MODE=true
ASSISTANT_ROUTER_SHADOW_LOG_ENABLED=false
ASSISTANT_ROUTER_SHADOW_LOG_SAMPLE_RATE=1
```

후보는 콘솔에서만 확인하고 DB 로그는 기록하지 않는다.

### Staging 로그 검증

```text
ASSISTANT_ROUTER_ENABLED=true
ASSISTANT_ROUTER_SHADOW_MODE=true
ASSISTANT_ROUTER_SHADOW_LOG_ENABLED=true
ASSISTANT_ROUTER_SHADOW_LOG_SAMPLE_RATE=1
```

초기 테스트 후 일반 no-intent 로그 비용을 줄이려면 sample rate를 `0.05` 또는 `0.1`로 낮춘다. 후보 선택 및 오류 fallback은 계속 기록된다.

금지 상태:

- 현재 단계에서는 `ASSISTANT_ROUTER_SHADOW_MODE=false`로 운영하지 않는다.
- Orchestrator가 없으므로 이 값을 끄더라도 Assistant가 실행되지는 않지만 검증된 Shadow 운영 범위를 벗어난다.

## 6. Staging 테스트 체크리스트

### Migration

- [ ] `current_user_is_admin()` 존재 확인
- [ ] `20260625000000` 적용 성공
- [ ] Registry 총 20행 확인
- [ ] Function 이름 20개 대조
- [ ] Gmail/Calendar enabled 확인
- [ ] 나머지 18개 mock/disabled 확인
- [ ] `20260626000000` 적용 성공
- [ ] identity sequence 권한 확인

### RLS

- [ ] anon Registry 접근 거부
- [ ] anon Shadow 로그 접근 거부
- [ ] 일반 사용자 Registry 활성 행만 조회
- [ ] 일반 사용자 Registry INSERT/UPDATE/DELETE 거부
- [ ] 일반 사용자 Shadow 로그 SELECT 거부
- [ ] 일반 사용자 Shadow 로그 INSERT/UPDATE/DELETE 거부
- [ ] 관리자 Registry 관리 가능
- [ ] 관리자 Shadow 로그 SELECT 가능
- [ ] service role Shadow 로그 INSERT 가능

### Router

- [ ] 일반 대화 selected Assistant 0개
- [ ] Gmail 조회 요청 Gmail 1개
- [ ] Calendar 조회 요청 Calendar 1개
- [ ] Gmail+Calendar 복합 요청 2개
- [ ] 어떤 요청도 3개 초과하지 않음
- [ ] Disabled/Mock Assistant가 후보가 되지 않음
- [ ] Registry 조회 실패 시 기존 모델 응답 정상

### Shadow 로그

- [ ] 로그 Flag OFF에서 insert 없음
- [ ] Shadow Mode에서만 insert 발생
- [ ] `selected_assistant_ids` 최대 3개
- [ ] candidate count와 배열 길이 일치
- [ ] reason 문장 미저장
- [ ] prompt/messages/user/email/document/storage/tool 데이터 미저장
- [ ] 잘못된 4개 후보 insert를 DB가 거부
- [ ] 음수 latency insert를 DB가 거부
- [ ] insert 실패 시 채팅 응답 정상
- [ ] 테이블 미존재 오류 시 채팅 응답 정상
- [ ] `waitUntil()` 예외 모의 테스트 시 채팅 응답 정상 — 현재 수정 후 확인 필요

### 기존 기능 회귀

- [ ] 수동 모델 선택 결과 동일
- [ ] 자동 모델 선택 결과 동일
- [ ] RAG 회사 문서 응답 동일
- [ ] Dify 경로 동일
- [ ] GCS 이미지/파일 경로 동일
- [ ] Plugin 도구 목록 동일
- [ ] MCP 도구 목록 동일
- [ ] Public Data 경로 동일
- [ ] 응답 본문과 스트림 형식 동일
- [ ] Assistant Function 호출 0회

### 성능

- [ ] Flag OFF 기준 지연 변화 없음
- [ ] Router ON 상태의 Registry 조회 지연 측정
- [ ] 로그 ON 상태의 응답 지연 측정
- [ ] Background 로그 유실률 확인
- [ ] 일일 로그 행 수와 저장 용량 추정

## 7. 운영 적용 전 확인사항

### 필수

- `EdgeRuntime.waitUntil()` 예외 전파 방지 수정 및 재검증
- Staging migration 성공
- Staging RLS 전 역할 테스트 성공
- 20개 Registry mapping 결과 캡처
- 일반 사용자 Registry 컬럼 공개 범위 승인
- 전체 `ai-chat` 변경 전후 Deno 오류 기준선 비교
- 응답 스트림 회귀 테스트
- Assistant Function 호출이 발생하지 않는지 로그 확인
- Feature Flag 초기값 OFF 확인

### 환경변수

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- 기존 `ai-chat` 필수 모델/API 환경변수
- `ASSISTANT_ROUTER_ENABLED`
- `ASSISTANT_ROUTER_SHADOW_MODE`
- `ASSISTANT_ROUTER_SHADOW_LOG_ENABLED`
- `ASSISTANT_ROUTER_SHADOW_LOG_SAMPLE_RATE`

신규 Shadow logger는 별도 API Key를 요구하지 않는다. 기존 service-role client를 사용한다.

### 운영 정책

- Shadow 로그 보존 기간 30일 권장
- 관리자 외 직접 조회 금지
- metadata에 secret 저장 금지
- 초기 no-intent sample rate 5~10% 권장
- 후보 및 오류 fallback은 초기 검증 기간 100% 기록
- 로그 비용과 선택률을 7일 단위로 검토

## 8. 롤백 방법

### 1단계: 로그 즉시 중지

```text
ASSISTANT_ROUTER_SHADOW_LOG_ENABLED=false
```

효과:

- Shadow 로그 insert 중단
- Router 후보 계산은 계속 가능
- 기존 모델 응답 유지

### 2단계: Assistant Router 중지

```text
ASSISTANT_ROUTER_ENABLED=false
ASSISTANT_ROUTER_SHADOW_MODE=true
```

효과:

- Registry 조회 중단
- Assistant 후보 계산 중단
- 기존 모델 Smart Router 직접 경로 유지

### 3단계: 코드 분기 롤백

- `ai-chat`의 Shadow logger 호출만 제거
- 필요하면 `selectAssistantCandidates()` 호출만 제거
- 기존 `determineRoute()`는 유지
- RAG/Dify/GCS/Plugin/MCP 코드는 건드리지 않음

### 4단계: DB 논리적 롤백

- 테이블을 즉시 삭제하지 않고 사용을 중단한다.
- Registry 행은 모두 `enabled = false`로 전환할 수 있다.
- Shadow 로그는 보존 정책에 따라 삭제한다.
- migration down 작업은 백업과 영향 확인 후 별도 승인으로 수행한다.

권장 순서:

```text
로그 Flag OFF
→ Router Flag OFF
→ 채팅 정상 확인
→ 필요 시 코드 연결 제거
→ 마지막에 DB 정리 검토
```

## 9. 다음 단계 제안

운영 DB 적용 전에 다음 최소 수정만 별도 승인받아 수행한다.

1. `scheduleAssistantRouterShadowLog()`의 scheduling 구간 전체를 `try/catch`로 보호
2. `EdgeRuntime.waitUntil()` 예외 모의 테스트 추가
3. 일반 사용자 Registry 공개 컬럼 정책 확정
4. Router/logger Deno 검사 재실행
5. `npm run build`와 `git diff --check` 재실행
6. 전체 `ai-chat` 기존 오류 기준선 비교

위 항목이 완료되면 Staging 적용 판정을 다시 수행한다. 운영 적용은 Staging에서 Seed, RLS, Flag, 로그 유실률 및 기존 응답 회귀가 모두 확인된 후 진행한다.
