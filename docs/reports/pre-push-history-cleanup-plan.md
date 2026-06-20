# Push 전 Git 이력 정리 계획

작성일: 2026-06-20
대상: `origin/main..HEAD` 8개 커밋
상태: 제안서 — Git 이력 변경 및 push 미실행

## 1. 현재 커밋 목록

현재 브랜치는 `origin/main`보다 8커밋 앞서 있다.

| 순서 | 커밋 | 파일 수 | 요약 | 판단 |
|---:|---|---:|---|---|
| 1 | `4fd60e7` | 155 | 대규모 WIP, Assistant·UI·Supabase·스크립트·바이너리 혼합 | 정리 필수 |
| 2 | `29f5ce6` | 15 | Marketplace와 Notebook·Dashboard·모델 변경 혼합 | 분리 권장 |
| 3 | `2d89460` | 1 | Marketplace migration 후속 수정 | 유지 가능 |
| 4 | `eb20517` | 9 | Registry·보고서·UI·Firebase 캐시 혼합 | 분리 필요 |
| 5 | `f7d8e12` | 3 | Assistant Router Shadow Mode | 유지 가능 |
| 6 | `f975111` | 5 | Assistant Router Shadow Log | 유지 가능 |
| 7 | `e8a2a44` | 2 | waitUntil 방어 및 안전 보고서 | 유지 가능 |
| 8 | `93e3b09` | 1 | Staging 적용 체크리스트 | 유지 가능 |

현재 작업 트리에는 다음 untracked 보고서가 있다.

```text
docs/reports/eb20517-pre-push-review.md
```

이 문서 파일 생성 후에는 현재 보고서도 untracked 파일로 추가된다.

## 2. 문제 커밋

### 2.1 `4fd60e7` — 가장 높은 위험

155개 파일과 다음 항목이 하나의 WIP 커밋에 혼합되어 있다.

- Assistant Edge Function 20개
- RAG/Dify/GCS 관련 변경
- Planner·Workflow·Plugin UI
- 테스트용 Edge Function
- 임시 스크립트와 dump 파일
- Firebase Hosting 캐시
- `supabase/.temp`
- 대형 Deno 바이너리와 압축 파일

대형 파일:

| 파일 | 크기 |
|---|---:|
| `deno-bin/deno.exe` | 102,081,536 bytes |
| `deno.zip` | 39,852,247 bytes |

비밀정보 패턴은 발견되지 않았지만, 대형 바이너리·임시 파일·여러 기능이 혼합되어 있어 그대로 push하는 것은 권장하지 않는다.

### 2.2 `29f5ce6`

Marketplace 변경 외에 다음 내용이 함께 포함되어 있다.

- `AGENTS.md`
- Notebook UI
- Dashboard
- AI 모델 타입·서비스
- Plugin Manager
- Dynamic Plugin Tools
- Smart Router 및 `ai-chat`

기능적으로 연관된 변경도 있지만 하나의 커밋으로는 범위가 넓다.

### 2.3 `eb20517`

Assistant Registry와 다음 UI 변경이 섞여 있다.

- 채팅 입력창 최대 4줄 제한
- 공급자 선택 영역 줄바꿈
- Composer 보조 정보 제거
- 접힌 사이드바 Planner 버튼
- AI Planner 홈 버튼
- Firebase Hosting 캐시

UI 변경은 이전 사용자 요청과 일치하므로 변경 자체는 의도된 것으로 판단된다. 다만 Assistant Registry와는 별도 커밋으로 분리하는 것이 적절하다.

## 3. 정리 필요 파일

### 우선 제외 또는 별도 검토

- `.firebase/hosting.ZGlzdA.cache`
- `deno-bin/deno.exe`
- `deno.zip`
- `supabase/.temp/cli-latest`
- `db_schema.sql`
- `db_schema_temp.sql`
- `dump.sql`
- `refactor.cjs`
- `refactor2.cjs`
- `fix_responses.cjs`
- `supabase/functions/test-boot/*`
- `supabase/functions/test-imports/*`
- `set-secrets.cjs`
- 여러 Edge Function 내부 `.npmrc`

### 보안 검사 결과

- `.env` 파일 없음
- Private Key 파일 없음
- API Key 패턴 없음
- Supabase Service Role Key 값 없음
- JWT 패턴 없음
- GitHub Token 패턴 없음
- Google API Key 패턴 없음
- `.npmrc` 실제 auth token 패턴 없음
- `set-secrets.cjs` 실제 secret literal 패턴 없음

탐지된 credential 패턴: **0건**

보안 패턴이 없더라도 위 파일들이 배포·개발에 실제 필요한지는 별도로 검토해야 한다.

## 4. 추천 정리 전략

현재 로컬 `main`을 직접 rebase하지 않고 다음 방식으로 새 이력을 만드는 것이 가장 안전하다.

1. 현재 HEAD를 백업 브랜치로 보존한다.
2. `origin/main`에서 새 cleanup 브랜치를 만든다.
3. 백업 브랜치에서 필요한 파일만 주제별로 복원한다.
4. generated/cache/binary 파일은 명시적인 승인 없이는 제외한다.
5. 기능별로 작은 커밋을 만든다.
6. 원래 HEAD와 cleanup 결과의 파일 차이를 검토한다.
7. 빌드·Deno 검사·비밀정보 검사를 다시 수행한다.
8. cleanup 브랜치를 먼저 push하고 PR로 검토한다.
9. 검증이 끝날 때까지 백업 브랜치를 삭제하지 않는다.

이 방식의 장점:

- 기존 로컬 커밋을 파괴하지 않는다.
- `main`에서 직접 history rewrite를 하지 않는다.
- 불필요한 파일을 명확하게 제외할 수 있다.
- 정리 결과가 잘못돼도 즉시 백업 브랜치로 돌아갈 수 있다.

## 5. 실행 명령어 초안

아래 명령은 제안용이며 현재 실행하지 않는다.

### 5.1 백업 및 cleanup 브랜치

```powershell
git status --short
git branch backup/pre-push-assistant-20260620
git switch -c cleanup/assistant-staging origin/main
```

### 5.2 필요한 파일만 복원

```powershell
git restore --source backup/pre-push-assistant-20260620 -- <승인된-파일들>
git add <승인된-파일들>
git commit -m "<주제별 커밋 메시지>"
```

각 그룹의 파일 목록을 먼저 확정한 뒤 실행해야 한다. `<승인된-파일들>`을 `.` 또는 광범위한 wildcard로 대체하지 않는다.

### 5.3 검증

```powershell
git status --short
git log --oneline origin/main..HEAD
git diff --check origin/main..HEAD
npm run build
.\deno-bin\deno.exe check supabase\functions\_shared\nh-smart-routing.ts
.\deno-bin\deno.exe check supabase\functions\_shared\assistant-router-shadow-log.ts
```

대형 파일 확인:

```powershell
git rev-list --objects origin/main..HEAD |
  git cat-file --batch-check="%(objecttype) %(objectname) %(objectsize) %(rest)"
```

정리 완료 후 별도 승인을 받은 경우에만:

```powershell
git push -u origin cleanup/assistant-staging
```

## 6. 정리 후 예상 커밋 구조

권장 구조:

1. `chore: add approved project runtime configuration`
   - 실제 필요한 설정만 포함
   - 대형 로컬 바이너리·cache·temp·dump 제외

2. `feat: add assistant edge functions and workflow integrations`
   - Assistant 20개 Function
   - Workflow 및 연동 가이드

3. `feat: add planner and workspace integrations`
   - Planner, Plugin Connection, Scheduled Task 등

4. `feat: add smart router marketplace extension`
   - `29f5ce6`과 `2d89460`의 Marketplace 관련 변경

5. `fix: compact chat composer and improve planner navigation`
   - `ChatInput.tsx`
   - `MainLayout.tsx`
   - `AiProductPlannerPage.tsx`
   - `Dashboard.tsx`

6. `feat: add assistant registry foundation`
   - `src/services/assistants.ts`
   - `20260625000000_assistant_registry.sql`

7. `docs: add assistant registry audit and implementation plan`

8. `feat: add assistant router shadow mode`

9. `feat: add assistant router shadow logging`

10. `fix: isolate assistant shadow logger scheduling failures`

11. `docs: add assistant staging safety and deployment checklists`

필요하면 문서 커밋은 해당 기능 커밋에 함께 포함할 수 있지만, 코드와 무관한 대규모 보고서는 별도 문서 커밋으로 유지하는 편이 검토하기 쉽다.

## 7. 위험 요소

### 파일 누락

WIP 커밋에서 필요한 파일을 빠뜨리면 기능이 깨질 수 있다.

대응:

- 기능별 파일 목록 작성
- 원래 HEAD와 cleanup 브랜치 비교
- 빌드·Deno·기능 smoke test 수행

### 커밋 의존성

후속 커밋이 WIP에서 추가한 파일을 전제로 할 수 있다.

대응:

- 원래 시간 순서를 참고해 그룹 적용
- 각 커밋 직후 최소 빌드 또는 타입 검사

### 대형 Deno 바이너리 제외

로컬 검사에서 `deno-bin/deno.exe`를 직접 사용한다.

대응:

- 저장소 포함 여부를 먼저 정책으로 결정
- 제외한다면 설치 또는 bootstrap 절차 문서화
- cleanup 환경에서 Deno 검사 가능 여부 확인

### Firebase 캐시

`.firebase/hosting.ZGlzdA.cache`는 과거부터 추적된 파일이다.

대응:

- 계속 추적할지 저장소 정책 결정
- 제외한다면 별도 승인으로 `.gitignore` 정책 검토
- 실제 배포 파이프라인이 캐시 파일을 요구하는지 확인

### 현재 untracked 보고서

다음 보고서들이 cleanup 과정에서 누락될 수 있다.

- `docs/reports/eb20517-pre-push-review.md`
- `docs/reports/pre-push-history-cleanup-plan.md`

대응:

- 최종 문서 커밋에 명시적으로 포함

### 커밋 해시 변경

새 cleanup 브랜치에서는 기존 8개 커밋과 다른 해시가 생성된다.

대응:

- 백업 브랜치 유지
- 기존 해시와 새 해시의 대응표 기록

## 8. 롤백 방법

### 정리 전

```powershell
git branch backup/pre-push-assistant-20260620
```

### cleanup 과정에 문제가 있을 때

```powershell
git switch backup/pre-push-assistant-20260620
```

백업 브랜치는 다음 조건을 모두 충족할 때까지 삭제하지 않는다.

- cleanup 브랜치 빌드 성공
- Router/Logger Deno 검사 성공
- 비밀정보 검사 성공
- Staging smoke test 성공
- 원격 push 및 PR 검토 완료

cleanup 브랜치가 잘못되더라도 기존 로컬 `main`과 백업 브랜치는 그대로 남겨 둔다. branch 삭제나 강제 push는 별도 승인 없이 수행하지 않는다.

## 9. 최종 권장안

현재 8개 커밋을 그대로 push하는 것은 **보류**한다.

`eb20517`도 분리가 필요하지만 가장 큰 위험은 `4fd60e7`이다. 155개 파일과 대형 바이너리·임시 파일이 포함되어 있어, `eb20517`만 정리해도 전체 push가 안전해지지 않는다.

가장 안전한 순서:

1. `4fd60e7`의 155개 파일 필요 여부 분류
2. Firebase 캐시·Deno 바이너리·temp·dump 정책 결정
3. UI 변경 4개 최종 반영 여부 확인
4. 백업 브랜치 생성
5. `origin/main` 기반 cleanup 브랜치 생성
6. 승인된 파일만 주제별 복원 및 커밋
7. 전체 검증
8. 별도 승인 후 cleanup 브랜치 push

현재 보고서 작성 과정에서는 reset, rebase, cherry-pick, commit, push, 파일 삭제, DB 적용 및 배포를 수행하지 않았다.
