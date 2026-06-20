# Assistant System Staging 적용 및 검증 체크리스트

작성일: 2026-06-20
대상: Assistant Registry, Assistant Router Shadow Mode, Shadow Log
문서 상태: 실행 절차서 — 현재 세션에서는 적용·배포하지 않음

## 기본 원칙

- 모든 작업은 운영이 아닌 Staging Supabase 프로젝트에서 먼저 수행한다.
- 적용 전에 실제 Supabase project ref와 현재 연결 대상을 두 사람이 확인한다.
- Assistant Router와 Shadow Log Feature Flag는 최초 배포 시 모두 OFF로 유지한다.
- Assistant Function은 호출하지 않는다.
- Orchestrator는 존재하지 않으며 추가하지 않는다.
- Migration, Function 배포, Feature Flag 변경은 각각 별도 승인 지점으로 나눈다.
- SQL Editor의 `postgres` 세션 결과만으로 RLS를 통과했다고 판단하지 않는다. authenticated/service role을 명시적으로 모의하거나 실제 JWT로 확인한다.

## 1. 적용 순서

### 전체 순서

```text
1. Staging 프로젝트 식별 및 백업
2. 선행 관리자 함수와 migration 상태 확인
3. 모든 Assistant 관련 Feature Flag OFF 확인
4. 20260625000000 Assistant Registry migration 적용
5. Registry 스키마·Seed·RLS 검증
6. 20260626000000 Shadow Log migration 적용
7. Shadow Log 스키마·제약·RLS 검증
8. ai-chat Edge Function을 Staging에 배포
9. Flag OFF 상태 회귀 및 성능 기준선 측정
10. Router ON + Shadow ON + Log OFF 검증
11. Router ON + Shadow ON + Log ON 검증
12. 로그 보안·정확성·비용·성능 검증
13. 운영 반영 승인 회의
```

### Migration 선행 순서

필수 순서:

```text
20260518280000_admin_plugins_health.sql
  → public.users.is_admin
  → public.current_user_is_admin()

20260625000000_assistant_registry.sql
  → assistant_registry

20260626000000_assistant_router_shadow_logs.sql
  → assistant_router_shadow_logs
```

전체 migration을 `supabase db push`로 적용하면 timestamp 순서에 따라 적용되어야 한다. 특정 SQL 파일을 SQL Editor에서 단독 실행하는 방식은 선행 의존성 누락 가능성이 있으므로 권장하지 않는다.

### 승인 지점

- 승인 A: Staging DB 대상과 백업 확인
- 승인 B: 두 migration 적용
- 승인 C: DB 검증 완료 후 `ai-chat` Staging 배포
- 승인 D: Router Shadow Mode 활성화
- 승인 E: Shadow Log 활성화
- 승인 F: 운영 반영

한 승인으로 다음 단계를 자동 진행하지 않는다.

## 2. 사전 점검

### 2.1 프로젝트 대상 확인

- [ ] Staging Supabase project ref 기록
- [ ] 운영 project ref와 다른지 확인
- [ ] CLI가 Staging에 link되어 있는지 확인
- [ ] 현재 로그인 계정과 조직 확인
- [ ] Staging DB 백업 또는 복구 지점 생성
- [ ] Staging `ai-chat` 현재 배포 버전 기록
- [ ] 현재 Feature Flag 값 기록
- [ ] 적용 담당자와 검증 담당자 분리

권장 확인 명령은 실행 전 project ref를 명시적으로 검토한다.

```powershell
npx.cmd supabase migration list
npx.cmd supabase functions list
npx.cmd supabase secrets list
```

명령 결과에 secret 값이 출력되거나 문서에 복사되지 않도록 한다.

### 2.2 선행 함수 확인 SQL

```sql
select
  to_regclass('public.users') as users_table,
  to_regprocedure('public.current_user_is_admin()') as admin_function;
```

예상 결과:

- `users_table = public.users`
- `admin_function = current_user_is_admin()`

함수 정의 속성 확인:

```sql
select
  n.nspname as schema_name,
  p.proname as function_name,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  p.proconfig as function_config,
  pg_get_userbyid(p.proowner) as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'current_user_is_admin';
```

확인 기준:

- [ ] 함수가 정확히 1개 존재
- [ ] `security_definer = true`
- [ ] volatility가 stable
- [ ] `function_config`에 `search_path=public` 존재
- [ ] 함수 소유자가 승인된 DB 관리자 역할

`public.users` 관리자 컬럼 확인:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'users'
  and column_name in ('id', 'role', 'is_admin')
order by column_name;
```

### 2.3 Migration 적용 상태 확인

적용 전 예상:

```sql
select
  to_regclass('public.assistant_registry') as assistant_registry,
  to_regclass('public.assistant_router_shadow_logs') as shadow_logs;
```

신규 적용 환경이라면 두 값이 null이어야 한다. 이미 존재한다면 적용을 중단하고 다음을 먼저 확인한다.

- 누가 언제 생성했는지
- migration history와 실제 schema가 일치하는지
- Seed가 수동 변경됐는지
- 기존 Shadow 로그가 있는지

### 2.4 로컬 산출물 확인

- [ ] `20260625000000_assistant_registry.sql` 존재
- [ ] `20260626000000_assistant_router_shadow_logs.sql` 존재
- [ ] migration timestamp 중복 없음
- [ ] Router Deno 검사 통과
- [ ] Logger Deno 검사 통과
- [ ] `npm run build` 성공
- [ ] `git diff --check` 통과
- [ ] `waitUntil()` 예외 비전파 검증 통과
- [ ] 금지 로그 필드 부재 확인

### 2.5 초기 Feature Flag 확인

최초 DB 적용과 코드 배포 시 다음 값이어야 한다.

```text
ASSISTANT_ROUTER_ENABLED=false
ASSISTANT_ROUTER_SHADOW_MODE=true
ASSISTANT_ROUTER_SHADOW_LOG_ENABLED=false
ASSISTANT_ROUTER_SHADOW_LOG_SAMPLE_RATE=1
```

Flag가 없을 때 코드 기본값도 동일하다.

## 3. Migration 적용 절차

이 절차는 향후 승인된 Staging 작업 창에서 수행한다. 현재 문서 작성 단계에서는 실행하지 않는다.

### 3.1 작업 전

1. 변경 작업 시간과 담당자를 기록한다.
2. Staging project ref를 소리 내어 교차 확인한다.
3. DB 백업 또는 PITR 사용 가능 여부를 확인한다.
4. Feature Flag가 초기 안전값인지 확인한다.
5. 현재 migration 목록을 저장한다.
6. 현재 `ai-chat` smoke test 결과와 응답 시간을 기록한다.

### 3.2 Migration 적용

승인된 Staging 프로젝트에 link된 상태에서 migration을 적용한다.

```powershell
npx.cmd supabase migration list
npx.cmd supabase db push
npx.cmd supabase migration list
```

검증 사항:

- [ ] 실제 적용 대상이 Staging
- [ ] `20260625000000` 성공
- [ ] `20260626000000` 성공
- [ ] 예상하지 않은 다른 migration이 함께 적용되지 않음
- [ ] migration history에 두 버전이 기록됨
- [ ] 오류 발생 시 다음 migration 또는 배포로 진행하지 않음

다른 미적용 migration이 함께 표시되면 `db push`를 실행하기 전에 영향 범위를 별도로 검토한다.

### 3.3 Migration 직후

1. 아래 SQL 검증 쿼리를 실행한다.
2. Seed 20개를 대조한다.
3. RLS 정책과 grant를 확인한다.
4. 역할별 테스트를 완료한다.
5. 실패 시 Function을 배포하지 않는다.

### 3.4 Function 배포

DB 검증 완료 후 별도 승인으로 Staging `ai-chat`만 배포한다. 공유 모듈은 `ai-chat` bundle에 포함된다.

배포 전 확인:

- [ ] `assistant-01`~`assistant-20` Function을 재배포할 필요 없음
- [ ] Workflow Function 변경 없음
- [ ] Plugin/MCP Function 변경 없음
- [ ] Router와 logger 공유 모듈이 bundle에 포함됨
- [ ] Flag는 OFF 상태

배포 후 Flag를 변경하지 않은 상태에서 기존 채팅 smoke test를 먼저 수행한다.

## 4. SQL 검증 쿼리

### 4.1 Registry 스키마 확인

```sql
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'assistant_registry'
order by ordinal_position;
```

필수 컬럼:

```text
id, assistant_id, name, description, category, function_name,
status, enabled, default_model, fallback_model, cost_level,
permission_scopes, task_types, max_execution_ms, sort_order,
metadata, created_at, updated_at
```

### 4.2 Registry 총계와 상태

```sql
select
  count(*) as total,
  count(*) filter (where enabled) as enabled_count,
  count(*) filter (where status = 'partial') as partial_count,
  count(*) filter (where status = 'mock') as mock_count,
  count(*) filter (where status = 'ready') as ready_count,
  count(*) filter (where status = 'deprecated') as deprecated_count
from public.assistant_registry;
```

초기 예상:

- `total = 20`
- `enabled_count = 2`
- `partial_count = 2`
- `mock_count = 18`
- `ready_count = 0`
- `deprecated_count = 0`

### 4.3 Enabled 상태 검증

```sql
select assistant_id, function_name, status, enabled
from public.assistant_registry
where enabled
order by sort_order;
```

예상 행:

```text
gmail-assistant    assistant-01-gmail       partial  true
calendar-assistant assistant-02-calendar    partial  true
```

잘못 활성화된 행 확인:

```sql
select assistant_id, function_name, status, enabled
from public.assistant_registry
where assistant_id not in ('gmail-assistant', 'calendar-assistant')
  and enabled = true;
```

예상 결과: 0행

Gmail/Calendar 상태 오류 확인:

```sql
select assistant_id, function_name, status, enabled
from public.assistant_registry
where assistant_id in ('gmail-assistant', 'calendar-assistant')
  and not (enabled = true and status = 'partial');
```

예상 결과: 0행

### 4.4 Registry Seed 전체 매핑 검증

```sql
with expected(assistant_id, function_name, status, enabled, sort_order) as (
  values
    ('gmail-assistant',    'assistant-01-gmail',     'partial', true,  10),
    ('calendar-assistant', 'assistant-02-calendar',  'partial', true,  20),
    ('notion-assistant',   'assistant-03-notion',    'mock',    false, 30),
    ('sheets-assistant',   'assistant-04-sheets',    'mock',    false, 40),
    ('drive-assistant',    'assistant-05-drive',     'mock',    false, 50),
    ('design-assistant',   'assistant-06-design',    'mock',    false, 60),
    ('video-assistant',    'assistant-07-video',     'mock',    false, 70),
    ('calendly-assistant', 'assistant-08-calendly',  'mock',    false, 80),
    ('research-assistant', 'assistant-09-research',  'mock',    false, 90),
    ('zapier-assistant',   'assistant-10-zapier',    'mock',    false, 100),
    ('ads-assistant',      'assistant-11-ads',       'mock',    false, 110),
    ('youtube-assistant',  'assistant-12-youtube',   'mock',    false, 120),
    ('notion-ai-assistant','assistant-13-notion-ai', 'mock',    false, 130),
    ('forms-assistant',    'assistant-14-forms',     'mock',    false, 140),
    ('content-assistant',  'assistant-15-content',   'mock',    false, 150),
    ('heygen-assistant',   'assistant-16-heygen',    'mock',    false, 160),
    ('discord-assistant',  'assistant-17-discord',   'mock',    false, 170),
    ('figma-assistant',    'assistant-18-figma',     'mock',    false, 180),
    ('clickup-assistant',  'assistant-19-clickup',   'mock',    false, 190),
    ('slack-assistant',    'assistant-20-slack',     'mock',    false, 200)
)
select
  coalesce(e.assistant_id, a.assistant_id) as assistant_id,
  e.function_name as expected_function,
  a.function_name as actual_function,
  e.status as expected_status,
  a.status as actual_status,
  e.enabled as expected_enabled,
  a.enabled as actual_enabled,
  e.sort_order as expected_sort_order,
  a.sort_order as actual_sort_order
from expected e
full join public.assistant_registry a using (assistant_id)
where a.assistant_id is null
   or e.assistant_id is null
   or a.function_name is distinct from e.function_name
   or a.status is distinct from e.status
   or a.enabled is distinct from e.enabled
   or a.sort_order is distinct from e.sort_order;
```

예상 결과: 0행

중복 확인:

```sql
select assistant_id, count(*)
from public.assistant_registry
group by assistant_id
having count(*) > 1;

select function_name, count(*)
from public.assistant_registry
group by function_name
having count(*) > 1;
```

예상 결과: 각각 0행

### 4.5 Shadow Log 스키마 확인

```sql
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'assistant_router_shadow_logs'
order by ordinal_position;
```

예상 컬럼:

```text
id, request_type, request_complexity, selection_mode,
selected_assistant_ids, selection_reason_codes, cost_level,
fallback_reason_code, candidate_count, decision_latency_ms,
router_version, created_at
```

금지 컬럼 검사:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'assistant_router_shadow_logs'
  and lower(column_name) in (
    'prompt', 'messages', 'user_id', 'userid', 'email',
    'document_id', 'documentid', 'storage_path', 'storage_url',
    'tool_input', 'tool_output', 'plugin_input', 'plugin_output',
    'input_summary', 'output_summary'
  );
```

예상 결과: 0행

### 4.6 Shadow Log 제약 확인

```sql
select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.assistant_router_shadow_logs'::regclass
order by conname;
```

확인 항목:

- [ ] request complexity 허용 목록
- [ ] selection mode 허용 목록
- [ ] selected Assistant 최대 3개
- [ ] cost level 허용 목록
- [ ] candidate count 0~3
- [ ] candidate count와 배열 길이 일치
- [ ] latency가 null 또는 0 이상

### 4.7 RLS 및 grant 확인

```sql
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('assistant_registry', 'assistant_router_shadow_logs')
order by tablename, policyname;
```

```sql
select
  grantee,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('assistant_registry', 'assistant_router_shadow_logs')
order by table_name, grantee, privilege_type;
```

확인 기준:

- Registry 일반 authenticated: SELECT만
- Registry 관리자: RLS 통과 시 CRUD
- Shadow Log authenticated: SELECT grant만 있으나 관리자 정책을 통과해야 함
- Shadow Log service role: 전체 권한
- anon: 권한 없음

## 5. RLS 검증 절차

### 주의

Supabase SQL Editor의 기본 `postgres` 역할은 RLS를 우회할 수 있다. 아래 역할 테스트는 트랜잭션 안에서 role과 JWT claim을 명시하거나 실제 사용자 JWT를 사용한다.

테스트용 관리자 UUID와 일반 사용자 UUID는 Staging 계정만 사용한다. 문서나 공유 로그에 JWT를 붙이지 않는다.

### 5.1 관리자 계정 테스트

사전 확인:

```sql
select id, role, is_admin
from public.users
where id = '<STAGING_ADMIN_USER_UUID>'::uuid;
```

RLS 모의 세션:

```sql
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"<STAGING_ADMIN_USER_UUID>","role":"authenticated"}',
  true
);

select public.current_user_is_admin() as is_admin;
select count(*) from public.assistant_registry;
select count(*) from public.assistant_router_shadow_logs;

update public.assistant_registry
set enabled = enabled
where assistant_id = 'gmail-assistant';

rollback;
```

예상:

- `is_admin = true`
- Registry 20행 조회 가능
- Shadow 로그 조회 가능
- Registry update 허용
- rollback으로 실제 값 변경 없음

### 5.2 일반 사용자 계정 테스트

조회 허용 테스트:

```sql
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"<STAGING_NORMAL_USER_UUID>","role":"authenticated"}',
  true
);

select public.current_user_is_admin() as is_admin;
select assistant_id, status, enabled
from public.assistant_registry
order by sort_order;

rollback;
```

예상:

- `is_admin = false`
- Gmail, Calendar 두 행만 조회
- 두 행 모두 enabled/partial

다음 거부 테스트는 각각 별도 트랜잭션에서 실행한다. 오류가 예상 결과다.

```sql
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"<STAGING_NORMAL_USER_UUID>","role":"authenticated"}',
  true
);
select * from public.assistant_router_shadow_logs limit 1;
rollback;
```

예상: 권한 또는 RLS로 조회 불가/0행이 아니라 명시적 접근 거부 여부를 기록한다.

```sql
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"<STAGING_NORMAL_USER_UUID>","role":"authenticated"}',
  true
);
update public.assistant_registry
set enabled = false
where assistant_id = 'gmail-assistant';
rollback;
```

예상: UPDATE 권한 거부

```sql
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"<STAGING_NORMAL_USER_UUID>","role":"authenticated"}',
  true
);
insert into public.assistant_router_shadow_logs (
  request_type,
  request_complexity,
  selection_mode,
  cost_level
) values ('GENERAL_CHAT', 'simple', 'none', 'low');
rollback;
```

예상: INSERT 권한 거부

### 5.3 Service Role 테스트

테스트는 Staging SQL 트랜잭션 또는 서버 환경에서만 수행한다. Service Role Key를 브라우저, 문서 또는 터미널 기록에 출력하지 않는다.

```sql
begin;
set local role service_role;

insert into public.assistant_router_shadow_logs (
  request_type,
  request_complexity,
  selection_mode,
  selected_assistant_ids,
  selection_reason_codes,
  cost_level,
  candidate_count,
  decision_latency_ms
) values (
  'GOOGLE_WORKSPACE',
  'standard',
  'single',
  array['gmail-assistant'],
  array['explicit_service_intent'],
  'low',
  1,
  5
);

select *
from public.assistant_router_shadow_logs
order by created_at desc
limit 1;

rollback;
```

예상:

- INSERT 가능
- SELECT 가능
- rollback 후 테스트 행 없음

제약 거부 테스트:

```sql
begin;
set local role service_role;
insert into public.assistant_router_shadow_logs (
  request_type,
  request_complexity,
  selection_mode,
  selected_assistant_ids,
  selection_reason_codes,
  cost_level,
  candidate_count
) values (
  'GOOGLE_WORKSPACE',
  'compound',
  'limited_parallel',
  array['a', 'b', 'c', 'd'],
  array['compound_request'],
  'low',
  4
);
rollback;
```

예상: cardinality 또는 candidate count 제약 위반

## 6. Feature Flag 검증

Flag 변경은 DB/배포 검증 완료 후 별도 승인으로 진행한다.

### 단계 A: 전체 OFF 기준선

```text
ASSISTANT_ROUTER_ENABLED=false
ASSISTANT_ROUTER_SHADOW_MODE=true
ASSISTANT_ROUTER_SHADOW_LOG_ENABLED=false
ASSISTANT_ROUTER_SHADOW_LOG_SAMPLE_RATE=1
```

검증:

- Registry 조회 없음
- Shadow 로그 insert 없음
- 기존 모델 선택 동일
- 기존 응답 본문/스트림 동일
- Assistant Function 호출 없음

### 단계 B: Router Shadow만 ON

```text
ASSISTANT_ROUTER_ENABLED=true
ASSISTANT_ROUTER_SHADOW_MODE=true
ASSISTANT_ROUTER_SHADOW_LOG_ENABLED=false
ASSISTANT_ROUTER_SHADOW_LOG_SAMPLE_RATE=1
```

검증:

- 일반 대화 후보 0개
- Gmail 요청 후보 1개
- Calendar 요청 후보 1개
- Gmail+Calendar 요청 후보 2개
- DB Shadow 로그 증가 없음
- 응답 metadata 변화 없음
- Assistant Function 호출 없음

### 단계 C: Shadow Log ON

```text
ASSISTANT_ROUTER_ENABLED=true
ASSISTANT_ROUTER_SHADOW_MODE=true
ASSISTANT_ROUTER_SHADOW_LOG_ENABLED=true
ASSISTANT_ROUTER_SHADOW_LOG_SAMPLE_RATE=1
```

검증:

- 후보 및 fallback 결정 로그 생성
- 로그 insert 실패를 강제해도 채팅 성공
- `waitUntil()` 예외를 모의해도 채팅 성공
- 금지 필드 미저장
- 응답 metadata 변화 없음

### 단계 D: 샘플링

일반 no-intent 로그 비용 측정 후:

```text
ASSISTANT_ROUTER_SHADOW_LOG_SAMPLE_RATE=0.1
```

검증:

- 일반 no-intent 로그가 대략 10% 수준으로 감소
- Assistant 후보 결정은 계속 기록
- 오류 fallback은 계속 기록
- sample rate가 0 미만 또는 1 초과여도 코드에서 0~1로 clamp

## 7. Shadow Log 검증

### 7.1 테스트 요청

각 요청 직전 UTC 시각을 기록한다.

1. 일반 대화: `안녕하세요`
2. Gmail: `안 읽은 메일을 요약해줘`
3. Calendar: `오늘 일정을 알려줘`
4. 복합: `안 읽은 메일을 요약하고 오늘 일정을 알려줘`

Assistant는 실행하지 않으며 후보 결과만 기록해야 한다.

### 7.2 최근 로그 확인

```sql
select
  id,
  request_type,
  request_complexity,
  selection_mode,
  selected_assistant_ids,
  selection_reason_codes,
  cost_level,
  fallback_reason_code,
  candidate_count,
  decision_latency_ms,
  router_version,
  created_at
from public.assistant_router_shadow_logs
where created_at >= '<TEST_START_UTC>'::timestamptz
order by created_at;
```

예상:

| 요청 | selected_assistant_ids | candidate_count |
|---|---|---:|
| 일반 대화 | `{}` | 0 |
| Gmail | `{gmail-assistant}` | 1 |
| Calendar | `{calendar-assistant}` | 1 |
| 복합 | `{gmail-assistant,calendar-assistant}` | 2 |

### 7.3 불변식 확인

```sql
select count(*) as invalid_rows
from public.assistant_router_shadow_logs
where cardinality(selected_assistant_ids) > 3
   or candidate_count <> cardinality(selected_assistant_ids)
   or candidate_count not between 0 and 3
   or decision_latency_ms < 0;
```

예상: `invalid_rows = 0`

### 7.4 Reason code 확인

```sql
select
  unnest(selection_reason_codes) as reason_code,
  count(*)
from public.assistant_router_shadow_logs
group by reason_code
order by count(*) desc;
```

허용 코드만 존재해야 한다.

```text
task_match
explicit_service_intent
required_tool_match
public_data_match
compound_request
```

Fallback 코드 확인:

```sql
select fallback_reason_code, count(*)
from public.assistant_router_shadow_logs
where fallback_reason_code is not null
group by fallback_reason_code
order by count(*) desc;
```

허용 코드:

```text
no_explicit_assistant_intent
no_eligible_candidate
registry_unavailable
permission_unverified
required_extension_unavailable
cost_policy_blocked
router_exception
```

### 7.5 금지 데이터 확인

스키마에 금지 컬럼이 없는지 4.5 쿼리로 확인한다. 추가로 로그 값에는 원문이 들어갈 text 컬럼 자체가 없어야 한다.

- `request_type`: enum 성격의 코드
- `selected_assistant_ids`: Registry slug
- `selection_reason_codes`: 허용 코드
- `fallback_reason_code`: 허용 코드
- `router_version`: 고정 버전

사람용 reason, prompt 및 오류 message는 저장하지 않는다.

### 7.6 Assistant 미실행 확인

테스트 전후 기존 Assistant 실행 로그 건수를 비교한다.

```sql
select count(*)
from public.ai_assistant_logs
where created_at >= '<TEST_START_UTC>'::timestamptz;
```

Shadow 테스트로 인해 추가된 Assistant 실행 로그는 0건이어야 한다. Gmail/Calendar Workflow를 별도로 실행하지 않는다.

## 8. 회귀 테스트

### 채팅

- [ ] 일반 텍스트 채팅 응답 성공
- [ ] 스트리밍 시작·종료 정상
- [ ] 대화 기록 저장 정상
- [ ] 수동 provider/model 선택 정상
- [ ] 자동 모델 선택 결과 기준선과 동일
- [ ] 이미지 포함 요청 정상
- [ ] 대용량 파일 기존 경로 정상
- [ ] 오류 응답 형식 동일

### RAG/Dify/GCS

- [ ] 회사 문서 RAG 검색 정상
- [ ] Vector Search 결과 정상
- [ ] Dify 연동 정상
- [ ] GCS 이미지 업로드/조회 정상
- [ ] 문서 또는 Storage 경로가 Shadow 로그에 없음

### Plugin/MCP/Public Data

- [ ] 기존 Dynamic Plugin 도구 목록 동일
- [ ] Plugin 승인·설치·연결 필터 동일
- [ ] MCP Core 도구 목록 동일
- [ ] `allMcpMocks = false` 유지
- [ ] Public Data 기존 경로 동일
- [ ] Tool 실행 로그와 Shadow 로그가 구분됨

### Assistant/Workflow

- [ ] Assistant Function 호출 없음
- [ ] Workflow Gmail/Calendar 기존 실행 경로 영향 없음
- [ ] Disabled/Mock Assistant 선택 없음
- [ ] Orchestrator 없음
- [ ] 최대 후보 3개 제한 유지

### 보안

- [ ] 일반 사용자가 Shadow 로그 조회 불가
- [ ] 일반 사용자가 Registry 수정 불가
- [ ] Service Role Key가 브라우저에 노출되지 않음
- [ ] Shadow 로그에 사용자·문서·도구 원문 없음
- [ ] Console 로그에도 prompt 원문 추가 없음

## 9. 성능 테스트

### 9.1 측정 단계

각 단계에서 동일한 테스트 요청을 최소 30회 수행한다.

1. Flag 전체 OFF
2. Router ON, Log OFF
3. Router ON, Log ON

측정 항목:

- 요청 시작부터 첫 토큰까지 시간
- 전체 응답 완료 시간
- HTTP 오류율
- Registry 조회 지연
- `decision_latency_ms`
- Shadow 로그 insert 성공률
- Edge Function CPU/메모리
- DB connections 및 statement latency
- 하루 예상 로그 행 수와 저장 용량

### 9.2 집계 SQL

```sql
select
  count(*) as decisions,
  avg(decision_latency_ms) as avg_ms,
  percentile_cont(0.50) within group (order by decision_latency_ms) as p50_ms,
  percentile_cont(0.95) within group (order by decision_latency_ms) as p95_ms,
  max(decision_latency_ms) as max_ms
from public.assistant_router_shadow_logs
where created_at >= '<PERF_TEST_START_UTC>'::timestamptz
  and decision_latency_ms is not null;
```

로그 양:

```sql
select
  date_trunc('hour', created_at) as hour,
  count(*) as rows
from public.assistant_router_shadow_logs
where created_at >= now() - interval '24 hours'
group by hour
order by hour;
```

### 9.3 권장 승인 기준

- Flag OFF: 기존 기준선 대비 통계적으로 의미 있는 지연 증가 없음
- Router ON/Log OFF: 첫 토큰 p95 증가 150ms 이하를 목표
- Router ON/Log ON: Router ON 기준 첫 토큰 p95 추가 증가 50ms 이하를 목표
- Assistant 결정 p95 100ms 이하를 목표
- 채팅 오류율 증가 0
- Shadow 로그 실패가 채팅 실패로 이어진 사례 0
- Assistant Function 호출 0
- Background 로그 유실률이 운영 목적에 허용 가능한 수준

실제 인프라 지연에 따라 수치는 조정할 수 있지만 운영 승인 전에 기준값을 명시적으로 확정한다.

## 10. 운영 승인 기준

다음 항목을 모두 충족해야 운영 반영을 승인한다.

### DB

- [ ] Staging 두 migration 적용 성공
- [ ] Registry 20개 정확히 일치
- [ ] Gmail/Calendar만 enabled
- [ ] 나머지 18개 disabled/mock
- [ ] Shadow 제약 테스트 통과
- [ ] RLS 역할별 테스트 통과
- [ ] 관리자 함수 의존성 확인

### 코드

- [ ] Router Deno 검사 통과
- [ ] Logger Deno 검사 통과
- [ ] 빌드 성공
- [ ] `git diff --check` 통과
- [ ] `waitUntil()` 예외 비전파 확인
- [ ] 기존 `ai-chat` 오류 기준선 악화 없음

### 기능

- [ ] 일반/Gmail/Calendar/복합 후보 결과 정확
- [ ] 최대 3개 제한
- [ ] Assistant 실행 0회
- [ ] Orchestrator 없음
- [ ] 기존 응답 metadata 변경 없음
- [ ] RAG/Dify/GCS/Plugin/MCP 회귀 없음

### 보안·개인정보

- [ ] 일반 사용자 Shadow 로그 접근 불가
- [ ] 금지 필드와 금지 데이터 저장 없음
- [ ] Service Role Key 노출 없음
- [ ] Registry 일반 사용자 공개 컬럼 정책 승인
- [ ] 로그 보존 기간 승인

### 성능·운영

- [ ] p50/p95 기준 충족
- [ ] 오류율 증가 없음
- [ ] 로그 저장 비용 추정 승인
- [ ] sample rate 결정
- [ ] 모니터링 담당자 지정
- [ ] 롤백 담당자와 작업 순서 확인

하나라도 충족하지 못하면 운영 적용을 보류하고 Router/Log Flag는 OFF로 유지한다.

## 11. 롤백 절차

### 11.1 장애 수준별 즉시 조치

#### 로그 문제

```text
ASSISTANT_ROUTER_SHADOW_LOG_ENABLED=false
```

효과:

- DB insert 즉시 중단
- Router 후보 계산은 유지
- 채팅 모델 경로 유지

#### Router 지연 또는 오선택

```text
ASSISTANT_ROUTER_ENABLED=false
ASSISTANT_ROUTER_SHADOW_MODE=true
ASSISTANT_ROUTER_SHADOW_LOG_ENABLED=false
```

효과:

- Registry 조회 및 후보 계산 중단
- 기존 모델 Smart Router만 유지

#### 코드 배포 회귀

- Staging 또는 운영의 직전 검증된 `ai-chat` 버전으로 rollback
- Router와 logger shared module 연결이 없는 bundle로 복귀
- DB 테이블은 즉시 삭제하지 않음

### 11.2 DB 논리적 롤백

Registry 전체 비활성화가 필요하면 승인 후 수행한다.

```sql
update public.assistant_registry
set enabled = false;
```

이 작업은 관리자 변경이므로 실행 전 별도 승인이 필요하다.

Shadow 로그는 즉시 drop하지 않는다. Feature Flag를 끄고 보존기간에 따라 정리한다.

```sql
delete from public.assistant_router_shadow_logs
where created_at < now() - interval '30 days';
```

삭제와 drop은 백업·감사 요구사항 확인 후 별도 승인으로 수행한다.

### 11.3 롤백 검증

- [ ] 채팅 응답 정상
- [ ] 기존 모델 선택 정상
- [ ] Registry 조회 중단
- [ ] Shadow 로그 증가 중단
- [ ] RAG/Dify/GCS/Plugin/MCP 정상
- [ ] Assistant Function 호출 없음
- [ ] 오류율과 응답 시간이 기준선으로 복귀

### 11.4 권장 롤백 순서

```text
Log Flag OFF
→ Router Flag OFF
→ 채팅 smoke test
→ 필요 시 ai-chat 이전 버전 복귀
→ DB는 보존하고 원인 분석
→ 별도 승인 후 데이터 정리
```

## 최종 준비 상태

Staging 적용 절차는 문서화됐다. 실제 적용 전 다음 세 가지 승인이 필요하다.

1. Staging project ref 및 백업 승인
2. 두 migration 적용 승인
3. DB 검증 후 `ai-chat` Staging 배포 승인

현재 단계에서는 migration 적용, 배포, Feature Flag 변경 및 Git 작업을 수행하지 않는다.
