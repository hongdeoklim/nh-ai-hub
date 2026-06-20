# NH AI Hub Assistant Architecture Audit Report

작성일: 2026-06-20
범위: Assistant Registry, Smart Router, Orchestrator, 병렬 Agent 구조
판정: **일부 구현됨**

## 요약

현재 시스템에는 20개 Assistant 이름을 사용하는 Supabase Edge Function과 연동 가이드, 모델을 선택하는 Smart Router, Gmail·Calendar 단일 실행 Workflow, 모델 병렬 실행이 가능한 Deep Research 기능이 존재한다.

그러나 중앙 Assistant Registry, Smart Router의 Assistant 선택, 여러 Assistant를 실행하고 결과를 통합하는 Orchestrator는 구현되지 않았다. 병렬 구조도 Assistant 단위가 아니라 GPT·Claude·Gemini 모델 앙상블에 한정된다. 따라서 현재 상태는 **20개 Assistant 운영 플랫폼이 완성된 상태가 아니라, 개별 실행 함수와 향후 확장을 위한 일부 기반이 마련된 상태**로 판단한다.

## 1. 구현된 기능

### 1.1 Assistant 관련 기반

- `assistant-01-gmail`부터 `assistant-20-slack`까지 20개 Supabase Edge Function이 존재한다.
- 20개 서비스에 대한 정적 연동 가이드가 존재한다.
- Gmail과 Calendar Assistant는 실제 외부 API를 호출하고 결과를 기록한다.
- 프런트엔드 서비스에서 지정한 Assistant Function 하나를 직접 호출할 수 있다.
- Assistant 실행 결과를 `ai_assistant_logs` 테이블에 저장한다.
- Gmail·Calendar 작업은 Workflow 실행기를 통해 개별 실행할 수 있다.

다만 Gmail과 Calendar를 제외한 다수 Assistant Function은 고정 문구를 반환하는 스텁 또는 Mock 수준이다.

### 1.2 Smart Router

- 사용자 요청 유형을 분류한다.
- 요청 유형과 정책을 바탕으로 AI 공급자와 모델을 선택한다.
- RAG, 외부 도구, 공공데이터 성격의 요청을 일부 판별할 수 있다.
- Plugin/MCP 도구를 운영 채팅 경로에 구성하는 기반이 있다.

현재 Smart Router의 선택 대상은 **Assistant가 아니라 모델과 공급자**다. `assistant_id` 목록이나 Assistant 선택 이유를 반환하지 않는다.

### 1.3 Workflow 실행 구조

- Workflow 활성화 상태를 확인하고 실행 이력을 저장한다.
- 현재 허용된 Gmail 또는 Calendar 작업 중 하나를 선택해 해당 Edge Function을 실행한다.
- 실행 성공·실패와 결과를 `workflow_runs`에 기록한다.

이 구조는 단일 작업 실행기이며 여러 Assistant를 조율하는 Orchestrator는 아니다.

### 1.4 병렬 실행 및 결과 취합 기반

- Deep Research 기능은 GPT·Claude·Gemini 작업을 `Promise.allSettled` 방식으로 병렬 실행한다.
- 성공한 모델 결과를 수집하고 Claude 편집 단계 또는 단순 결합으로 최종 결과를 생성한다.
- 일부 모델이 실패해도 성공한 결과를 사용할 수 있는 부분 실패 처리 기반이 있다.

이는 모델 앙상블 구조이며 20개 Assistant 중 필요한 Assistant를 선택해 병렬 실행하는 Agent 구조는 아니다.

### 1.5 Marketplace 및 공공데이터 기반

- 확장 타입으로 Plugin, MCP, Skill, Public Data를 표현할 수 있다.
- 확장 기능의 설치, 활성화, 사용자·부서 권한, 실행 로그를 위한 DB 구조가 있다.
- 공공데이터 Plugin 초기 데이터와 공공데이터 요청 유형 판별 기반이 있다.
- Plugin 관리자 화면과 사용자 연결 설정 화면이 존재한다.

Marketplace와 Assistant 사이의 직접적인 관계는 아직 없다.

## 2. 누락된 기능

### 2.1 중앙 Assistant Registry

요구되는 중앙 Registry 테이블 또는 동일한 역할의 서비스가 없다.

| Registry 개념 | 구현 상태 | 현재 상태 |
|---|---|---|
| `assistant_id` | 미구현 | 중앙 식별자 없음 |
| `name` | 일부 구현 | 가이드 제목과 로그 문자열로 분산 |
| `description` | 일부 구현 | 정적 가이드 `summary`에만 존재 |
| `category` | 미구현 | Assistant별 표준 분류 없음 |
| `tools` | 일부 구현 | MCP Mock은 있으나 Assistant별 매핑 없음 |
| `mcp_servers` | 미구현 | Assistant-MCP Server 관계 없음 |
| `plugin_ids` | 미구현 | Assistant-Plugin 관계 없음 |
| `default_model` | 미구현 | Assistant별 기본 모델 없음 |
| `fallback_model` | 미구현 | Assistant별 대체 모델 없음 |
| `cost_level` | 미구현 | Assistant별 비용 등급 없음 |
| `permission_scopes` | 미구현 | Assistant 단위 권한 없음 |
| `enabled` | 미구현 | Assistant 활성화 상태 없음 |

`src/services/assistants.ts`는 Function 호출과 로그 조회만 담당하므로 Registry로 볼 수 없다.

### 2.2 Smart Router의 Assistant 선택

- 사용자 요청에 맞는 Assistant를 선택하지 않는다.
- 선택 가능한 Assistant의 활성화 상태, 권한, 비용, 도구 가용성을 평가하지 않는다.
- 기본 1개, 복합 요청 최대 3개와 같은 선택 제한이 없다.
- Assistant 선택 이유나 예상 비용을 반환하지 않는다.
- Assistant 실패 시 다른 Assistant 또는 모델로 전환하는 정책이 없다.

현재 20개 Assistant를 항상 호출하는 코드는 발견되지 않았다. 하지만 필요한 Assistant만 1~3개 자동 선택하는 코드도 없다. 운영 채팅에서는 20개 Assistant MCP Mock이 명시적으로 비활성화되어 있다.

### 2.3 Assistant Orchestrator

- 여러 Assistant 실행 계획을 생성하는 계층이 없다.
- Assistant 간 의존 순서 또는 DAG를 표현하지 못한다.
- 병렬 실행 수, 타임아웃, 재시도, 취소 정책이 없다.
- 여러 Assistant 결과의 중복 제거, 충돌 해결, 출처 보존 기능이 없다.
- 요청 전체를 추적하는 correlation ID가 없다.
- 부분 성공과 부분 실패를 사용자 응답에 일관되게 반영하는 규칙이 없다.

`workflow-execute`는 하나의 허용된 Function을 실행하므로 Orchestrator가 아니다. Deep Research의 결과 편집 로직은 향후 Orchestrator 구현에 참고할 수 있지만 Assistant Registry와 연결되어 있지 않다.

### 2.4 Assistant 병렬 Agent 구조

- Assistant 목록을 받아 병렬 실행하는 공통 실행기가 없다.
- Assistant별 동시 실행 제한과 전체 fan-out 상한이 없다.
- 사용자·부서 정책에 따른 병렬 실행 제한이 없다.
- Assistant마다 다른 모델·Plugin·MCP를 로딩하는 실행 컨텍스트가 없다.
- 실행 결과를 Assistant별 모델 비용과 연결하는 구조가 없다.

### 2.5 관리와 권한

- 관리자 화면에서 Assistant를 활성화·비활성화할 수 없다.
- 사용자·부서별 Assistant 사용 권한을 설정할 수 없다.
- Marketplace 설치 상태가 Assistant 가용성으로 연결되지 않는다.
- Public Data Plugin은 존재하지만 전용 Public Data Assistant는 없다.

### 2.6 실행 및 비용 관측성

- `ai_assistant_logs`에 모델, 공급자, 입력·출력 토큰, 비용, 지연 시간 정보가 없다.
- Assistant 실행과 Plugin 도구 실행 로그를 하나의 요청 단위로 연결하지 못한다.
- Assistant 실패 경로가 항상 오류 로그로 남는 구조가 아니다.
- HTTP 오류 대신 HTTP 200과 `success: false`를 반환하는 Function이 있어 운영 지표가 불명확해질 수 있다.

## 3. 관련 파일

### Assistant 정의 및 실행

- `src/services/assistants.ts`
  단일 Assistant Function 호출과 `ai_assistant_logs` 조회를 제공한다. Registry나 선택 정책은 없다.

- `src/data/assistant-integration-guides.ts`
  20개 서비스 연동 가이드다. 정적 UI 카탈로그이며 런타임 Registry는 아니다.

- `supabase/functions/assistant-01-gmail/index.ts`
  Gmail API 조회와 Assistant 로그 저장을 수행한다.

- `supabase/functions/assistant-02-calendar/index.ts`
  Calendar API 조회와 Assistant 로그 저장을 수행한다.

- `supabase/functions/assistant-03-notion/index.ts` ~ `supabase/functions/assistant-20-slack/index.ts`
  개별 Assistant 이름을 가진 Function이다. 다수는 고정 응답 중심의 초기 구현 상태다.

- `supabase/functions/_shared/assistant-mcp-mocks.ts`
  20개 Assistant 분야의 MCP 도구 Mock과 실행기를 정의한다. 운영 Assistant Registry는 아니다.

### Smart Router 및 채팅

- `supabase/functions/_shared/nh-smart-routing.ts`
  요청 유형을 분류하고 모델·공급자를 선택한다. Assistant 선택은 하지 않는다.

- `supabase/functions/ai-chat/index.ts`
  Smart Router 결과를 실제 모델 호출에 적용하고 Plugin/MCP 도구를 구성한다. 운영 경로에서 Assistant MCP Mock은 비활성화되어 있다.

- `supabase/functions/_shared/dynamic-plugin-tools.ts`
  설치·승인·권한을 통과한 Plugin 도구를 동적으로 로딩하고 실행 로그를 기록한다. Assistant와의 매핑은 없다.

### Workflow 및 병렬 처리

- `supabase/functions/workflow-execute/index.ts`
  Gmail 또는 Calendar Function 하나를 실행하고 Workflow 실행 결과를 기록한다.

- `supabase/functions/deep-research/index.ts`
  복수 모델을 병렬 실행하고 결과를 취합한다. Assistant 병렬 실행 구조는 아니다.

- `src/pages/WorkflowsPage.tsx`
  Workflow 활성화와 실행 UI를 제공한다. Assistant 관리 화면은 아니다.

- `src/components/settings/ScheduledTasksPanel.tsx`
  예약 작업 활성화 상태를 관리한다. Assistant 활성화 상태와는 별개다.

### DB 및 관리자 UI

- `supabase/migrations/20260617000000_create_ai_assistant_logs.sql`
  Assistant 실행 결과 테이블을 생성한다.

- `supabase/migrations/20260618000000_ai_assistants_cron.sql`
  주기적 알림 실행 기반을 구성한다. 20개 Assistant를 조율하는 Cron Orchestrator는 아니다.

- `supabase/migrations/20260621000000_workflow_execution_engine.sql`
  Gmail·Calendar Workflow 실행과 이력 저장 구조를 정의한다.

- `supabase/migrations/20260624000000_smart_router_extension_marketplace.sql`
  Plugin/MCP/Skill/Public Data 설치·권한·정책·실행 로그 구조를 정의한다.

- `src/pages/admin/PluginManager.tsx`
  Plugin 활성화와 관리 기능을 제공한다. Assistant 활성화 기능은 없다.

- `src/components/settings/PluginConnectionsPanel.tsx`
  사용자별 Plugin 인증 정보와 연결 상태를 관리한다.

## 4. 비용 위험요소

### 4.1 향후 무제한 fan-out 위험

현재 20개 Assistant를 모두 호출하지는 않지만, Registry 없이 단순 반복 호출 방식으로 Orchestrator를 추가하면 요청 한 건이 최대 20개의 모델 또는 외부 API 호출로 확대될 수 있다. 기본 선택 수는 1개, 복합 요청도 최대 3개로 제한해야 한다.

### 4.2 Deep Research 다중 호출

Deep Research는 최대 3개 모델을 병렬 호출하고 편집 모델을 추가 호출할 수 있다. 요청 한 건당 최대 4회의 LLM 호출이 발생할 수 있으므로 사용자·부서 예산과 고비용 요청 승인 정책이 필요하다.

### 4.3 주기 실행 비용

주기 알림 기능은 사용자별로 모델을 호출하므로 사용자 수에 비례해 비용과 실행 시간이 증가한다. 배치 크기, 동시 실행 제한, 중복 실행 방지 및 일일 예산이 필요하다.

### 4.4 Assistant별 비용 추적 불가

현재 Assistant 로그에는 모델과 토큰 비용이 없다. 특정 Assistant, Plugin, MCP 또는 외부 API가 발생시킨 총비용을 정확히 계산하기 어렵다.

### 4.5 재시도 및 장애 비용

공통 타임아웃, 최대 재시도 횟수, 회로 차단기, idempotency key가 없다. 외부 API 장애나 느린 응답이 발생하면 중복 호출과 비용 증가 가능성이 있다.

### 4.6 로그 접근 정책 위험

`ai_assistant_logs`의 인증 사용자 조회 정책이 `USING (true)`로 정의되어 있어 사용자 간 로그가 노출될 가능성이 있다. 비용 문제와 별개로 운영 전 반드시 사용자·부서·관리자 범위로 제한해야 한다.

## 5. 다음 구현 단계

기존 RAG, Vector Search, Dify, Supabase, GCS 및 모델 라우팅을 유지하면서 다음 순서로 확장하는 것이 최소 변경 경로다.

### 단계 1: Assistant Registry 추가

- `assistant_registry` 테이블을 추가한다.
- 필수 메타데이터를 중앙 관리한다.
  - `assistant_id`
  - `name`
  - `description`
  - `category`
  - `tools`
  - `mcp_servers`
  - `plugin_ids`
  - `default_model`
  - `fallback_model`
  - `cost_level`
  - `permission_scopes`
  - `enabled`
- 기존 20개 Function 이름을 Registry 실행 대상에 매핑한다.
- 기존 정적 가이드는 삭제하지 않고 Registry 표시 정보와 연결한다.

### 단계 2: 권한 및 확장 기능 연결

- Assistant-Plugin, Assistant-MCP, Assistant-Skill 관계 테이블을 추가한다.
- 사용자·부서별 Assistant 권한 테이블을 추가한다.
- 필요한 Plugin이 설치·승인·활성화되지 않은 경우 Assistant를 선택 대상에서 제외한다.
- 관리자 화면에서 Assistant 활성화와 권한을 관리한다.

### 단계 3: Smart Router Assistant 선택 확장

- 기존 모델 선택 결과에 `selected_assistants`를 추가한다.
- 요청 유형, 도구 가용성, 권한, 비용 등급, 사용 한도를 평가한다.
- 일반 요청은 Assistant 1개를 선택한다.
- 복합 요청만 최대 3개까지 선택한다.
- 선택 이유와 예상 비용을 함께 반환한다.
- Assistant가 필요하지 않은 요청은 기존 모델 직접 호출 경로를 유지한다.

### 단계 4: 최소 Orchestrator 구현

- 선택된 Assistant의 실행 계획을 생성한다.
- 독립 작업은 제한된 동시성으로 병렬 실행한다.
- 의존 작업은 순차 실행한다.
- `Promise.allSettled` 방식으로 부분 실패를 허용한다.
- 결과에 Assistant ID, 출처, 도구 실행 내역, 실패 상태를 보존한다.
- 최종 합성은 기존 Smart Router가 선택한 모델을 사용한다.

### 단계 5: 로그와 비용 통합

- 모든 실행에 correlation ID를 부여한다.
- Assistant 실행 로그에 공급자, 모델, 토큰, 비용, 지연 시간, 상태를 추가한다.
- Plugin/MCP 실행 로그와 Assistant 실행 로그를 연결한다.
- 사용자·부서·Assistant별 일/월 사용 한도를 적용한다.
- 고비용 모델 또는 다중 Assistant 실행 전에 정책 확인 또는 사용자 경고를 적용한다.

### 단계 6: 실제 Assistant 전환

- Gmail·Calendar를 기준 구현으로 유지한다.
- 나머지 스텁 Assistant를 우선순위에 따라 실제 Plugin/MCP/API 실행으로 교체한다.
- Public Data Plugin을 전용 Public Data Assistant와 연결한다.
- Assistant별 계약 테스트와 실패 시 fallback 테스트를 추가한다.

## 최종 판단

| 영역 | 구현 수준 | 판단 |
|---|---:|---|
| 20개 Assistant 파일·가이드 | 높음 | 골격 구현 |
| 실제 동작하는 20개 Assistant | 낮음 | 대부분 스텁 |
| Assistant Registry | 없음 | 미구현 |
| 모델 Smart Router | 중간 이상 | 구현됨 |
| Assistant Smart Router | 없음 | 미구현 |
| 단일 Workflow 실행 | 일부 | Gmail·Calendar만 구현 |
| Assistant Orchestrator | 없음 | 미구현 |
| 모델 병렬 실행 | 있음 | Deep Research에 구현 |
| Assistant 병렬 실행 | 없음 | 미구현 |
| Marketplace 기반 | 중간 | Assistant 연결 필요 |
| Assistant 권한·비용 관리 | 낮음 | 별도 구현 필요 |

현재 구조를 유지하면서 Registry → 권한/확장 연결 → Assistant 선택 → 제한된 병렬 Orchestrator 순서로 추가하는 것이 가장 작은 변경 범위다.
