# eb20517 Push 전 검토 보고서

작성일: 2026-06-20
대상 커밋: `eb20517dba9d524c1dfeff98f5951173f712ffe4`
커밋 메시지: `Add assistant registry foundation`

## 1. 커밋 요약

- 변경 파일: 9개
- 추가: 1,299줄
- 삭제: 159줄
- Assistant Registry 외 UI 변경과 Firebase Hosting 캐시 변경이 함께 포함되어 있다.

## 2. 포함 파일 목록

### Assistant 관련

- `docs/reports/assistant-audit-report.md`
- `docs/reports/assistant-registry-implementation-plan.md`
- `src/services/assistants.ts`
- `supabase/migrations/20260625000000_assistant_registry.sql`

### 별도 UI 변경

- `src/components/chat/ChatInput.tsx`
- `src/components/layout/MainLayout.tsx`
- `src/pages/AiProductPlannerPage.tsx`
- `src/pages/Dashboard.tsx`

### 생성 캐시

- `.firebase/hosting.ZGlzdA.cache`

## 3. Firebase 캐시 판단

`.firebase/hosting.ZGlzdA.cache`는 Assistant 기능과 무관한 Firebase Hosting 생성 캐시다.

변경 내용:

- 빌드 asset 파일명
- 생성 timestamp
- asset hash
- Service Worker 및 manifest hash

API Key나 credential은 포함되지 않았다. 저장소에서 과거부터 추적된 파일이지만 `dist`는 `.gitignore` 대상이므로 캐시만 갱신해 커밋할 실익이 적다.

권장 판단: 이번 Assistant Registry 커밋에서는 제외한다.

## 4. UI 파일 포함 이유 추정

UI 변경은 이전에 요청된 작업과 일치하므로 변경 자체는 의도된 것으로 판단된다.

### `ChatInput.tsx`

- 입력창 기본 높이 축소
- 입력 내용에 따라 최대 4줄까지 확장
- 최대 높이 이후 내부 스크롤
- 공급자·모델 선택 영역 줄바꿈 및 겹침 방지

### `MainLayout.tsx`

- 접힌 사이드바에 AI Planner 아이콘 추가
- 기타 앱 메뉴와 Planner 접근 버튼 분리
- Planner 활성 상태 표시

### `AiProductPlannerPage.tsx`

- 기본 페이지로 돌아가는 홈 아이콘 버튼 추가

### `Dashboard.tsx`

- Composer 보조 정보 영역 제거
- 예상 토큰·비용·모델 설명 rail 제거
- AI 공급자/모델 선택 영역의 줄바꿈과 너비 조정

이 변경들은 Assistant Registry와 직접 관계가 없으므로 별도 UI 커밋으로 분리하는 것이 적절하다.

## 5. 민감정보 검토

확인 결과:

- `.env` 파일 없음
- Private Key 파일 없음
- API Key 패턴 없음
- Supabase Service Role Key 값 없음
- JWT 패턴 없음
- GitHub Token 패턴 없음
- Google API Key 패턴 없음
- Firebase 캐시에는 asset 경로·timestamp·hash만 존재

민감정보 탐지 결과: **0건**

## 6. Push 가능 여부

판정: **보류**

보안이나 기능 오류 때문이 아니라 커밋 범위가 혼합되어 있기 때문이다.

- Assistant Registry 변경
- 독립적인 UI 변경
- Firebase 생성 캐시

위 세 종류가 하나의 커밋에 포함되어 있어 향후 rollback, blame, cherry-pick 및 변경 이력 검토가 어려워진다.

## 7. 필요한 조치

실제 변경은 별도 승인 후 수행한다.

1. UI 파일 4개가 최종 반영 대상인지 확인한다.
2. Assistant Registry 파일과 UI 변경을 별도 커밋으로 분리한다.
3. `.firebase/hosting.ZGlzdA.cache` 변경을 Assistant 커밋에서 제외한다.
4. Assistant Registry 커밋에는 다음 파일만 유지한다.
   - `docs/reports/assistant-audit-report.md`
   - `docs/reports/assistant-registry-implementation-plan.md`
   - `src/services/assistants.ts`
   - `supabase/migrations/20260625000000_assistant_registry.sql`
5. UI 변경은 별도 커밋으로 정리한다.
6. 정리 후 빌드, `git diff --check`, 작업 트리 및 origin/main 대비 커밋 수를 다시 확인한다.
7. 검증 완료 후 별도 승인으로 push한다.

## 8. 현재 Git 상태

- 작업 트리: 깨끗함
- 현재 브랜치: `main`
- origin/main보다 앞선 커밋: 8개
- origin/main보다 뒤처진 커밋: 0개
- push: 수행하지 않음
- reset/rebase/amend: 수행하지 않음
- 파일 수정·삭제: 수행하지 않음

단, 이 보고서 파일 생성은 사용자의 Markdown 파일 요청에 따라 별도 작업 트리 변경으로 남는다.
