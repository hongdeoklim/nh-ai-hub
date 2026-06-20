# Cleanup Assistant Staging 최종 결과

작성일: 2026-06-20
브랜치: `cleanup/assistant-staging`
기준: `origin/main`
백업: `backup/pre-push-assistant-20260620`

## 1. 정리 결과

기존 8개 혼합 커밋을 직접 수정하지 않고, `origin/main`에서 새 cleanup 브랜치를 만든 뒤 승인된 파일만 주제별로 복원했다.

생성된 코드 커밋:

| 순서 | 커밋 | 메시지 | 파일 수 |
|---:|---|---|---:|
| 1 | `a7acf6d` | `feat: add assistant function foundations` | 41 |
| 2 | `4bc9175` | `feat: add plugin marketplace and smart router extension` | 20 |
| 3 | `74e6161` | `feat: add workflow and planner foundations` | 13 |
| 4 | `66163de` | `fix: compact chat composer and planner navigation` | 4 |
| 5 | `5d6685b` | `feat: add assistant registry foundation` | 4 |
| 6 | `1e5848e` | `feat: add assistant router shadow mode` | 2 |
| 7 | `e7bcd5a` | `feat: add assistant router shadow logging` | 4 |

마지막 문서 커밋에는 본 보고서와 Assistant 관련 설계·안전·Staging 보고서를 포함한다.

## 2. 복원 원칙

- `git add .`를 사용하지 않았다.
- 모든 복원과 stage는 명시 경로 목록으로 수행했다.
- 중복 파일은 기능 단계에 맞는 중간 커밋 버전을 사용했다.
- Router/ai-chat은 Marketplace → Shadow Mode → Shadow Log 순서로 복원했다.
- `src/services/assistants.ts`는 Assistant 기반 → Registry 증분 순서로 복원했다.
- `AiProductPlannerPage.tsx`는 Planner 기반 → UI 최종 상태 순서로 복원했다.
- 기존 파일의 trailing whitespace만 기계적으로 제거했다.
- 기능 로직을 cleanup 과정에서 새로 추가하지 않았다.

## 3. 제외 파일

다음 파일과 경로는 cleanup 브랜치에 포함하지 않았다.

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

- 제외 파일 탐지: 0건
- 10MiB 초과 신규 Git blob: 0건

## 4. 보안 검사

전체 `origin/main..HEAD` diff를 대상으로 다음 패턴을 검사했다.

- OpenAI 형식 API Key
- Google API Key
- GitHub Token
- JWT
- Private Key header
- Supabase Service Role Key literal
- `.npmrc` 실제 auth token

결과:

- credential 패턴 탐지: 0건
- `.env` 포함: 없음
- secret 파일 포함: 없음

`.npmrc` 파일은 일부 Edge Function 디렉터리에 포함되지만 실제 token literal은 없다.

## 5. 필수 Assistant 파일

다음 필수 파일 존재를 확인했다.

- `supabase/migrations/20260625000000_assistant_registry.sql`
- `supabase/migrations/20260626000000_assistant_router_shadow_logs.sql`
- `supabase/functions/_shared/assistant-router-shadow-log.ts`
- `supabase/functions/_shared/nh-smart-routing.ts`
- `supabase/functions/ai-chat/index.ts`
- `src/services/assistants.ts`

Assistant Function 20개와 Registry/Router/Shadow Log 기반이 cleanup 브랜치에 포함됐다.

## 6. 검증 결과

### Git diff

- `git diff --check origin/main..HEAD`: 통과
- excluded 파일 검사: 통과
- 대형 blob 검사: 통과

### Build

```text
npm run build: 성공
```

참고:

- Vite 대형 chunk 경고는 존재하지만 build 실패는 아니다.
- cleanup 브랜치에서 3,750 modules가 변환됐다.

### Deno

cleanup 브랜치에는 제외 정책에 따라 Deno binary를 포함하지 않았다. 검사를 위해 백업 브랜치의 binary를 저장소 밖 임시 경로에만 추출하고 검사 후 삭제했다.

```text
nh-smart-routing.ts: Deno check 통과
assistant-router-shadow-log.ts: Deno check 통과
```

임시 Deno binary와 archive는 cleanup 브랜치에 포함되지 않았다.

## 7. 변경하지 않은 항목

- Git push 미실행
- DB migration 미적용
- Supabase Function 배포 미실행
- Feature Flag 미변경
- Assistant 실행 없음
- Orchestrator 구현 없음
- 원본 main 이력 재작성 없음
- 백업 브랜치 삭제 없음

## 8. 백업 및 롤백

원본 상태는 다음 브랜치에 보존되어 있다.

```text
backup/pre-push-assistant-20260620
```

cleanup 결과에 문제가 있으면 해당 브랜치로 전환해 원본 8개 커밋 상태를 확인할 수 있다.

```powershell
git switch backup/pre-push-assistant-20260620
```

백업 브랜치는 cleanup 브랜치의 원격 검토와 Staging 검증이 끝날 때까지 삭제하지 않는다.

## 9. Push 준비 판단

판정: **조건부 가능**

충족된 조건:

- 주제별 커밋 분리
- 금지 파일 제외
- credential 검사 통과
- 대형 blob 없음
- build 성공
- Router/Logger Deno 검사 성공
- diff whitespace 검사 성공

push 전 마지막 확인:

1. 문서 커밋 후 작업 트리가 깨끗한지 확인
2. `origin/main`보다 ahead/behind 수 확인
3. 커밋 목록 최종 검토
4. 별도 사용자 승인

승인 후 사용할 명령:

```powershell
git push -u origin cleanup/assistant-staging
```

현재 작업에서는 push하지 않는다.
