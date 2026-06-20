# Assistant System Staging Readiness Review

검토일: 2026-06-20  
대상: PR #1 병합 후 `main` 기준 Assistant Registry, Router Shadow Mode, Shadow Log  
범위: 정적 검토만 수행. DB 적용, Function 배포, Feature Flag 변경 및 Git 변경은 수행하지 않음.

## 1. 적용 가능 여부

**판정: 조건부 보류**

cleanup 브랜치에 있는 구현 자체는 Staging 적용을 진행할 수 있는 구조다. Registry와 Shadow Log migration의 제약 및 RLS, Router의 안전 기본값, 로그 실패 격리는 의도에 부합한다.

다만 현재 로컬 Git 기준으로는 병합 후 `main`을 최종 검증할 수 없다.

- 현재 체크아웃: `cleanup/assistant-staging` (`3f1fd43`)
- 로컬 `main`: `93e3b09`
- 로컬 추적 `origin/main`: `5dc52db`
- 로컬 `origin/main`에는 다음 필수 파일이 없음:
  - `supabase/migrations/20260625000000_assistant_registry.sql`
  - `supabase/migrations/20260626000000_assistant_router_shadow_logs.sql`
  - `supabase/functions/_shared/assistant-router-shadow-log.ts`
  - `src/services/assistants.ts`
- 원격 해시를 변경 없이 확인하기 위한 `git ls-remote`는 네트워크/인증 응답 없이 종료되어 확인하지 못함.

따라서 원격 `main` 동기화 후 병합 결과와 pending migration 목록을 다시 확인하기 전에는 Staging 적용을 시작하면 안 된다.

## 2. Blocker

### B1. 병합된 `main` 소스 기준 불일치

사용자 제공 상태와 로컬 Git 참조가 일치하지 않는다. 현재 검토한 구현은 cleanup 브랜치의 파일이며, 실제 원격 `main`의 최종 파일과 동일하다는 것을 로컬에서 증명하지 못했다.

해소 조건:

- 원격 참조를 동기화한 뒤 `main`, `origin/main` 및 GitHub PR merge commit이 일치하는지 확인
- 병합된 `main`에서 두 migration, Router, Logger, `ai-chat`, `src/services/assistants.ts` 존재 확인
- 병합 과정에서 충돌 해결로 코드가 달라지지 않았는지 cleanup 브랜치와 비교

### B2. Staging DB의 pending migration 범위 미확인

DB migration이 아직 적용되지 않았으므로 `20260625000000`과 `20260626000000`만 적용되는지, 앞선 `20260617`~`20260624` migration도 함께 pending인지 확인되지 않았다. `supabase db push`는 모든 pending migration을 적용할 수 있으므로 목록 확인 없이 실행하면 범위가 확대된다.

해소 조건:

- Staging migration history와 저장소 migration 목록 비교
- 실제 적용 예정 migration을 명시적으로 승인
- 각 선행 migration의 의존성과 롤백 경로 확인

### B3. Staging의 관리자 함수 실재 여부 미확인

두 신규 migration은 `public.current_user_is_admin()`에 의존한다. 저장소에는 이를 생성하는 선행 migration이 있고 구현도 다음 안전 특성을 가진다.

- `SECURITY DEFINER`
- `SET search_path = public`
- `auth.uid()`와 `public.users.id` 비교
- `users.is_admin` 또는 `role = 'admin'` 확인
- authenticated에 execute 권한 부여

하지만 Staging DB에 함수와 `users.is_admin`/`users.role`이 실제로 존재하는지는 확인되지 않았다.

해소 조건:

```sql
select
  to_regclass('public.users') as users_table,
  to_regprocedure('public.current_user_is_admin()') as admin_function;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'users'
  and column_name in ('id', 'role', 'is_admin')
order by column_name;

select p.prosecdef, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'current_user_is_admin';
```

기대 결과: 함수 존재, `prosecdef=true`, `proconfig`에 `search_path=public` 포함.

## 3. 위험 요소

### Registry migration

- 20개 `function_name`은 로컬 cleanup 브랜치의 `assistant-01-gmail`~`assistant-20-slack` 디렉터리와 일치한다.
- Gmail과 Calendar만 `partial/enabled=true`, 나머지 18개는 `mock/enabled=false`다.
- Seed는 `ON CONFLICT (assistant_id) DO NOTHING`이므로 재실행 시 기존 잘못된 값을 교정하지 않는다. 기존 행이 있다면 적용 후 별도 비교가 필요하다.
- authenticated 사용자는 활성화된 `partial/ready` 행의 모든 컬럼을 조회할 수 있다. `function_name`, 모델 정책, scope, metadata 공개 범위를 Staging에서 검토해야 한다.
- `CREATE TABLE IF NOT EXISTS`는 동명의 불완전한 기존 테이블을 고치지 않는다. 사전 schema 충돌 검사가 필요하다.

### Shadow Log migration

- 저장 필드는 라우팅 진단 최소 정보로 제한되어 prompt, messages, user/email, document ID, Storage path, Tool/Plugin 입력·출력이 없다.
- `selected_assistant_ids` cardinality와 `candidate_count`는 최대 3개로 DB에서 제한된다.
- authenticated에는 SELECT grant가 있지만 관리자 RLS만 통과한다. SQL Editor의 `postgres` 결과만으로 RLS를 검증하면 안 된다.
- 로그 보존 기간이 DB 제약에 포함되지 않는다. 활성화 전 운영 보존 정책을 정해야 한다.

### `ai-chat` 및 Router

- 배포 대상 핵심 파일은 `supabase/functions/ai-chat/index.ts`이며 번들 의존 파일로 `_shared/nh-smart-routing.ts`와 `_shared/assistant-router-shadow-log.ts`가 포함되어야 한다.
- `ASSISTANT_ROUTER_ENABLED` 기본값은 false, `ASSISTANT_ROUTER_SHADOW_MODE` 기본값은 true, Shadow Log 기본값은 false다.
- Shadow Mode에서는 후보만 계산하고 Assistant를 실행하지 않는다.
- Registry 조회는 service-role client를 사용하므로 `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`가 필요하다.
- Router를 켜면 자동 모델 선택 요청마다 Registry 조회가 추가된다. 첫 토큰 p50/p95와 오류율 측정이 필요하다.
- Shadow Logger insert와 `EdgeRuntime.waitUntil()` 실패는 채팅 실패로 전파되지 않도록 방어되어 있다.

## 4. 적용 순서

Blocker 해소 후 다음 순서로 진행한다.

1. 원격 참조 동기화 및 병합된 `main` checkout
2. 깨끗한 작업 트리와 merge commit 확인
3. Staging project ref가 운영 project와 다른지 확인
4. Staging DB 백업 또는 복구 지점 확보
5. 전체 pending migration 목록 확인 및 적용 범위 승인
6. `users` 컬럼과 `current_user_is_admin()` 사전 SQL 검증
7. `20260625000000_assistant_registry.sql` 적용
8. Registry schema, Seed 20개, 상태 및 RLS 검증
9. `20260626000000_assistant_router_shadow_logs.sql` 적용
10. Shadow Log 제약, grant 및 RLS 검증
11. 모든 Assistant Router 관련 Flag가 OFF 안전 상태인지 확인
12. 병합된 `main`의 `ai-chat` Function 배포
13. 기존 채팅, 수동/자동 모델 선택, RAG, Dify, GCS, Plugin, MCP 회귀 테스트
14. 별도 승인 후 Router ON + Shadow ON + Log OFF 검증
15. 별도 승인 후 Shadow Log ON 검증 및 성능 측정

migration과 Function 배포는 같은 변경 창에서 하되, DB 검증이 통과하기 전에 `ai-chat`을 배포하지 않는다.

## 5. 검증 체크리스트

### Git 및 배포 소스

- [ ] `main`과 `origin/main`이 GitHub PR merge commit과 일치한다.
- [ ] 작업 트리가 깨끗하다.
- [ ] 두 신규 migration과 Router/Logger/`ai-chat` 파일이 병합된 `main`에 있다.
- [ ] cleanup 브랜치 대비 병합 충돌로 인한 의도치 않은 차이가 없다.
- [ ] 배포 대상은 Staging project ref다.

### DB 사전 점검

- [ ] 전체 pending migration 목록을 검토하고 승인했다.
- [ ] `public.users(id, role, is_admin)`가 존재한다.
- [ ] `public.current_user_is_admin()`가 존재한다.
- [ ] 관리자 함수가 SECURITY DEFINER 및 `search_path=public`로 설정됐다.
- [ ] 기존 동명 Registry/Shadow Log 테이블 또는 충돌 객체가 없다.

### Registry 적용 후

- [ ] Registry 행이 정확히 20개다.
- [ ] Function 이름이 20개 Edge Function 디렉터리와 일치한다.
- [ ] Gmail/Calendar만 `partial/enabled=true`다.
- [ ] 나머지 18개는 `mock/enabled=false`다.
- [ ] 일반 사용자는 활성 행 SELECT만 가능하고 write가 거부된다.
- [ ] 관리자는 정책 범위 내 CRUD가 가능하다.
- [ ] service role 접근이 가능하다.

### Shadow Log 적용 후

- [ ] 금지 필드가 schema에 없다.
- [ ] Assistant ID 4개 insert가 제약으로 거부된다.
- [ ] `candidate_count` 불일치 insert가 거부된다.
- [ ] 일반 사용자는 SELECT할 수 없다.
- [ ] 관리자만 SELECT 가능하다.
- [ ] service role만 insert/update/delete 가능하다.

### Function 및 회귀

- [ ] Flag OFF에서 기존 채팅 응답과 스트림이 동일하다.
- [ ] 수동 모델 선택 경로에서 Assistant Router가 개입하지 않는다.
- [ ] 자동 모델 선택, RAG, Vector Search, Dify가 정상이다.
- [ ] GCS 파일/이미지 경로가 정상이다.
- [ ] Plugin/MCP 경로가 정상이다.
- [ ] Router ON/Shadow ON에서 Assistant Function 호출이 없다.
- [ ] 일반 요청은 후보 0~1개, 복합 요청은 최대 3개다.
- [ ] Registry/로그 insert 실패가 채팅 실패로 전파되지 않는다.
- [ ] 첫 토큰 p50/p95, Registry 조회 지연, 오류율이 허용 기준 이내다.

## 6. 최종 판정

**현재는 Staging 적용 보류다.** 구현 코드에서 즉시 수정해야 할 확정 결함은 이번 제한 검토에서 발견되지 않았다. 보류 이유는 코드 결함이 아니라 적용 기준과 환경 상태가 검증되지 않았기 때문이다.

다음 세 조건을 모두 충족하면 **Staging 적용 가능**으로 전환할 수 있다.

1. 병합된 원격 `main`을 동기화해 필수 파일과 최종 diff를 재검증한다.
2. Staging의 전체 pending migration 범위와 적용 순서를 승인한다.
3. `current_user_is_admin()` 및 관련 `users` schema 의존성을 Staging SQL로 확인한다.

이후에도 DB 적용, Function 배포 및 Feature Flag 활성화는 각각 별도 승인 단계로 진행한다.
