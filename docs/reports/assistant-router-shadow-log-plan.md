# NH AI Hub Assistant Router Shadow Log 계획

작성일: 2026-06-20
문서 상태: 설계안 — 기능 코드 및 DB 적용 전
대상 범위: Assistant Router Shadow Mode의 내부 진단 로그

## 설계 원칙

- Assistant 후보 선택 결과만 기록하며 Assistant를 실행하지 않는다.
- Orchestrator, Plugin, MCP 및 Public Data Tool을 실행하지 않는다.
- 기존 `ai-chat` 응답 본문, 스트림, 모델 선택 및 RAG/Dify 경로를 변경하지 않는다.
- 프롬프트, 문서 원문, 이메일 내용, 사용자 입력 요약을 저장하지 않는다.
- 후보 Assistant ID는 최대 3개만 저장한다.
- 로그 저장 실패가 채팅 실패나 지연 확대로 이어지지 않도록 한다.
- 일반 사용자는 로그를 조회할 수 없고 관리자 또는 서버만 접근할 수 있어야 한다.
- 전용 Feature Flag로 즉시 기록을 중단할 수 있어야 한다.

## 1. 현재 Shadow Mode 구조 요약

### 1.1 Router 출력

`supabase/functions/_shared/nh-smart-routing.ts`에는 다음 구조가 구현되어 있다.

- 기존 `NHRouteResult`
  - `taskType`
  - `provider`
  - `modelId`
  - `estimatedCostUsd`
- 선택적인 `assistantPlan`
  - `mode`
  - `selectionMode`
  - `requestComplexity`
  - `selectedAssistants`
  - `maxAssistants`
  - `estimatedCostLevel`
  - `reason`
  - `fallback`
- Assistant 후보별 정보
  - `assistantId`
  - `reasonCode`
  - `confidence`
  - `costLevel`
  - 모델 호환성

현재 자동 모드에서만 Assistant 후보를 계산한다. Feature Flag 기본값은 다음과 같다.

- `ASSISTANT_ROUTER_ENABLED=false`
- `ASSISTANT_ROUTER_SHADOW_MODE=true`

### 1.2 `ai-chat` 연결

`supabase/functions/ai-chat/index.ts`는 기존 모델 Smart Router 결과를 만든 뒤 `selectAssistantCandidates()`를 호출한다.

Shadow Mode에서는 다음 정보만 서버 콘솔에 출력한다.

- 선택된 Assistant ID 배열
- 요청 복잡도

Shadow Mode가 아닌 경우에만 `routeRes.assistantPlan`에 계획을 연결한다. 어느 경우에도 Assistant Function은 호출하지 않는다.

### 1.3 현재 관측성의 한계

- 콘솔 로그는 집계와 장기 비교가 어렵다.
- `request_type`별 선택률을 계산할 수 없다.
- 후보가 선택되지 않은 이유를 구조적으로 구분하지 못한다.
- 비용 등급별 분포를 조회할 수 없다.
- Registry 조회 실패와 정상적인 `model_only` 결정을 구분하기 어렵다.
- 현재 `reason`은 사람용 문장이므로 안정적인 통계 키로 사용하기 어렵다.

## 2. 필요한 로그 정보

### 2.1 필수 필드

| 필드 | 형식 | 목적 |
|---|---|---|
| `request_type` | text | 기존 `NHExtendedTaskType`별 선택 분포 |
| `request_complexity` | text | simple/standard/compound 분포 |
| `selection_mode` | text | none/single/limited_parallel 구분 |
| `selected_assistant_ids` | text[] | 선택된 후보, 최대 3개 |
| `selection_reason_codes` | text[] | 안정적인 선택 사유 코드 |
| `cost_level` | text | low/medium/high 예상 비용 등급 |
| `fallback_reason_code` | text nullable | 후보가 없거나 실패한 이유 |
| `candidate_count` | smallint | 선택 후보 수 검증 |
| `decision_latency_ms` | integer nullable | Router 후보 계산 비용 측정 |
| `router_version` | text | 알고리즘 버전 비교 |
| `created_at` | timestamptz | 기간별 분석 및 보존 정책 |

### 2.2 선택 필드

다음 필드는 모델 정책과 Assistant 호환성 검증이 필요할 때만 추가한다.

- `route_provider`
- `route_model_id`

공급자와 모델 ID는 일반적으로 민감정보가 아니며 Assistant 기본 모델과의 호환성 분석에 유용하다. 다만 최초 최소 구현에서는 생략해도 된다.

### 2.3 안정적인 사유 코드

사람용 `reason` 문장을 DB에 저장하지 않고 사유 코드를 저장한다.

선택 사유 코드:

- `explicit_service_intent`
- `task_match`
- `compound_request`
- `required_tool_match`
- `public_data_match`

Fallback 사유 코드:

- `no_explicit_assistant_intent`
- `no_eligible_candidate`
- `registry_unavailable`
- `permission_unverified`
- `required_extension_unavailable`
- `cost_policy_blocked`
- `router_exception`

현재 구현에는 `reasonCode`가 있지만 `model_only` 결과에는 안정적인 fallback 코드가 없다. 로그 구현 전에 `NHAssistantPlan`에 선택 필드인 `fallbackReasonCode`를 추가하는 것이 필요하다.

### 2.4 저장 예시

```json
{
  "request_type": "GOOGLE_WORKSPACE",
  "request_complexity": "compound",
  "selection_mode": "limited_parallel",
  "selected_assistant_ids": [
    "gmail-assistant",
    "calendar-assistant"
  ],
  "selection_reason_codes": [
    "compound_request"
  ],
  "cost_level": "low",
  "fallback_reason_code": null,
  "candidate_count": 2,
  "decision_latency_ms": 8,
  "router_version": "assistant-shadow-v1"
}
```

## 3. 저장하면 안 되는 정보

다음 정보는 Shadow 진단 로그에 저장하지 않는다.

- 사용자 프롬프트 원문
- 프롬프트 일부 또는 자동 요약
- RAG/Dify 검색어와 검색 결과
- 회사 문서, 규정, 계약서, 이메일 및 일정 원문
- 이미지, 첨부파일 이름, URL 또는 Storage 경로
- Plugin/MCP 입력·출력
- API Key, OAuth Token, credential ciphertext
- 사용자 이메일, 이름, 전화번호
- 대화 ID 또는 문서 ID
- `function_name`
- Assistant가 제외된 상세 권한 정보
- 내부 관리자 비용 한도
- 오류 객체 전체 또는 DB 오류 원문

### 3.1 사용자 식별정보

최소 구현에서는 `user_id`와 `department`를 저장하지 않는 것을 권장한다. Shadow 단계의 목적은 알고리즘 선택률과 오선택 패턴을 검증하는 것이며 개인별 행동 추적이 아니다.

향후 사용자별 품질 분석이 반드시 필요하면 별도 개인정보 검토 후 다음 중 하나를 사용한다.

- 짧은 보존기간의 별도 접근제어 테이블
- 서버 비밀키 기반의 회전 가능한 pseudonymous actor hash
- 최소 인원 관리자만 접근 가능한 집계 결과

원본 `user_id`를 편의상 추가하는 것은 피한다.

### 3.2 오류 기록

DB 오류 또는 예외는 허용 목록 코드로 변환한다.

```text
42P01 → registry_unavailable
권한 확인 실패 → permission_unverified
그 밖의 예외 → router_exception
```

`error.message`, stack trace 및 요청 데이터는 Shadow DB 로그에 저장하지 않는다. 서버 운영 로그에도 민감정보가 포함되지 않도록 오류 코드만 남긴다.

## 4. 기존 테이블과 신규 테이블 비교

### 4.1 `ai_assistant_logs` 재사용

장점:

- 이미 존재하는 테이블이다.
- 별도 migration이 필요하지 않을 수 있다.

문제점:

- 실제 Assistant 실행 결과를 저장하기 위한 의미를 가진다.
- `assistant_name`, `task_description`, `result_text`, `status` 중심이라 Router 결정 구조와 맞지 않는다.
- Assistant를 실행하지 않았는데 실행 로그처럼 기록되어 운영 지표를 왜곡한다.
- 현재 인증 사용자 SELECT 정책이 `USING (true)`여서 모든 인증 사용자가 로그를 조회할 가능성이 있다.
- 배열 후보, 비용 등급, fallback 코드를 구조적으로 저장하기 어렵다.

판단: **사용하지 않는다.**

### 4.2 `tool_execution_logs` 재사용

장점:

- 비용, 지연 시간 및 오류 코드 필드가 존재한다.
- 관리자/사용자 RLS가 이미 있다.

문제점:

- 실제 Plugin Tool 실행을 기록하기 위한 테이블이다.
- `tool_name`이 필수이며 Shadow Mode에서는 도구를 실행하지 않는다.
- Assistant 후보 결정을 Tool 실행으로 기록하면 실행 횟수와 비용 통계가 왜곡된다.
- `extension_id`와 selected Assistant 배열을 자연스럽게 표현할 수 없다.

판단: **사용하지 않는다.**

### 4.3 `smart_router_policies` 재사용

장점:

- Smart Router와 관련된 기존 테이블이다.

문제점:

- 정책 정의 테이블이지 이벤트 로그가 아니다.
- 로그를 추가하면 정책 행과 실행 행의 수명주기 및 RLS가 섞인다.

판단: **사용하지 않는다.**

### 4.4 전용 테이블

장점:

- Assistant 실행과 Router 결정을 명확히 분리한다.
- 필요한 최소 필드만 저장할 수 있다.
- 짧은 보존기간과 샘플링 정책을 독립적으로 적용할 수 있다.
- 관리자 전용 RLS를 적용할 수 있다.
- Feature Flag를 끄면 기존 시스템에 영향 없이 기록을 중단할 수 있다.

단점:

- 신규 migration과 관리 정책이 필요하다.
- 로그 보존 및 정리 절차가 필요하다.

판단: **`assistant_router_shadow_logs` 신규 테이블을 권장한다.**

## 5. 최소 DB 변경안

아래 SQL은 설계 초안이며 실제 적용하지 않는다.

```sql
create table public.assistant_router_shadow_logs (
  id bigint generated always as identity primary key,
  request_type text not null,
  request_complexity text not null
    check (request_complexity in ('simple', 'standard', 'compound')),
  selection_mode text not null
    check (selection_mode in ('none', 'single', 'limited_parallel', 'sequential')),
  selected_assistant_ids text[] not null default '{}'::text[]
    check (cardinality(selected_assistant_ids) <= 3),
  selection_reason_codes text[] not null default '{}'::text[],
  cost_level text not null
    check (cost_level in ('low', 'medium', 'high')),
  fallback_reason_code text,
  candidate_count smallint not null default 0
    check (candidate_count between 0 and 3),
  decision_latency_ms integer
    check (decision_latency_ms is null or decision_latency_ms >= 0),
  router_version text not null default 'assistant-shadow-v1',
  created_at timestamptz not null default now(),
  check (candidate_count = cardinality(selected_assistant_ids))
);

create index assistant_router_shadow_logs_type_created_idx
  on public.assistant_router_shadow_logs(request_type, created_at desc);

alter table public.assistant_router_shadow_logs enable row level security;

create policy assistant_router_shadow_logs_admin_select
  on public.assistant_router_shadow_logs
  for select
  to authenticated
  using (public.current_user_is_admin());

create policy assistant_router_shadow_logs_service_all
  on public.assistant_router_shadow_logs
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.assistant_router_shadow_logs to authenticated;
grant all on public.assistant_router_shadow_logs to service_role;
grant usage, select on sequence public.assistant_router_shadow_logs_id_seq to service_role;
```

### 5.1 설계 이유

- UUID 대신 identity bigint를 사용해 행당 저장 공간과 인덱스 비용을 줄인다.
- Registry FK를 두지 않는다. Registry 레코드가 변경·삭제되어도 과거 진단 로그는 유지되어야 한다.
- `selected_assistant_ids`는 최대 3개를 DB check로도 강제한다.
- 요청 원문과 사용자 ID 컬럼을 만들지 않아 실수로 저장할 경로를 줄인다.
- 하나의 복합 인덱스만 두어 쓰기 비용을 제한한다.

### 5.2 보존 기간

초기 권장 보존 기간은 30일이다.

최소 단계에서는 별도 Cron을 즉시 추가하지 않고 관리자 작업으로 오래된 행을 정리한다. 로그 양이 확인된 뒤 기존 예약 작업 체계로 다음 쿼리를 실행하도록 설계할 수 있다.

```sql
delete from public.assistant_router_shadow_logs
where created_at < now() - interval '30 days';
```

보존 작업을 추가할 때도 기존 Assistant Cron이나 Workflow와 섞지 않고 독립 작업으로 둔다.

## 6. 최소 코드 변경안

아래는 구현 승인 이후의 후보이며 현재 수정하지 않는다.

### 6.1 `nh-smart-routing.ts`

`NHAssistantPlan`에 안정적인 fallback 코드를 추가한다.

```ts
type NHAssistantFallbackReasonCode =
  | "no_explicit_assistant_intent"
  | "no_eligible_candidate"
  | "registry_unavailable"
  | "permission_unverified"
  | "required_extension_unavailable"
  | "cost_policy_blocked"
  | "router_exception"

interface NHAssistantPlan {
  // 기존 필드 유지
  fallbackReasonCode?: NHAssistantFallbackReasonCode
}
```

변경 원칙:

- 기존 사람용 `reason`은 유지한다.
- DB에는 `reason`을 저장하지 않는다.
- `modelOnlyAssistantPlan()`이 명시적인 fallback 코드를 받도록 한다.
- 후보 선택 성공 시 Assistant의 기존 `reasonCode`만 기록한다.
- 사용자 프롬프트를 로그 DTO로 전달하지 않는다.

### 6.2 전용 Shadow Logger

신규 공유 모듈 후보:

```text
supabase/functions/_shared/assistant-router-shadow-log.ts
```

책임:

- `NHRouteResult`와 `NHAssistantPlan`에서 허용된 필드만 추출
- selected Assistant ID를 최대 3개로 자름
- reason code를 허용 목록으로 정규화
- 프롬프트, 사용자 ID, 문서 데이터 입력을 타입 수준에서 받지 않음
- service-role client로 전용 테이블에 한 행 삽입
- 테이블 미적용 오류와 삽입 오류를 삼키고 기존 채팅을 계속 진행

권장 입력 타입:

```ts
interface AssistantShadowLogInput {
  requestType: NHExtendedTaskType
  plan: NHAssistantPlan
  decisionLatencyMs?: number
}
```

`prompt`, `messages`, `userId`, `department`, `finalPrompt`는 입력 타입에 포함하지 않는다.

### 6.3 `ai-chat/index.ts`

현재 Shadow Mode 콘솔 로그 위치에서 전용 logger를 호출한다.

```text
기존 모델 route 결정
→ Assistant 후보 계산
→ Shadow Mode일 때 최소 로그 DTO 생성
→ 진단 로그 저장 예약
→ 기존 preflight와 모델 응답 계속
```

변경하지 않을 항목:

- `routeRes.modelId`
- `preferredAiForModel`
- `finalPrompt`
- `mcpToolFlags`
- `mergedTools`
- RAG/Dify 입력
- 스트림 및 HTTP 응답 구조

### 6.4 Feature Flag

별도 Flag를 둔다.

```text
ASSISTANT_ROUTER_SHADOW_LOG_ENABLED=false
ASSISTANT_ROUTER_SHADOW_LOG_SAMPLE_RATE=1
```

- 로그 Flag 기본값은 OFF다.
- Router Shadow Mode가 활성화된 경우에만 기록한다.
- `SAMPLE_RATE`는 0~1 범위로 제한한다.
- 후보가 선택된 결정과 오류 fallback은 초기 검증 기간 동안 100% 기록한다.
- `no_explicit_assistant_intent` 같은 정상적인 일반 채팅은 1~5%만 기록하거나 기록하지 않는다.

### 6.5 채팅 지연 방지

권장 우선순위:

1. Supabase Edge Runtime에서 지원되는 background task API로 insert promise 등록
2. 지원 여부가 불명확하면 짧은 제한 시간으로 insert하되 오류를 삼킴
3. 로그 저장을 모델 응답 성공 조건에 포함하지 않음

로그 Promise를 단순히 `void`로 버리면 Edge Function 종료 시 기록이 유실될 수 있다. 구현 시 Runtime의 background task 지원 여부를 확인하고 사용해야 한다.

## 7. 검증 방법

### 7.1 단위 검증

- 일반 대화는 `selected_assistant_ids = []`다.
- Gmail 요청은 `gmail-assistant` 한 개만 저장한다.
- Calendar 요청은 `calendar-assistant` 한 개만 저장한다.
- Gmail+Calendar 복합 요청은 두 개만 저장한다.
- 어떤 입력에서도 Assistant ID가 3개를 초과하지 않는다.
- 사람용 `reason` 문장이 DB DTO에 들어가지 않는다.
- 프롬프트를 logger 함수에 전달할 수 없는 타입인지 확인한다.
- Registry 오류는 `registry_unavailable`로 정규화한다.
- 예외 원문은 `router_exception` 코드로만 저장한다.

### 7.2 DB 검증

실제 적용 전 로컬 또는 분리 환경에서 확인한다.

- migration SQL 정적 검사
- `candidate_count`와 배열 길이 불일치 insert 거부
- 4개 Assistant 배열 insert 거부
- 잘못된 cost level 거부
- 일반 인증 사용자 SELECT 거부
- 관리자 SELECT 허용
- service role INSERT 허용
- 원문 저장 컬럼이 존재하지 않는지 확인

### 7.3 통합 검증

- 로그 Flag OFF: insert가 발생하지 않는다.
- Router OFF: insert가 발생하지 않는다.
- Shadow Mode OFF: Shadow 로그가 발생하지 않는다.
- Shadow Mode ON: 후보 로그만 저장되고 Assistant Function은 호출되지 않는다.
- Shadow 로그 테이블이 없어도 채팅 응답은 정상이다.
- DB insert 실패가 HTTP 상태와 스트림 응답에 영향을 주지 않는다.
- 기존 모델 ID, RAG 결과 및 도구 목록이 변경되지 않는다.

### 7.4 관측 지표

관리자는 다음 집계만 확인한다.

- request type별 Assistant 선택률
- Assistant별 선택 횟수
- `model_only` 비율
- fallback 이유별 비율
- simple/standard/compound 분포
- 비용 등급 분포
- 평균 및 상위 95% decision latency
- 2개 이상 후보 비율과 최대 3개 제한 위반 여부

예시 집계:

```sql
select
  request_type,
  selection_mode,
  count(*) as decisions,
  avg(decision_latency_ms) as avg_latency_ms
from public.assistant_router_shadow_logs
where created_at >= now() - interval '7 days'
group by request_type, selection_mode
order by decisions desc;
```

## 8. 위험 요소와 롤백 방법

| 위험 요소 | 영향 | 예방책 | 롤백 방법 |
|---|---|---|---|
| 프롬프트 원문 저장 | 개인정보·회사정보 유출 | logger 입력 타입에서 prompt 제거, DB 컬럼 미생성 | 로그 Flag OFF 후 민감 행 삭제 |
| 일반 사용자 로그 접근 | 내부 정책 노출 | 관리자 SELECT RLS만 허용 | authenticated grant 회수 |
| 모든 채팅 100% 기록 | DB 비용 증가 | 후보/오류 중심 기록, 일반 대화 샘플링 | sample rate 0 또는 Flag OFF |
| 로그 insert 지연 | 채팅 응답 지연 | background task 또는 짧은 제한 시간 | DB 기록 중지, 콘솔 최소 로그만 유지 |
| 로그 실패로 채팅 실패 | 서비스 장애 | logger 내부에서 오류 처리 | logger 호출 제거 또는 Flag OFF |
| 실행 로그와 혼동 | 지표 왜곡 | 전용 테이블과 `shadow` 명칭 사용 | 기존 실행 로그 쿼리에서 분리 |
| 사유 문구 변경 | 집계 단절 | 안정적인 reason code 저장 | router version별 집계 |
| 3개 제한 누락 | 향후 fan-out 위험 신호 누락 | 코드 slice와 DB cardinality check 이중 적용 | 최대 후보를 1개로 축소 |
| 보존기간 미적용 | 저장 비용 누적 | 30일 보존 정책과 크기 모니터링 | 오래된 로그 일괄 삭제 |
| 테이블 미적용 환경 | 42P01 오류 | 오류를 `registry_unavailable`과 분리해 삼킴 | Shadow DB 로그 Flag OFF |

### 8.1 롤백 순서

1. `ASSISTANT_ROUTER_SHADOW_LOG_ENABLED=false`
2. 필요하면 `ASSISTANT_ROUTER_SHADOW_LOG_SAMPLE_RATE=0`
3. `ai-chat`의 logger 호출만 비활성화
4. 신규 테이블은 즉시 삭제하지 않고 보존기간에 따라 정리
5. Assistant Router 자체는 기존 Shadow Mode로 계속 사용 가능
6. 필요하면 `ASSISTANT_ROUTER_ENABLED=false`로 기존 모델 직접 호출만 유지

로그 기능을 롤백해도 기존 흐름은 다음과 같이 유지되어야 한다.

```text
사용자 요청
→ 기존 Smart Router provider/model 선택
→ Assistant 후보 계산 또는 생략
→ 기존 preflight/RAG/Dify/Plugin/MCP
→ 기존 모델 응답
```

## 승인 후 권장 최소 구현 범위

1. `assistant_router_shadow_logs` migration 파일 작성만 수행하고 즉시 적용하지 않음
2. `NHAssistantPlan.fallbackReasonCode` 추가
3. 전용 logger 모듈 추가
4. `ai-chat` Shadow 분기에서 로그 저장만 연결
5. 로그 Feature Flag 기본 OFF
6. 후보 선택과 오류 fallback은 기록하고 일반 no-intent 요청은 낮은 비율로 샘플링
7. 사용자 화면, 응답 metadata, Assistant 실행 및 Orchestrator는 변경하지 않음
