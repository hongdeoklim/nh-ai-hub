# NH AI Hub Assistant Router 연동 계획

작성일: 2026-06-20
문서 상태: 설계안 — 기능 코드 및 DB 적용 전
대상 범위: 기존 Smart Router와 Assistant Registry의 안전한 연결

## 기본 원칙

- 기존 Smart Router의 `provider`, `modelId`, 비용 추정 및 preflight 결과를 유지한다.
- Assistant 선택은 기존 모델 선택 결과에 추가되는 선택적 계획이다.
- Assistant가 필요하지 않거나 후보 검증이 실패하면 기존 모델 직접 호출 경로를 사용한다.
- 일반 요청은 Assistant 0~1개, 명시적인 복합 요청만 최대 3개까지 선택한다.
- 이번 단계에서는 Assistant를 실행하지 않는다. Router 출력 포맷과 후보 선택까지만 설계한다.
- Assistant Function 이름은 클라이언트 입력이나 공개 응답으로 전달하지 않는다.
- RAG, Dify, 기존 MCP/Plugin 도구 구성, 수동 모델 선택 경로를 변경하지 않는다.

## 1. 현재 1단계 구현 요약

### 1.1 Assistant Registry

`supabase/migrations/20260625000000_assistant_registry.sql`에 다음 구조가 작성되어 있다.

- `assistant_id`, 이름, 설명, 카테고리
- 기존 Edge Function과 연결되는 `function_name`
- 구현 준비 상태 `status`
- 관리자 활성화 상태 `enabled`
- `default_model`, `fallback_model`
- `cost_level`
- `permission_scopes`
- 요청 매칭용 `task_types`
- `max_execution_ms`, 정렬 순서 및 확장 metadata
- 관리자 전체 관리 및 일반 사용자 제한 조회 RLS

20개 기존 Assistant Function이 Registry Seed에 매핑되어 있다.

- Gmail, Calendar: `partial`, `enabled = true`
- 나머지 18개: `mock`, `enabled = false`

현재 migration 파일은 작성됐지만 실제 DB에는 적용하지 않은 상태다.

### 1.2 클라이언트 서비스

`src/services/assistants.ts`에 다음 내용이 추가되어 있다.

- Registry 타입 정의
- 활성화되고 사용 가능한 Assistant 목록의 읽기 전용 조회
- 관리자 조회를 위한 `includeUnavailable` 옵션

기존 단일 Assistant Function 호출 및 로그 조회 기능은 그대로 유지되어 있다.

### 1.3 현재 Smart Router 경계

`nh-smart-routing.ts`의 `NHRouteResult`는 현재 다음 주요 결과를 반환한다.

- `taskType`
- `provider`
- `modelId`
- `estimatedCostUsd`
- context caching 및 thinking budget
- 일부 외부 API preflight 요구사항

`ai-chat/index.ts`는 자동 모드일 때만 `determineRoute()`를 호출하고, 그 결과의 모델로 기존 응답 경로를 실행한다. Plugin 도구는 모델 결정 이후 `createDynamicPluginTools()`에서 별도로 구성된다.

### 1.4 현재 구조에서 해결할 간극

- Registry `task_types`는 `email_summary` 같은 세부 업무 값이고 Smart Router의 `NHExtendedTaskType`은 `GOOGLE_WORKSPACE` 같은 상위 분류이므로 명시적인 매핑 계층이 필요하다.
- Registry에는 `required_tools` 전용 컬럼과 Marketplace 관계 테이블이 아직 없다.
- Registry `permission_scopes`는 요구 권한 선언일 뿐 사용자가 실제로 권한을 가지고 있다는 증거가 아니다.
- 현재 Plugin 로더는 설치 행이 하나도 없으면 설치된 것으로 간주한다. Assistant 필수 Plugin 검증에는 이 규칙을 사용할 수 없다.
- Router의 `estimatedCostUsd`는 모델 비용이며 Assistant 비용 등급과 도구/API 비용은 포함하지 않는다.

## 2. Smart Router와 Assistant Registry 연결 방식

### 2.1 기존 모델 라우팅과 분리

기존 `determineRoute()`의 모델 선택 로직을 직접 재작성하지 않는다. 내부 흐름을 두 단계로 분리한다.

```text
1. 기존 모델 경로
   classifyTask → provider/model 선택 → 기존 NHRouteResult

2. 추가 Assistant 경로
   NHRouteResult + 사용자/부서 + Registry + capability 상태
   → Assistant 후보 필터/점수화
   → assistantPlan 추가
```

권장 API 형태:

```ts
const baseRoute = await router.determineRoute(...existingArguments)

const assistantPlan = await router.selectAssistantCandidates({
  prompt,
  route: baseRoute,
  userId,
  department,
  preferredProvider,
  capabilitySnapshot,
})

const routeResult = {
  ...baseRoute,
  assistantPlan,
}
```

이 구조는 Assistant 조회가 실패해도 `baseRoute`를 그대로 사용할 수 있고, 기존 모델 라우팅 회귀 범위를 최소화한다.

### 2.2 Assistant 선택 계층의 책임

Assistant 선택 계층은 다음만 수행한다.

- Registry에서 자동 선택 가능한 Assistant 조회
- 요청 유형과 Assistant 업무 유형 매칭
- 권한, 비용, 도구, Plugin 상태 검증
- 최대 선택 수 적용
- 선택 이유와 예상 비용 등급 생성

다음은 수행하지 않는다.

- Assistant Edge Function 호출
- Plugin 도구 실행
- 복수 결과 취합
- 최종 모델 응답 생성
- 기존 preflight 또는 RAG/Dify 실행 변경

### 2.3 자동 선택 가능 조건

다음 조건을 모두 만족해야 후보가 된다.

```text
enabled = true
AND status IN ('partial', 'ready')
AND request_type/task_types 일치
AND 사용자·부서 권한 허용
AND permission_scopes 충족
AND 필수 도구 사용 가능
AND 필수 Marketplace 확장 승인·설치·활성화
AND 필요한 인증 연결 정상
AND 사용자·부서 비용 정책 허용
```

조건을 확인할 수 없는 경우 허용으로 추정하지 않고 후보에서 제외하는 fail-closed 정책을 사용한다.

### 2.4 Feature Flag와 Shadow Mode

초기 구현에서는 서버 측 Feature Flag를 사용한다.

- `ASSISTANT_ROUTER_ENABLED=false`: Registry를 조회하지 않고 기존 경로만 사용
- `ASSISTANT_ROUTER_SHADOW_MODE=true`: 후보를 계산하고 내부 로그만 남기며 사용자 응답과 실행에는 반영하지 않음
- 검증 후 Shadow Mode를 해제해 응답 metadata에만 Assistant 계획 포함

이번 단계에서는 Orchestrator가 없으므로 Flag가 활성화되어도 Assistant Function은 호출하지 않는다.

## 3. `selected_assistants` 응답 포맷 제안

### 3.1 내부 TypeScript 포맷

기존 `NHRouteResult`의 camelCase 규칙을 유지해 `assistantPlan`을 선택 필드로 추가한다.

```ts
export type NHAssistantCostLevel = "low" | "medium" | "high"

export interface NHSelectedAssistant {
  assistantId: string
  name: string
  category: string
  reasonCode:
    | "task_match"
    | "explicit_service_intent"
    | "required_tool_match"
    | "public_data_match"
    | "compound_request"
  reason: string
  confidence: number
  costLevel: NHAssistantCostLevel
  requiredTools: string[]
  modelPolicy: {
    preferredModel: string | null
    fallbackModel: string | null
    routeModelCompatible: boolean
  }
}

export interface NHAssistantPlan {
  mode: "model_only" | "assistant_candidates"
  selectionMode: "none" | "single" | "limited_parallel" | "sequential"
  requestComplexity: "simple" | "standard" | "compound"
  selectedAssistants: NHSelectedAssistant[]
  maxAssistants: 0 | 1 | 3
  estimatedCostLevel: NHAssistantCostLevel
  reason: string
  fallback: "model_only"
}
```

`NHRouteResult`에는 호환성을 위해 선택 필드로 추가한다.

```ts
export interface NHRouteResult {
  // 기존 필드 유지
  assistantPlan?: NHAssistantPlan
}
```

### 3.2 외부 응답 metadata 포맷

클라이언트나 스트림 metadata에 공개할 필요가 있을 때만 snake_case로 변환한다.

```json
{
  "assistant_plan": {
    "mode": "assistant_candidates",
    "selection_mode": "single",
    "request_complexity": "standard",
    "selected_assistants": [
      {
        "assistant_id": "calendar-assistant",
        "name": "Calendar 비서",
        "reason_code": "explicit_service_intent",
        "reason": "Google Calendar 일정 조회 요청과 일치합니다.",
        "confidence": 0.94,
        "cost_level": "low",
        "required_tools": ["calendar.readonly"]
      }
    ],
    "estimated_cost_level": "low",
    "fallback": "model_only"
  }
}
```

공개 응답에서 제외할 값:

- `function_name`
- Plugin credential 또는 연결 내부 ID
- RLS 및 권한 판정 상세
- 제외된 Assistant 전체 목록
- 관리자 비용 한도 원문
- 내부 점수 가중치

선택 이유는 사용자에게 이해 가능한 짧은 문장만 제공하고 상세 판정은 감사 로그에 별도로 기록한다.

### 3.3 Assistant가 필요 없는 응답

```json
{
  "assistant_plan": {
    "mode": "model_only",
    "selection_mode": "none",
    "request_complexity": "simple",
    "selected_assistants": [],
    "estimated_cost_level": "low",
    "reason": "외부 도구나 전문 Assistant가 필요하지 않은 일반 대화입니다.",
    "fallback": "model_only"
  }
}
```

`selected_assistants`가 빈 배열이면 현재 모델 직접 호출 흐름을 그대로 사용한다.

## 4. Assistant 선택 알고리즘

### 4.1 1차: 요청 복잡도 판정

Assistant 수 상한을 먼저 결정한다.

| 요청 유형 | 상한 | 예시 |
|---|---:|---|
| 단순 채팅·설명·번역·일반 작성 | 0 | “이 문장을 다듬어줘” |
| 한 서비스의 명확한 작업 | 1 | “오늘 Calendar 일정 알려줘” |
| 하나의 전문 도구가 필요한 요청 | 1 | “안 읽은 Gmail을 요약해줘” |
| 서로 다른 두 개 이상의 작업이 명시된 복합 요청 | 최대 3 | “메일을 요약하고 일정을 확인해 보고서 초안을 작성해줘” |

복합 판정은 단순히 프롬프트 길이로 결정하지 않는다. 다음 중 둘 이상이 명시된 경우에만 `compound`로 본다.

- 서로 다른 서비스 또는 데이터 소스
- 서로 다른 결과물
- 독립적으로 실행 가능한 동사/업무 단계
- Public Data + 문서 작성처럼 명시적인 도구 조합

4개 이상의 업무가 있어도 선택 결과는 최대 3개로 자르고 나머지는 모델 직접 처리 또는 사용자 범위 축소 요청 대상으로 남긴다.

### 4.2 2차: 상위 request type과 세부 task 매핑

현재 Router의 상위 분류와 Registry의 세부 `task_types` 사이에 명시적인 매핑을 둔다.

```ts
const TASK_TYPE_ASSISTANT_TASKS = {
  GOOGLE_WORKSPACE: [
    "email_summary",
    "email_search",
    "calendar_lookup",
    "schedule_summary",
    "drive_search",
    "spreadsheet_read",
  ],
  COMPANY_DOCUMENT_RAG: ["company_document_qa", "rag", "document_lookup"],
  LONG_FORM_WRITING: ["report_writing", "content_writing"],
  PUBLIC_DATA_QUERY: ["public_data_search", "public_data_report"],
  DATA_CRAWLING_MATCHING: ["web_research", "public_data_search"],
}
```

상위 분류 일치만으로 선택하지 않는다. `GOOGLE_WORKSPACE` 요청에서도 Gmail, Calendar, Sheets 중 명시적으로 언급된 서비스와 동작을 다시 판별해야 한다. 이를 통해 “Google 문서 작성” 요청에 Calendar Assistant가 선택되는 문제를 방지한다.

### 4.3 3차: 후보 필터

다음 순서로 탈락 조건을 적용한다.

1. `enabled/status` 필터
2. 상위 request type 및 세부 서비스 intent 필터
3. 사용자·부서·역할 권한 필터
4. `permission_scopes` 충족 여부
5. 필수 도구 및 Marketplace 확장 상태
6. 인증 연결 상태
7. 비용 한도 및 고비용 확인 정책
8. provider/model 정책 호환성

탈락 조건을 하나라도 만족하면 점수화 전에 제거한다.

### 4.4 4차: 후보 점수화

필터를 통과한 후보에만 점수를 부여한다.

| 항목 | 권장 배점 |
|---|---:|
| 명시적 서비스명·동작 일치 | +40 |
| Registry `task_types` 일치 | +25 |
| request type 일치 | +15 |
| 필요한 도구가 이미 사용 가능 | +10 |
| 기존 Router 모델과 호환 | +5 |
| 저비용 Assistant | +5 |
| 중간 비용 | 0 |
| 고비용 | -20 |
| 모호한 키워드 일치만 존재 | -15 |

권장 임계값:

- 70점 이상: 선택 가능
- 50~69점: Shadow Mode 관찰 또는 명시적 사용자 지정 때만 허용
- 50점 미만: 선택하지 않음

동점이면 다음 순서로 결정한다.

1. 명시적 서비스 일치
2. 낮은 비용 등급
3. `ready` 우선
4. Registry `sort_order`

### 4.5 5차: 선택 수 제한

```text
simple     → 0
standard   → 최고 점수 1개
compound   → 독립된 업무별 최고 점수, 최대 3개
```

같은 기능을 수행하는 Assistant가 중복 선택되지 않도록 `category + task_type` 기준으로 중복 제거한다. 현재 단계에서는 `selectionMode`만 계산하며 실제 병렬 실행은 하지 않는다.

### 4.6 provider/model 정책 반영

- 기존 Router가 선택한 `provider/modelId`가 최종 응답 모델의 권위 있는 결과다.
- Assistant Registry의 `default_model/fallback_model`은 향후 Assistant 내부 실행을 위한 힌트로만 반환한다.
- 사용자가 모델을 수동 선택한 경우 초기 도입 단계에서는 Assistant 자동 후보 선택을 수행하지 않는 것이 안전하다.
- 자동 모드에서 route model과 Assistant 기본 모델 공급자가 다르더라도 도구형 Assistant라면 후보가 될 수 있다.
- 모델 의존형 Assistant는 호환되는 모델 또는 fallback이 없으면 후보에서 제외한다.
- Assistant 후보 때문에 기존 provider/model 선택을 자동으로 바꾸지 않는다.

## 5. 권한/비용/Plugin 상태 확인 흐름

### 5.1 Capability Snapshot

Assistant 선택 전에 실행하지 않는 읽기 전용 snapshot을 만든다.

```ts
interface AssistantCapabilitySnapshot {
  userId: string
  department: string | null
  availableScopes: Set<string>
  availableTools: Set<string>
  availableExtensionIds: Set<string>
  connectedExtensionIds: Set<string>
  budget: {
    blocked: boolean
    remainingCostUsd?: number
    requiresConfirmation: boolean
  }
}
```

이 snapshot은 도구를 실행하거나 credential을 반환하지 않는다. 인증 연결은 존재 여부와 상태만 나타낸다.

### 5.2 Assistant 권한 확인

Registry `permission_scopes`는 요구사항 선언이다. 실제 허용 여부는 다음 자료를 조합한다.

1. 사용자·부서·역할 Assistant 권한
2. Google Workspace 등 직접 연동의 실제 OAuth scope
3. Marketplace `extension_permissions.allowed_scopes`
4. Plugin Connection 상태
5. 관리자 정책의 명시적 거부

명시적 거부가 허용보다 우선한다. 실제 scope를 조회할 수 없으면 Assistant를 선택하지 않는다.

현재 1단계에는 Assistant별 사용자·부서 권한 테이블이 없으므로 2단계 구현 전에 다음 중 하나를 확정해야 한다.

- 권장: 별도 `assistant_permissions` 테이블 추가
- 임시 최소안: Registry 공개 가능 여부 + 기존 연동 scope만 확인

임시 최소안은 관리자 활성화와 사용자 연결 여부만 검증할 수 있으므로 부서별 통제가 필요한 운영 환경에는 충분하지 않다.

### 5.3 Plugin/MCP/Public Data 상태 확인

필수 확장에 대해 다음 조건을 모두 요구한다.

```text
plugins.approval_status = 'approved'
AND plugins.is_active = true
AND plugins.enabled = true
AND 현재 workspace/user/department에 명시적인 installation 행 존재
AND installation.enabled = true
AND 일치하는 permission에서 can_use != false
AND required scope 충족
AND 인증이 필요한 경우 plugin_connections.status = 'connected'
AND 실제 tool_function_name이 사용 가능한 도구 목록에 존재
```

중요: 현재 `dynamic-plugin-tools.ts`는 설치 행이 없을 경우에도 설치된 것으로 간주한다. 기존 Plugin 실행 경로의 동작을 이번 단계에서 바꾸지 않는다. 대신 Assistant 후보 판정에서는 **명시적인 활성 installation을 반드시 요구하는 별도 strict 검사**를 사용한다.

### 5.4 `required_tools`와 Marketplace 관계

Registry에 `required_tools` 전용 필드가 아직 없으므로 장기적으로 관계 테이블이 필요하다.

권장 구조:

```text
assistant_extensions
  assistant_id
  extension_id
  required
  required_tools[]
  enabled
```

초기 Shadow Mode에서만 `assistant_registry.metadata.required_tools`를 임시로 읽을 수 있지만, 운영 선택 전에 관계 테이블로 이전하는 것이 안전하다. JSON metadata만 사용하면 FK, 설치 상태 검증 및 관리자 UI 관리가 어렵다.

### 5.5 비용 확인

모델 비용과 Assistant 비용을 분리한다.

```ts
interface AssistantCostEstimate {
  modelCostUsd: number
  assistantCostLevel: "low" | "medium" | "high"
  toolCostLevel: "none" | "low" | "medium" | "high"
  combinedCostLevel: "low" | "medium" | "high"
  requiresConfirmation: boolean
}
```

정책:

- 일반 요청에서 `high` Assistant 자동 선택 금지
- 복합 요청에서 `high` 포함 시 정책 확인 또는 사용자 확인 필요
- `ai_usage_limits`의 사용자·부서 한도 초과 시 후보 제외
- 비용을 계산할 수 없는 유료 외부 도구는 최소 `medium`으로 취급
- 최대 3개 후보의 결합 비용 등급이 `high`면 제한 또는 확인 필요
- 이번 단계에서는 실행하지 않으므로 실제 비용은 발생하지 않고 예상 등급만 반환

## 6. 기존 `ai-chat` 경로에 미치는 영향

### 6.1 권장 삽입 지점

현재 자동 모델 경로는 대략 다음 순서다.

```text
determineRoute
→ preflight
→ 모델 resolve
→ Plugin/Google/MCP tools 구성
→ RAG 및 모델 응답
```

최소 변경안:

```text
determineRoute                기존 유지
→ capability snapshot        신규, 읽기 전용
→ selectAssistantCandidates  신규, 실행 없음
→ preflight                  기존 유지
→ 모델 resolve               기존 유지
→ Plugin/Google/MCP tools     기존 유지
→ RAG 및 모델 응답            기존 유지
```

후보 선택 결과는 `nhRouteResult.assistantPlan`에만 추가한다. 이번 단계에서는 `finalPrompt`, `mergedTools`, 모델 선택 및 RAG 입력을 변경하지 않는다.

### 6.2 수동 모델 선택

현재 `ai-chat`은 자동 모드에서만 `determineRoute()`를 호출한다. 초기 2단계에서도 이 동작을 유지한다.

- 자동 추천: Assistant 후보 계산 가능
- 공급자/모델 수동 선택: 기존 직접 호출 유지, Assistant 후보 계산 안 함

이후 사용자가 UI에서 Assistant를 직접 지정하는 기능이 필요하면 별도 승인과 권한 검증 경로로 추가한다.

### 6.3 RAG/Dify 및 Tool 영향

- `COMPANY_DOCUMENT_RAG`는 기존 RAG/Dify가 우선이다.
- 단순 사내 문서 질문에 Notion AI 등 Assistant를 자동 추가하지 않는다.
- Assistant 후보가 존재해도 현재 `mcpToolFlags`, `mergedTools`를 변경하지 않는다.
- `allMcpMocks: false`를 그대로 유지한다.
- Public Data Plugin이 승인·설치·활성화되지 않으면 Public Data Assistant 후보는 빈 배열이 되고 기존 모델 응답 경로를 유지한다.

### 6.4 실패 처리

| 실패 지점 | 처리 |
|---|---|
| Registry 테이블 없음 | `assistantPlan` 생략, 기존 모델 경로 계속 |
| Registry 조회 실패 | 내부 경고 로그 후 `model_only` |
| 권한 조회 실패 | 후보 전체 제외, 기존 모델 경로 계속 |
| Plugin 상태 조회 실패 | 해당 Plugin 필요 후보만 제외 |
| 비용 정책 조회 실패 | 유료/고비용 후보 제외 |
| Assistant 후보 0개 | 기존 모델 직접 호출 |

Assistant Router의 실패가 채팅 요청 전체를 500 오류로 만들면 안 된다.

## 7. 최소 수정 파일 목록

아래는 구현 승인 이후의 후보이며 현재 수정하지 않는다.

### 필수

- `supabase/functions/_shared/nh-smart-routing.ts`
  - Assistant 계획 타입 추가
  - 요청 복잡도 판정
  - Registry 후보 필터 및 점수화 함수 추가
  - 기존 `determineRoute()` 모델 로직 유지

- `supabase/functions/ai-chat/index.ts`
  - 자동 모드에서 capability snapshot 전달
  - `assistantPlan`을 내부 route result 또는 안전한 metadata에 연결
  - Assistant 실행은 추가하지 않음

- `supabase/functions/_shared/dynamic-plugin-tools.ts`
  - 실행 도구를 생성하지 않는 capability 조회 함수 추가 검토
  - 기존 `createDynamicPluginTools()` 동작은 유지
  - Assistant 판정에는 명시적 설치를 요구하는 strict 모드 사용

### DB 관계가 승인될 경우

- `supabase/migrations/<timestamp>_assistant_router_relations.sql`
  - `assistant_extensions`
  - 필요 시 `assistant_permissions`
  - Router 결정 감사 로그
  - migration은 파일 작성 후 별도 승인 전까지 실제 적용 금지

### 선택 사항

- `src/services/assistants.ts`
  - 관리자/디버그 화면에서 `assistantPlan` 타입을 공유할 필요가 있을 때만 추가
  - Router 런타임은 Edge Function 내부 타입을 권위 있는 타입으로 사용

이번 단계에서는 기존 20개 `assistant-*/index.ts`, Workflow, Deep Research, RAG/Dify 파일을 수정할 필요가 없다.

## 8. 구현 단계

### 2-0단계: 계약과 매핑 고정

1. `NHAssistantPlan` 및 `NHSelectedAssistant` 타입 확정
2. `NHExtendedTaskType`과 Registry `task_types` 매핑 작성
3. 복합 요청 판정 규칙과 최대 선택 수 테스트 케이스 작성
4. Assistant별 필수 Plugin/MCP/Scope 목록 확정

완료 조건:

- 일반 요청 결과가 0~1개다.
- 복합 요청도 3개를 초과하지 않는다.
- Assistant가 필요 없는 질문은 `model_only`다.

### 2-1단계: Registry 후보 조회

1. Edge Function의 service-role client로 Registry 조회
2. `enabled` 및 `partial/ready` 필터 적용
3. request type과 세부 service intent 매칭
4. 조회 실패 시 기존 route 반환

완료 조건:

- 현재 상태에서는 Gmail/Calendar 외 Assistant가 자동 후보가 되지 않는다.
- Registry 미적용 DB에서도 기존 채팅이 정상 작동한다.

### 2-2단계: Shadow Mode 점수화

1. 후보 점수와 탈락 이유 계산
2. Assistant는 호출하지 않고 내부 감사 정보만 기록
3. 실제 요청 표본에서 오선택률 확인
4. Gmail과 Calendar의 명시적 intent 구분 검증

완료 조건:

- “메일 요약”은 Gmail 하나만 추천한다.
- “일정 조회”는 Calendar 하나만 추천한다.
- 일반 Google 질문은 Assistant를 선택하지 않는다.

### 2-3단계: 권한 및 capability 검증

1. Plugin/MCP/Public Data strict 설치 판정 구현
2. 사용자 연결과 scope 상태 확인
3. 사용자·부서 비용 정책 확인
4. 확인 불가능한 후보를 fail-closed 처리

완료 조건:

- 승인되지 않거나 설치되지 않은 Plugin 필요 Assistant가 선택되지 않는다.
- 연결이 끊긴 외부 서비스 Assistant가 선택되지 않는다.
- 권한 조회 실패가 채팅 실패로 이어지지 않는다.

### 2-4단계: Route metadata 노출

1. Feature Flag 아래에서 `assistantPlan`을 route metadata에 추가
2. 공개 가능한 필드만 snake_case로 변환
3. 기존 스트림/응답 계약과 하위 호환성 검증
4. 여전히 Assistant 실행은 하지 않음

완료 조건:

- 기존 클라이언트가 추가 필드를 무시하고 정상 동작한다.
- Function 이름, credential, 내부 권한 정보가 노출되지 않는다.

### 2-5단계: Orchestrator 전 승인 지점

다음 단계로 넘어가기 전에 별도 승인을 받는다.

- 후보 정확도
- 권한 및 비용 정책
- 실행 로그 스키마
- Gmail/Calendar 실제 실행 경계
- 최대 3개 제한의 서버 강제 위치

## 9. 위험 요소와 롤백 방법

| 위험 요소 | 영향 | 예방책 | 롤백 방법 |
|---|---|---|---|
| 모델 Router 회귀 | 기존 자동 모델 선택 변경 | 모델 선택과 Assistant 선택 함수 분리 | Assistant Router Flag OFF |
| 일반 대화에 Assistant 오선택 | 불필요한 비용·지연 | 70점 임계값, 명시적 서비스 intent 요구 | `model_only` 강제 |
| 3개 초과 선택 | fan-out 비용 위험 | 타입이 아닌 서버 로직에서 `slice(0, 3)` 및 검증 | 최대값을 1로 축소 |
| 비활성/Mock Assistant 선택 | 잘못된 응답 | `enabled + partial/ready` 선필터 | Registry `enabled=false` |
| Plugin 설치 오판 | 권한 없는 외부 도구 노출 | Assistant strict 설치 검사 | 확장 필요 후보 전체 비활성화 |
| 기존 Plugin 동작 변경 | 현재 Tool 경로 회귀 | 기존 loader 유지, capability 함수 추가형 구현 | 신규 capability 호출 제거 |
| scope 의미 불일치 | 권한 우회 또는 과도한 차단 | 선언 scope와 실제 OAuth/Extension scope 매핑 고정 | Assistant 후보 선택 중지 |
| 비용 등급 부정확 | 한도 초과 | 고비용 fail-closed, 예상/실제 비용 분리 | `high` 후보 자동 선택 금지 |
| Registry 미적용 환경 | 테이블 조회 오류 | `42P01` 포함 조회 실패를 `model_only`로 처리 | Feature Flag OFF |
| 내부 정보 노출 | 보안 위험 | 공개 DTO allow-list | Assistant metadata 응답 제거 |
| 복합 판정 과다 | 불필요한 다중 후보 | 길이가 아닌 독립 intent 수로 판정 | 복합 선택 비활성화 |

### 롤백 우선순위

1. `ASSISTANT_ROUTER_ENABLED=false`
2. `assistantPlan` 계산과 metadata 노출 중지
3. 기존 `determineRoute()` 결과만 사용
4. 필요하면 Gmail/Calendar Registry `enabled=false`
5. 추가 관계 migration이 있더라도 기존 테이블과 경로는 삭제하지 않음

Feature Flag를 끄면 다음 기존 흐름이 그대로 남아야 한다.

```text
사용자 요청
→ 기존 Smart Router provider/model 선택
→ 기존 preflight/RAG/Dify/Plugin/MCP 처리
→ 기존 모델 직접 응답
```

## 구현 승인 시 권장 최소 범위

다음 승인에서는 실행 기능 없이 아래 범위만 구현하는 것이 안전하다.

1. `NHAssistantPlan` 타입과 task mapping 추가
2. Registry의 활성·준비 상태 후보 조회
3. 일반 0~1개, 복합 최대 3개 선택 제한
4. Gmail/Calendar 명시적 intent 점수화
5. Feature Flag 및 Shadow Mode
6. 실패 시 `model_only` fallback
7. Assistant Function 호출 및 Orchestrator는 미구현 상태 유지

Plugin/MCP/Public Data Assistant를 실제 후보로 허용하는 작업은 `assistant_extensions` 관계와 strict 설치·권한 검증이 준비된 후 별도 단계로 진행한다.
