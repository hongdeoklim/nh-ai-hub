# NH AI Hub Assistant Registry 단계별 구현 계획

작성일: 2026-06-20
문서 상태: 설계안 — 구현 및 DB 적용 전
대상 범위: Assistant Registry, Assistant Router, 제한된 Orchestrator

## 설계 원칙

- 기존 RAG, Vector Search, Dify, Supabase, GCS 및 모델 Smart Router 경로를 유지한다.
- 기존 채팅의 공급자·모델 직접 선택 기능을 유지한다.
- 기존 20개 Assistant Edge Function을 삭제하거나 이름을 변경하지 않는다.
- Assistant 기능은 기존 실행 경로 위에 선택적으로 동작하는 확장 레이어로 추가한다.
- Assistant 선택 기본값은 1개이며 복합 요청도 최대 3개로 제한한다.
- Registry 또는 Orchestrator 장애 시 기존 모델 직접 호출 경로로 안전하게 복귀한다.
- Plugin, MCP, Skill, Public Data Marketplace의 설치·승인·활성화 구조를 재사용한다.

## 1. 현재 구조 요약

### 1.1 Assistant

- `assistant-01-gmail`부터 `assistant-20-slack`까지 20개 Supabase Edge Function이 존재한다.
- `src/data/assistant-integration-guides.ts`에 20개 서비스의 정적 연동 안내가 존재한다.
- Gmail과 Calendar는 외부 API를 사용하는 일부 실제 실행 경로가 있다.
- 나머지 Assistant는 대부분 스텁 또는 Mock 수준이므로 운영 준비 상태를 별도로 표시해야 한다.
- `src/services/assistants.ts`는 지정된 Function 하나를 직접 호출하지만 중앙 Registry 조회 기능은 없다.
- Assistant 실행 결과는 `ai_assistant_logs`에 저장되지만 모델, 토큰, 비용, 지연 시간 추적은 부족하다.

### 1.2 Smart Router

- `nh-smart-routing.ts`가 요청 유형을 분류하고 공급자와 모델을 선택한다.
- RAG, 도구 및 일부 공공데이터 관련 판단 기반이 존재한다.
- 현재 Router 결과에는 Assistant 후보, 선택 이유, Assistant 실행 상한이 없다.
- 기존 모델 라우팅은 Assistant 확장 후에도 최종 모델 선택과 fallback을 담당해야 한다.

### 1.3 Plugin/MCP/Skill/Public Data

- Marketplace에는 Plugin, MCP, Skill, Public Data 확장 타입과 설치·활성화·권한 기반이 있다.
- `dynamic-plugin-tools.ts`는 승인되고 활성화된 도구를 동적으로 구성한다.
- Assistant와 Marketplace 확장을 연결하는 관계 테이블은 없다.
- Assistant MCP Mock은 운영 채팅 경로에서 비활성화되어 있다.

### 1.4 Workflow 및 병렬 처리

- `workflow-execute`는 Gmail 또는 Calendar Function 하나를 실행한다.
- Deep Research는 복수 모델을 병렬 실행하고 결과를 취합하지만 Assistant 단위 Orchestrator는 아니다.
- Assistant 20개를 모두 호출하는 경로는 없다.
- 요청에 필요한 Assistant 1~3개를 선택하고 제한적으로 병렬 실행하는 공통 계층도 없다.

## 2. Assistant Registry 최소 구현안

### 2.1 Registry의 역할

Registry는 Assistant의 메타데이터와 실행 가능 여부만 중앙 관리한다. 실제 업무 로직은 기존 Edge Function에 유지한다.

Registry가 담당할 항목:

- 안정적인 `assistant_id`
- 표시 이름, 설명, 카테고리
- 기존 Edge Function 이름
- 운영 준비 상태
- 활성화 여부
- 기본 모델과 fallback 모델
- 비용 등급
- 요구 권한 scope
- 지원하는 작업 유형
- 최대 실행 시간과 예상 비용 정책

Registry가 담당하지 않을 항목:

- 기존 Assistant Function 내부 업무 로직
- RAG 또는 Dify 구현
- 공급자 API Key 원문
- Plugin 인증정보
- 모델 호출 클라이언트 구현

### 2.2 최소 Registry 레코드 예시

```json
{
  "assistant_id": "gmail-assistant",
  "name": "Gmail Assistant",
  "description": "Gmail 메일 조회 및 요약",
  "category": "productivity",
  "function_name": "assistant-01-gmail",
  "status": "partial",
  "enabled": true,
  "default_model": "gemini-2.5-flash-lite",
  "fallback_model": "gemini-2.5-flash",
  "cost_level": "low",
  "permission_scopes": ["gmail.readonly"],
  "task_types": ["email_summary", "email_search"],
  "max_execution_ms": 20000
}
```

### 2.3 운영 상태 분리

`enabled`와 구현 준비 상태를 분리한다.

- `status = mock`: 고정 응답 또는 Mock
- `status = partial`: 실제 API 일부 지원
- `status = ready`: 운영 요구사항 충족
- `status = deprecated`: 신규 선택 금지
- `enabled`: 관리자 정책상 사용 가능 여부

Router는 기본적으로 `enabled = true`이면서 `status IN ('partial', 'ready')`인 Assistant만 자동 선택한다. Mock Assistant는 관리자 테스트에서만 직접 실행할 수 있도록 한다.

## 3. 필요한 DB 테이블 초안

아래 SQL은 구조 검토용이며 실제 적용하지 않는다. 기존 UUID 생성 함수, 사용자·부서 테이블명 및 timestamp 규칙은 적용 전에 현재 프로젝트 규칙에 맞춰야 한다.

### 3.1 `assistant_registry`

```sql
create table assistant_registry (
  id uuid primary key default gen_random_uuid(),
  assistant_id text not null unique,
  name text not null,
  description text,
  category text not null,
  function_name text not null unique,
  status text not null default 'mock'
    check (status in ('mock', 'partial', 'ready', 'deprecated')),
  enabled boolean not null default false,
  default_model text,
  fallback_model text,
  cost_level text not null default 'low'
    check (cost_level in ('low', 'medium', 'high')),
  permission_scopes text[] not null default '{}',
  task_types text[] not null default '{}',
  max_execution_ms integer not null default 20000,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

설계 주의사항:

- `function_name`은 허용 목록 역할을 하므로 Router가 사용자 입력을 Function 이름으로 직접 사용하지 않게 한다.
- 모델 ID는 기존 모델 Registry의 실제 키 규칙을 확인해 FK 적용 여부를 결정한다.
- `metadata`는 초기 확장용이며 핵심 정책 값을 무분별하게 넣지 않는다.

### 3.2 `assistant_extensions`

Assistant와 기존 Marketplace 확장을 연결한다.

```sql
create table assistant_extensions (
  id uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references assistant_registry(id) on delete cascade,
  extension_id uuid not null,
  extension_type text not null
    check (extension_type in ('plugin', 'mcp', 'skill', 'public_data')),
  required boolean not null default true,
  enabled boolean not null default true,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (assistant_id, extension_id)
);
```

- `extension_id`는 기존 Marketplace의 실제 기본 테이블과 FK로 연결한다.
- 필수 확장이 설치·승인·활성화되지 않으면 해당 Assistant를 자동 선택 대상에서 제외한다.
- 사용자 인증정보는 이 테이블에 저장하지 않고 기존 Plugin Connection 구조를 사용한다.

### 3.3 `assistant_permissions`

```sql
create table assistant_permissions (
  id uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references assistant_registry(id) on delete cascade,
  subject_type text not null check (subject_type in ('user', 'department', 'role')),
  subject_id text not null,
  allowed boolean not null default true,
  max_runs_per_day integer,
  max_cost_per_day numeric(14, 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assistant_id, subject_type, subject_id)
);
```

- `subject_id` 타입과 FK는 현재 사용자·부서·역할 스키마를 확인한 뒤 확정한다.
- 거부 규칙이 허용 규칙보다 우선하도록 평가 순서를 고정한다.
- 관리자 우회 권한은 사용자 JWT의 신뢰 가능한 role/claim만 사용한다.

### 3.4 `assistant_runs`

기존 `ai_assistant_logs`를 즉시 삭제하거나 대체하지 않고 상세 실행 추적 테이블을 추가한다.

```sql
create table assistant_runs (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null,
  parent_run_id uuid references assistant_runs(id),
  user_id uuid not null,
  assistant_id uuid not null references assistant_registry(id),
  route_type text not null check (route_type in ('automatic', 'manual', 'workflow')),
  status text not null
    check (status in ('queued', 'running', 'succeeded', 'failed', 'timed_out', 'cancelled')),
  provider text,
  model_id text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  estimated_cost numeric(14, 6) not null default 0,
  actual_cost numeric(14, 6),
  duration_ms integer,
  tool_call_count integer not null default 0,
  error_code text,
  error_message text,
  input_summary text,
  output_summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
```

- 민감한 전체 프롬프트·응답은 기본 저장하지 않는다.
- 필요한 경우 기존 보안 저장소에 별도 보관하고 로그에는 참조 ID만 둔다.
- 기존 `ai_assistant_logs`는 호환성을 위해 유지하고 점진적으로 `assistant_runs`와 연결한다.

### 3.5 `assistant_route_decisions`

초기에는 필수가 아니지만 Router 품질과 비용 감사에 유용하다.

```sql
create table assistant_route_decisions (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null,
  user_id uuid not null,
  request_type text,
  complexity text,
  selected_assistant_ids uuid[] not null default '{}',
  rejected_candidates jsonb not null default '[]',
  selection_reason text,
  estimated_cost numeric(14, 6) not null default 0,
  created_at timestamptz not null default now()
);
```

원문 요청이나 비밀정보는 `selection_reason` 및 `rejected_candidates`에 기록하지 않는다.

## 4. 기존 20개 Assistant 매핑 방식

### 4.1 Seed 원칙

- 기존 Function 이름을 그대로 `function_name`에 저장한다.
- 안정적인 영문 slug를 `assistant_id`로 사용한다.
- Gmail과 Calendar만 초기 자동 선택을 허용한다.
- 나머지는 실제 구현 검증 전까지 `status = mock`, `enabled = false`로 등록한다.
- 관리자 UI에서 활성화하더라도 `mock` 상태는 운영 자동 선택 대상에서 제외한다.

### 4.2 초기 매핑 초안

| 번호 | assistant_id | 기존 Function | 초기 상태 | 초기 enabled |
|---:|---|---|---|---:|
| 01 | `gmail-assistant` | `assistant-01-gmail` | `partial` | true |
| 02 | `calendar-assistant` | `assistant-02-calendar` | `partial` | true |
| 03 | `notion-assistant` | `assistant-03-notion` | `mock` | false |
| 04 | `sheets-assistant` | `assistant-04-sheets` | `mock` | false |
| 05 | `drive-assistant` | `assistant-05-drive` | `mock` | false |
| 06 | `design-assistant` | `assistant-06-design` | `mock` | false |
| 07 | `video-assistant` | `assistant-07-video` | `mock` | false |
| 08 | `calendly-assistant` | `assistant-08-calendly` | `mock` | false |
| 09 | `research-assistant` | `assistant-09-research` | `mock` | false |
| 10 | `zapier-assistant` | `assistant-10-zapier` | `mock` | false |
| 11 | `ads-assistant` | `assistant-11-ads` | `mock` | false |
| 12 | `youtube-assistant` | `assistant-12-youtube` | `mock` | false |
| 13 | `notion-ai-assistant` | `assistant-13-notion-ai` | `mock` | false |
| 14 | `forms-assistant` | `assistant-14-forms` | `mock` | false |
| 15 | `content-assistant` | `assistant-15-content` | `mock` | false |
| 16 | `heygen-assistant` | `assistant-16-heygen` | `mock` | false |
| 17 | `discord-assistant` | `assistant-17-discord` | `mock` | false |
| 18 | `figma-assistant` | `assistant-18-figma` | `mock` | false |
| 19 | `clickup-assistant` | `assistant-19-clickup` | `mock` | false |
| 20 | `slack-assistant` | `assistant-20-slack` | `mock` | false |

실제 마이그레이션 작성 전 파일명과 배포 Function 이름을 다시 대조해야 한다. Seed는 기존 Function을 변경하지 않으며 Registry에서 참조만 한다.

## 5. Assistant Router 확장안

### 5.1 기존 Router 유지

현재 Smart Router의 모델·공급자 선택 결과를 변경하지 않고 선택 결과에 선택적 Assistant 계획을 추가한다.

```ts
type AssistantRoutePlan = {
  mode: 'model_only' | 'assistant';
  selectedAssistants: Array<{
    assistantId: string;
    reason: string;
    priority: number;
  }>;
  executionMode: 'none' | 'single' | 'parallel' | 'sequential';
  estimatedCostLevel: 'low' | 'medium' | 'high';
};
```

기존 모델 선택 필드는 유지하고 `assistantPlan`을 선택 필드로 추가한다. Assistant 확장 기능이 꺼져 있거나 오류가 발생하면 `mode = 'model_only'`로 처리한다.

### 5.2 후보 선택 순서

1. 사용자 요청 유형과 복잡도를 판별한다.
2. Registry에서 `enabled = true`이고 운영 가능한 Assistant만 조회한다.
3. Assistant `task_types`와 요청 유형을 매칭한다.
4. 사용자·부서·역할 권한을 확인한다.
5. 필수 Plugin/MCP/Skill/Public Data 설치와 연결 상태를 확인한다.
6. 일일 실행 횟수와 비용 한도를 확인한다.
7. 비용과 적합도 점수로 후보를 정렬한다.
8. 단순 요청은 1개, 복합 요청은 최대 3개를 선택한다.
9. 독립 작업인지 의존 작업인지 판단해 실행 모드를 결정한다.
10. 후보가 없으면 기존 모델 직접 호출로 돌아간다.

### 5.3 선택 수 정책

- 기본값: 1개
- 복합 요청: 최대 3개
- 4개 이상 선택: 코드와 DB 정책에서 모두 금지
- 사용자가 Assistant를 직접 지정한 경우: 권한과 활성화 상태 검증 후 1개 실행
- 고비용 Assistant 포함 시: 관리자 정책을 확인하고 필요하면 사용자 경고
- Mock, 비활성, 권한 없음, 필수 연결 누락 Assistant: 후보에서 제외

### 5.4 기존 기능과의 우선순위

- 사용자가 모델을 직접 선택하면 해당 모델 선택을 존중한다.
- Assistant 내부 모델이 필요하면 사용자가 선택한 공급자 정책과 충돌하지 않는 범위에서 사용한다.
- 회사 문서 질문은 기존 RAG/Dify를 우선 사용하며 불필요한 Assistant를 추가하지 않는다.
- 단순 질문은 기존 저비용 모델 직접 호출을 유지한다.
- Public Data 요청은 승인·활성화된 Public Data 확장이 있을 때만 관련 Assistant 후보를 만든다.

## 6. Orchestrator 최소 설계안

### 6.1 책임 범위

최소 Orchestrator는 다음 기능만 담당한다.

- Router가 선택한 최대 3개 Assistant 검증
- Registry의 허용된 Function 이름 해석
- 사용자 권한과 비용 한도 재검증
- 제한된 병렬 또는 순차 실행
- 타임아웃과 부분 실패 처리
- 실행 로그 기록
- 결과를 기존 최종 모델 응답 컨텍스트로 전달

장기 실행 큐, 복잡한 Agent 메모리, 자율 재계획, 무제한 도구 반복은 이번 범위에서 제외한다.

### 6.2 실행 흐름

```text
사용자 요청
  → 기존 전처리/RAG/Dify 판단
  → 기존 Smart Router 모델 선택
  → Assistant 후보 선택
  → 활성화·권한·연결·비용 재검증
  → 0개: 기존 모델 호출
  → 1개: 단일 Assistant 실행
  → 2~3개 독립 작업: 제한 병렬 실행
  → 2~3개 의존 작업: 우선순위 순차 실행
  → 성공 결과와 실패 상태 수집
  → 기존 선택 모델로 최종 응답 합성
  → 실행·토큰·비용 로그 저장
```

### 6.3 실행 제한

- 한 요청에서 Assistant 최대 3개
- 기본 동시 실행 수 2개
- Assistant별 `max_execution_ms` 적용
- 전체 Orchestrator 시간 제한 적용
- 동일 Assistant의 자동 재시도는 일시적 오류에 한해 최대 1회
- 사용자 요청을 변경하는 쓰기 작업은 자동 재시도 금지
- 모든 실패가 발생하면 기존 모델 직접 응답으로 fallback
- 일부 성공이면 성공 결과만 사용하고 실패 사실을 구조화해 전달

### 6.4 결과 형식

```ts
type AssistantExecutionResult = {
  assistantId: string;
  status: 'succeeded' | 'failed' | 'timed_out';
  summary?: string;
  citations?: Array<{ label: string; url?: string }>;
  toolCalls?: string[];
  durationMs: number;
  usage?: {
    modelId?: string;
    promptTokens?: number;
    completionTokens?: number;
    cost?: number;
  };
  errorCode?: string;
};
```

최종 합성 모델에는 필요한 요약과 출처만 전달하고 원시 대용량 응답은 넘기지 않는다.

## 7. 비용 절감 정책

### 7.1 선택 단계

- Assistant를 사용하지 않아도 되는 단순 질문은 기존 저비용 모델로 직접 처리한다.
- Assistant 기본 선택 수를 1개로 유지한다.
- 복합 요청 여부가 명확한 경우에만 최대 3개를 허용한다.
- 동일 기능의 후보가 여러 개면 적합도가 비슷할 때 낮은 비용 등급을 우선한다.
- 예상 비용이 사용자·부서 한도를 초과하면 실행 전에 차단하거나 승인 절차로 전환한다.

### 7.2 실행 단계

- 입력 컨텍스트를 Assistant별 필요 범위로 축소한다.
- RAG 결과 전체 대신 상위 관련 문서와 요약만 전달한다.
- 동일 요청의 중복 도구 호출을 correlation ID와 idempotency key로 방지한다.
- 제한 병렬 실행을 사용하고 동시 실행 수를 2개로 시작한다.
- 실패 재시도는 최대 1회로 제한한다.
- 읽기 요청만 안전 재시도하고 쓰기 요청은 자동 재시도하지 않는다.

### 7.3 결과 합성 단계

- Assistant 결과를 먼저 구조화·축약한 후 최종 모델에 전달한다.
- 결과가 하나면 별도 고비용 합성 모델을 호출하지 않는 경로를 허용한다.
- 복수 결과 합성도 기존 Smart Router가 선택한 모델을 사용한다.
- Deep Research처럼 고비용 다중 모델 호출이 필요한 기능은 별도 정책으로 유지한다.

### 7.4 관측과 한도

- 사용자, 부서, Assistant, 모델별 일·월 비용을 집계한다.
- 비용 등급 `high` Assistant에는 관리자 승인 또는 명시적 사용자 경고를 적용한다.
- 예상 비용과 실제 비용 차이를 기록해 Router의 비용 예측을 보정한다.
- Assistant 선택 수, 성공률, 평균 지연, 요청당 비용을 운영 지표로 관리한다.

## 8. 권한/RLS 주의사항

### 8.1 Registry

- 일반 사용자는 활성화된 Registry 메타데이터만 조회할 수 있어야 한다.
- `enabled`, 모델, 비용 등급, Function 이름 변경은 관리자만 가능해야 한다.
- 클라이언트가 전달한 `function_name`을 신뢰하지 않고 서버에서 Registry를 통해 해석한다.

### 8.2 Assistant 권한

- 권한 판정은 UI가 아니라 Edge Function 또는 DB 정책에서 수행한다.
- 사용자, 부서, 역할 규칙이 충돌하면 명시적 거부를 우선한다.
- 사용자 JWT에서 임의 수정 가능한 metadata를 관리자 권한 근거로 사용하지 않는다.
- Assistant 사용 권한과 외부 Plugin 연결 권한을 모두 통과해야 실행한다.

### 8.3 실행 로그

- 기존 `ai_assistant_logs`의 인증 사용자 전체 조회 정책은 사용자 본인 또는 허용된 부서·관리자 범위로 수정해야 한다.
- Assistant 실행 로그는 기본적으로 `user_id = auth.uid()` 조건을 적용한다.
- 관리자 조회는 별도 role claim과 감사 로그를 요구한다.
- 프롬프트, 이메일 본문, 문서 내용, API Key를 일반 로그에 저장하지 않는다.
- 오류 메시지는 인증정보와 외부 API 응답 원문을 제거한 뒤 저장한다.

### 8.4 Marketplace 인증정보

- Assistant Registry 및 관계 테이블에 API Key를 저장하지 않는다.
- 기존 Plugin Connection 암호화·비밀 관리 경로를 재사용한다.
- Service Role Key는 브라우저에 노출하지 않는다.
- Public Data API Key도 동일한 비밀 저장 정책을 적용한다.

## 9. 변경이 필요한 파일 목록

아래는 구현 승인 이후의 후보이며 현재 변경하지 않는다.

### 1단계: Registry

- `supabase/migrations/<timestamp>_assistant_registry.sql` — 신규
- `src/services/assistants.ts` — Registry 타입, 목록 및 관리 API 추가
- `src/data/assistant-integration-guides.ts` — 삭제하지 않고 Registry ID 연결만 검토

### 2단계: Router

- `supabase/functions/_shared/nh-smart-routing.ts` — Assistant 후보 계획 추가
- `supabase/functions/ai-chat/index.ts` — 선택적 Assistant 경로 연결
- `supabase/functions/_shared/assistant-mcp-mocks.ts` — 운영 실행에 직접 사용하지 않고 개발 Mock으로 유지

### 3단계: 제한 Orchestrator

- `supabase/functions/_shared/assistant-orchestrator.ts` — 신규
- `supabase/functions/workflow-execute/index.ts` — Registry 검증을 재사용하도록 최소 확장
- `supabase/functions/deep-research/index.ts` — 직접 변경보다 병렬 처리 패턴 참고
- `supabase/functions/assistant-*/index.ts` — 공통 응답·로그 규약을 단계적으로 적용

### 4단계: Marketplace 연결

- `supabase/functions/_shared/dynamic-plugin-tools.ts` — Assistant 관계 기반 도구 필터 추가
- `src/pages/admin/PluginManager.tsx` — Assistant 연결 표시 또는 별도 탭 검토
- `src/components/settings/PluginConnectionsPanel.tsx` — Assistant가 요구하는 연결 상태 표시
- `src/components/settings/ScheduledTasksPanel.tsx` — 예약 작업과 Assistant 연결 시에만 최소 확장

### 5단계: 관리 UI 및 관측성

- `src/pages/admin/AssistantManager.tsx` — 신규 관리자 화면 후보
- `supabase/migrations/<timestamp>_assistant_run_tracking.sql` — 신규
- 기존 토큰/비용 집계 서비스 — `assistant_runs` correlation ID 연결

## 10. 단계별 구현 순서

### 0단계: 구현 전 확인

- 실제 20개 Function 배포 이름을 확인한다.
- 기존 Marketplace 기본 테이블과 사용자·부서·역할 스키마를 확인한다.
- 현재 모델 Registry의 모델 ID 키를 확인한다.
- 기존 `ai_assistant_logs` 사용처와 RLS 영향을 확인한다.

### 1단계: 읽기 전용 Registry

- `assistant_registry`와 초기 20개 Seed를 작성한다.
- Gmail·Calendar만 `partial/enabled`로 설정한다.
- 나머지는 `mock/disabled`로 등록한다.
- 기존 실행 경로에는 연결하지 않는다.
- Registry 조회와 관리자 변경 권한을 검증한다.

완료 조건:

- 기존 채팅 동작이 완전히 동일하다.
- Registry 목록과 기존 Function 매핑을 조회할 수 있다.
- 일반 사용자가 Registry를 수정할 수 없다.

### 2단계: 관리자 활성화 및 권한

- Assistant 활성화·비활성화 UI를 추가한다.
- 사용자·부서·역할 권한을 추가한다.
- Marketplace 확장 관계를 추가한다.
- 아직 자동 실행에는 연결하지 않는다.

완료 조건:

- 관리자가 Assistant 상태를 변경할 수 있다.
- 권한 없는 사용자는 해당 Assistant를 조회 또는 실행 대상으로 사용할 수 없다.

### 3단계: Router 후보 추천만 적용

- Smart Router가 Assistant 후보와 선택 이유를 계산한다.
- 실제 Assistant 호출 없이 로그 또는 관리자 디버그 정보로만 검증한다.
- 선택 수 1~3개 제한과 비용 정책을 테스트한다.

완료 조건:

- 4개 이상 선택되지 않는다.
- 단순 질문은 대부분 `model_only`로 유지된다.
- Mock·비활성·권한 없는 Assistant가 선택되지 않는다.

### 4단계: Gmail·Calendar 단일 실행

- Feature Flag 아래에서 Gmail·Calendar만 Orchestrator에 연결한다.
- 기본 1개 실행, 타임아웃, 부분 실패, 기존 모델 fallback을 적용한다.
- 기존 Workflow 실행 경로는 유지한다.

완료 조건:

- Flag가 꺼지면 기존 채팅 경로와 동일하다.
- Assistant 실패 시 채팅 전체가 실패하지 않는다.
- 실행 로그와 비용이 correlation ID로 연결된다.

### 5단계: 최대 3개 제한 병렬 실행

- 검증된 `ready` Assistant만 추가한다.
- 동시 실행 수 2, 요청당 최대 3개를 적용한다.
- 복수 결과 합성과 부분 실패 처리를 검증한다.

완료 조건:

- 모든 코드 경로에서 최대 3개 제한이 지켜진다.
- 사용자·부서 비용 한도가 실행 전에 적용된다.
- 실패한 Assistant 때문에 성공 결과가 폐기되지 않는다.

### 6단계: Public Data 및 Marketplace 확장

- 승인된 Public Data Plugin을 전용 Assistant에 연결한다.
- Plugin/MCP/Skill 설치 및 활성화 상태를 Router 후보 선정에 반영한다.
- 실행 로그와 비용 로그를 통합한다.

## 11. 위험 요소와 롤백 방법

| 위험 요소 | 영향 | 예방책 | 롤백 방법 |
|---|---|---|---|
| Registry 데이터 오류 | 잘못된 Function 호출 | Function 허용 목록·unique 제약·관리자 변경 제한 | Assistant Feature Flag 비활성화 |
| 기존 Router 회귀 | 모델 선택 품질 저하 | 기존 반환 필드 유지, Assistant 계획을 선택 필드로 추가 | Assistant Router 분기 제거 또는 Flag OFF |
| 과도한 병렬 호출 | 비용·지연 증가 | 기본 1개, 최대 3개, 동시성 2 | Orchestrator 비활성화 후 모델 직접 호출 |
| Mock Assistant 운영 노출 | 잘못된 사용자 결과 | `mock` 자동 선택 금지 | 해당 Registry `enabled = false` |
| 권한 우회 | 데이터 유출 | 서버 재검증·RLS·명시적 deny 우선 | Assistant 실행 차단 및 권한 정책 원복 |
| Plugin 연결 누락 | 외부 도구 실패 | 필수 확장 사전 점검 | Assistant 후보 제외, 기존 모델 fallback |
| 로그 민감정보 저장 | 개인정보 노출 | 요약·참조 ID만 저장, 오류 정제 | 상세 로그 기록 Flag OFF 및 정책 원복 |
| 비용 집계 불일치 | 한도 초과 | 예상·실제 비용 분리 기록 | 고비용 Assistant 비활성화 |
| Assistant Function 응답 형식 불일치 | 취합 실패 | 공통 결과 어댑터 적용 | 기존 직접 Function 실행 유지 |
| DB 마이그레이션 문제 | 운영 장애 | 추가형 migration, 기존 테이블 삭제 금지 | 신규 테이블 사용 중단 후 migration별 down SQL 수행 |

### 롤백 설계 원칙

- Assistant 기능 전체를 제어하는 서버 측 Feature Flag를 둔다.
- Registry와 실행 로그는 기존 테이블을 변경하기보다 신규 테이블로 추가한다.
- 기존 `ai-chat` 모델 직접 호출 분기를 삭제하지 않는다.
- Registry 조회 또는 Orchestrator가 실패하면 기존 모델 호출로 fallback한다.
- 기존 20개 Edge Function과 Workflow action key를 유지한다.
- 각 단계는 독립 migration으로 작성하고 다음 단계 전 백업과 staging 검증을 수행한다.
- 자동 실행을 연결하기 전 추천 전용 shadow mode를 거친다.

## 승인 후 권장 1단계 범위

첫 구현 승인을 받으면 다음 항목만 진행한다.

1. `assistant_registry` 테이블 및 인덱스/RLS migration 작성
2. 기존 20개 Assistant Seed 작성
3. Gmail·Calendar는 `partial/enabled`, 나머지는 `mock/disabled`로 등록
4. `src/services/assistants.ts`에 읽기 전용 Registry 조회 타입과 함수 추가
5. 기존 채팅, Router, Workflow 및 Assistant Function은 변경하지 않음
6. migration 파일은 작성하되 별도 승인 없이 실제 Supabase DB에 적용하지 않음

이 범위는 중앙 메타데이터 기반만 추가하며 Assistant 자동 선택과 Orchestrator 실행은 포함하지 않는다.
