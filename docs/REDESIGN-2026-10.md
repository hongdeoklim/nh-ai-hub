# NH-AX-HUB 전면 개편 (2026-10) — 진단 · 제안 · 셸 설계

작성일: 2026-10-15 · 브랜치: `claude/nh-ax-hub-redesign-d592ee`
범위: 프런트엔드(React/Tailwind) UI·UX 전반 — PC · 모바일 · 앱(PWA)

> 요약
> 1. 디자인 토큰 체계 신설(NH 그린/블루, 시맨틱 컬러, 다크 모드)과 앱 셸 v2(레일+패널 / 하단 탭 / 앱 런처 / 명령 팔레트 / 계정 메뉴)를 구현했다.
> 2. 숨겨져 있던 기능(알림, 예약 작업, 플러그인 연결)을 UI 에 연결했고, PWA 메타·매니페스트·스플래시를 정비했다.
> 3. 가장 큰 기술 부채인 **루트 폰트 27px** 은 승인 후 §3.1 절차대로 **16px 로 전환 완료**했다. `text-[Npx]!` 767건과 `.app-shell`/`.admin-shell` 역보정 CSS 약 450줄을 제거했고, 93개 파일에 §6 치환표를 적용해 팔레트 클래스 2,228건을 시맨틱 토큰으로 바꿨다.

---

## 1. 현재 상태 진단 (문제점)

### 1.1 디자인 시스템 · 스타일 부채

| # | 문제 | 근거 | 영향 |
|---|---|---|---|
| D1 | **루트 폰트 27px(≤1024px: 24px)** → 모든 rem 유틸(`p-4`, `gap-3`, `rounded-xl`, `max-w-xl`…)이 설계값의 1.69×/1.5× 로 렌더 | `src/index.css :root { font: 27px/145% }` | 간격·모서리·최대폭이 전부 팽창. 이를 상쇄하려 `.app-shell .text-[13px] { 8px }` 류 역보정 36개와 그 역보정을 다시 피하는 `text-[Npx]!` **761회** 사용 |
| D2 | Vite 템플릿 잔재 | `App.css`(hero/counter, 미사용), `h1 84px`, `code 22.5px`, `--accent: #aa3bff`(보라, TSX 사용 0회), `#social` | 의도치 않은 전역 스타일, 데드 코드 |
| D3 | **팔레트 분열** | 포털 stone+orange(2,873/445회), 관리자 slate+indigo(2,278/462), 로그인 emerald, 라이브러리 `#05070c`+pink, 채팅 Gemini 블루, 스플래시 green→blue, `theme-color #059669`, 매니페스트 `#020617` | 브랜드 정체성 부재, 화면마다 다른 제품처럼 보임 |
| D4 | 하드코딩 hex | `bg-[#FAF9F6]` 36회, `bg-[#F4F1EA]` 10회 등 | 다크 모드 각자 처리, 토큰 교체 불가 |
| D5 | 아이콘 체계 없음 | 인라인 SVG 복제 + 이모지(📐 🦺 📚 ✨) | 크기·굵기 불일치, 접근성 |
| D6 | 피드백 UX 혼재 | `window.alert/confirm/prompt` 35회 vs `sonner` 토스트 123회, 로딩 컴포넌트 3종 | 네이티브 다이얼로그는 앱/PWA 에서 이질적 |
| D7 | `sonner` 가 package.json 에 없음 | 전이 의존성에 기대어 import | 설치 환경에 따라 빌드 실패 가능 |

### 1.2 정보 구조 · 내비게이션

| # | 문제 | 근거 |
|---|---|---|
| N1 | 사이드바 하단 독: 16개 기능이 **14px 아이콘 · 레이블 숨김(`hidden`) · 30px 높이** 4열 격자 | `SidebarNavDock.tsx` — PC/모바일 모두 식별 불가, 터치 타깃 44px 미달 |
| N2 | 진입점 중복 | `/automation-studio` 가 `/workflows`·`/marketplace`·`/workspace-tools` 를 통합했지만 셋이 여전히 라우트·링크로 노출. `/ai-office` 는 내비 없음 |
| N3 | 전역 검색/명령 없음 | 스레드 검색만 존재, 단축키 없음 |
| N4 | **알림 UI 미연결** | `NotificationsAndTodos.tsx`(실시간 구독·할 일) 가 어디에도 렌더되지 않음. `proactive-notifier`·`send-push`·FCM 백엔드는 존재 |
| N5 | **예약 작업·플러그인 연결 미연결** | `ScheduledTasksPanel`, `PluginConnectionsPanel` 구현 완료 + `execute-scheduled-tasks` 함수 존재. 설정 다이얼로그는 "준비 중" 문구만 표시 |
| N6 | 잘못된 안내 문구 | 설정 '이전 기록': "브라우저 탭 세션에만 유지" — 실제로는 `private-chat-remote/sync` 로 서버 동기화됨 |
| N7 | 관리자 콘솔 17개 평면 메뉴, 그룹 없음 | `AdminLayout.tsx` |
| N8 | 페이지 헤더 패턴 전부 상이 | Scrapbook / Teams / KnowledgeHub / Library / AutomationStudio 각자 구현, 공용 `PageHeader` 없음 (`components/common` 비어 있음) |

### 1.3 모바일 · 앱(PWA)

| # | 문제 | 근거 |
|---|---|---|
| M1 | `user-scalable=no` | 확대 불가 — WCAG 1.4.4 위반 |
| M2 | 모바일 상단바 우측 **빈 영역**, 하단 탭 없음 | 계정·설정·알림 접근 경로가 햄버거→드로어→독(N1) 하나 |
| M3 | 스플래시 1.5초 강제 지연, 아이콘 PNG 4개가 동일 420KB 파일, `splash-bg.png` 1.1MB·`icons.svg` 미사용 | `index.html`, `public/` |
| M4 | 폰트 CDN 로드 + 로컬 woff2 3MB 중복 | 오프라인(PWA) 에서 서체 깨짐 |
| M5 | 매니페스트 | `orientation: portrait` 고정(태블릿/데스크톱 PWA 불리), shortcuts·display_override·id 없음, theme_color 불일치 |
| M6 | `scale-[0.70]` 해킹 | `PwaInstallPrompt`, `ReloadPrompt` — D1 의 증상 |
| M7 | standalone(설치 앱) 감지·뒤로가기 처리 없음 | 시트/드로어가 뒤로가기로 닫히지 않음 |
| M8 | 접근성 | `focus-visible` 25회(대부분 포커스 링 없음), reduced-motion 일부만 |

### 1.4 아키텍처 · 품질

- `Dashboard.tsx` 82KB(2,300줄), `ChatInput.tsx` 76KB, `MainLayout.tsx` 36KB — 단일 파일 비대.
- 테스트 0개, lint 에러 260건(non-blocking), README 가 Vite 템플릿 그대로.

---

## 2. 제안 — 지금 반영하면 좋은 것

| 우선순위 | 제안 | 상태 |
|---|---|---|
| P0 | 시맨틱 디자인 토큰 + NH 브랜드 컬러 (`bg-surface`, `text-fg`, `bg-brand`…) | ✅ 구현 (`src/index.css`) |
| P0 | 앱 셸 v2 — PC 레일+패널, 모바일 하단 탭+드로어, 앱 런처 | ✅ 구현 |
| P0 | 전역 헤더: 검색/명령 팔레트(Ctrl K), 알림 벨, 토큰 칩, 계정 메뉴(테마 토글) | ✅ 구현 |
| P0 | 숨겨진 기능 연결: 알림 · 예약 작업 · 플러그인 연결, 안내 문구 정정 | ✅ 구현 |
| P0 | `window.alert/confirm/prompt` → `useDialogs()`(Promise 기반 `confirm`/`prompt`) · 토스트 | ✅ 전 화면 적용 (잔여: `ai-sheets/SheetsGlobalCanvas` 4건 — 제외 영역) |
| P1 | 빈 목록 `EmptyState` 적용 (스크랩북·팀·팀 상세·자동화·마켓·라이브러리·예약 작업·토큰 요청 관리) | ✅ 완료 |
| P1 | 키보드 포커스 전역 기본 표시 (`:focus-visible` outline, @layer base) | ✅ 완료 |
| P0 | PWA: viewport·theme-color·color-scheme, 로컬 폰트, 스플래시 450ms, 매니페스트(shortcuts/orientation any/display_override) | ✅ 구현 |
| P0 | `sonner` 명시 의존성, README 재작성, 데드 코드 삭제 | ✅ 구현 |
| **P1** | **루트 폰트 16px 전환** (§3.1) | ✅ 완료 (2단계 커밋) |
| P1 | 페이지별 토큰 마이그레이션 (stone/slate/orange → 시맨틱) | ✅ 1차 93파일 완료 · 제외: LibraryPage, ai-sheets, knowledge-graph, CadEditor, UniverOffice (§6.1) |
| P1 | 각 페이지 `PageHeader` 적용 (13개 화면: 스크랩북·팀·지식 허브·자동화·CAD·연동·노트북·현장평가·Slides·자료실·마켓·워크플로우·라이브러리) | ✅ 완료 · `EmptyState` 는 후속 |
| P1 | 레거시 라우트 `/workflows` `/marketplace` `/workspace-tools` | 유지 결정 — 자동화 스튜디오가 링크하는 **상세 화면**이라 리다이렉트하면 기능 손실. 내비에서만 숨김(`hidden`) |
| P1 | 아이콘 자산: 1024px 원본 → 192/512/180(apple) 실제 리사이즈, maskable 512 별도 생성, `splash-bg.png`(1MB, 미사용) 삭제 | ✅ 완료 |
| P1 | `LibraryPage` 토큰화 (네이비+핑크 독자 테마 → 시맨틱 토큰, PageHeader) | ✅ 완료 (레이아웃은 유지) |
| P2 | 관리자 콘솔 시맨틱 토큰 적용 (현재 그룹화만) | 제안 |
| P2 | Dashboard/ChatInput 분해 (훅 추출), Playwright 스크린샷 테스트, lint 게이트 전환 | 제안 |
| P2 | 설치 앱: 프리캐시 슬림화(무거운 편집기·관리자 청크는 첫 사용 시 런타임 캐시), 오프라인 상태 배너 | ✅ 완료 (7단계) |
| P2 | 단위 테스트 기반: vitest + `npm test` CI 게이트, IA(`app-navigation`)·토큰 예산 헬퍼 테스트 | ✅ 완료 (7단계) — 컴포넌트 테스트는 jsdom 환경 추가 후 |
| P2 | 데스크톱 PWA 창 컨트롤 오버레이 | 제안 |
| P2 | ESLint 부채 청산 → CI 차단 게이트 (src 오류 0건; Deno 함수·스크립트는 린트 대상에서 제외; `react-hooks/set-state-in-effect` 는 경고로 가시화 69건) | ✅ 완료 (8단계) |

---

## 3. 디자인 시스템

### 3.0 토큰 (`src/index.css`)

원시값은 `:root` / `:root.dark` 의 `--nh-*` 에만 두고, `@theme inline` 으로 Tailwind 유틸에 연결한다.

| 역할 | 유틸 | 라이트 | 다크 |
|---|---|---|---|
| 브랜드 | `bg-brand` `text-brand` `bg-brand-strong` `bg-brand-soft` `text-brand-fg` | `#0f8a4f` / `#0b6e3f` / `#e7f5ec` | `#34c77b` / `#22a864` / 14% |
| 강조(링크·정보) | `bg-accent` `text-accent` `bg-accent-soft` | `#1757b8` | `#6ba3f2` |
| 표면 | `bg-bg` `bg-surface` `bg-surface-2` `bg-surface-3` | `#f5f7f4` `#fff` `#eef1ed` `#e3e8e2` | `#0e1211` `#161b19` `#1e2522` `#273029` |
| 선 | `border-border` `border-border-strong` | `#e1e6e0` `#c7cec6` | `#2a332e` `#3b463f` |
| 텍스트 | `text-fg` `text-fg-muted` `text-fg-subtle` | `#15201a` `#56655d` `#87948c` | `#ecf1ee` `#a5b0aa` `#74807a` |
| 상태 | `text-success/warning/danger` + `bg-*-soft` | — | — |
| 포커스 | `ring-focus/50` | `#1757b8` | `#6ba3f2` |
| 그림자 | `shadow-card` `shadow-pop` | — | — |

브랜드 색을 바꾸려면 `--nh-brand*`, `--nh-accent*` 6개 값만 수정하면 전체 셸에 반영된다.
레거시 변수(`--text`, `--code-bg`, `--accent` 등)는 새 토큰의 별칭으로 유지해 기존 마크다운/코드 블록 CSS 가 깨지지 않게 했다.

### 3.1 루트 폰트 16px 전환 절차 — ✅ 완료

`:root { font: 27px }` 때문에 rem 유틸이 팽창하고, 이를 상쇄하는 `.app-shell`·`.admin-shell` 역보정 규칙과 `text-[Npx]!` 767회가 존재했다. 아래 절차를 그대로 수행했으며(스크립트: 루트 16px 치환 + `!` 제거 + `text-actual-N` → `text-[Npx]`), 기본 타이포는 `@layer base` 로 옮겨 유틸리티가 항상 우선하도록 했다. 전환 후 `/__ui-check`, `/__ui-check/shell`, `/login` 에서 확인했고 `tsc`·`vite build` 통과.

1. `src/index.css` 에서 `:root` 의 `font: 27px/145%` → `font: 16px/1.5`, `@media (max-width:1024px){font-size:24px}` 삭제, `letter-spacing: 0.27px` → `0`.
2. `.app-shell`, `.admin-shell` 블록의 **폰트 사이즈 역보정 규칙만** 삭제(`.app-shell .text-sm {14px}`, `.app-shell .text-\[13px\] {8px}`, `.app-shell .h-8 {32px}` …). 기본 `font-size:16px / line-height` 선언은 유지해도 무해.
3. 포털(body) 전용 보정 클래스(`.private-chat-thread-menu`, `.chat-composer-popup-menu`, `.composer-meta-rail`, `.text-actual-*`)는 16px 기준에서 불필요 → 삭제 후 해당 컴포넌트는 Tailwind 유틸로 대체.
4. 전역 치환: `text-[13px]!` → `text-[13px]` (정규식 `text-\[(\d+(\.\d+)?)px\]!` → `text-[$1px]`). 의미는 동일하므로 리스크 없음.
5. `index.html` 스플래시는 이미 px 단위 → 영향 없음.
6. 검증: `/__ui-check`, `/__ui-check/shell`, 채팅, 자료실, 관리자 대시보드를 1280/768/390 폭에서 스크린샷 비교. rem 기반 레거시 간격(`p-4` 등)이 **의도대로 작아지는** 것이 정상이며, 체감이 너무 좁아지는 화면은 개별 조정.

예상 작업량: 반나절. 시각 변화가 전역이므로 별도 브랜치·PR 로 분리 권장.

### 3.2 타이포그래피 · 크기 규칙

- 제목 24/20(semibold, tracking -0.01em), 본문 16/14, 보조 12/11, 아이브로우 11 uppercase tracking 0.12em.
- 신규·수정 UI 는 **px 임의값**(`h-[36px]`, `gap-[8px]`, `rounded-[12px]`)을 사용 (CLAUDE.md 규칙 6). 전환(§3.1) 후에도 그대로 유효.
- 터치 타깃 최소 44×44(모바일 탭·헤더 버튼), PC 아이콘 버튼 36×36.
- 포커스: 모든 인터랙티브 요소에 `focus-visible:ring-2 focus-visible:ring-focus/50`.

### 3.3 아이콘

`src/components/common/icons.tsx` — 24×24, stroke 1.75, lucide 스타일 60여 종. 이모지 사용 금지. 크기는 `h-[20px] w-[20px]` 로 지정.

---

## 4. 앱 셸 v2 설계

IA 단일 소스: `src/lib/app-navigation.tsx` (`NAV_GROUPS`). 레일·런처·하단 탭·명령 팔레트·헤더 제목·`document.title` 이 모두 이 데이터를 읽는다.

```
채팅            /  (/chat/:id)
지식            자료실 · 지식 허브 · 노트북 · 스크랩북 · 라이브러리
자동화          자동화 스튜디오 · CAD 에이전트   (hidden: 워크플로우 · 마켓플레이스 · 워크스페이스 연동)
AI 앱           Planner · Designer · Slides · Sheets   (hidden: AI Office)
팀 · 현장       팀 공유 채팅 · 현장 AI 평가
```

### 4.1 PC (≥ 768px)

```
┌──┬─────────────┬────────────────────────────────────────────┐
│NH│ 대화         │ [≡] 채팅  · 설명          [검색 · 이동 · 명령 Ctrl K]   🔔 ? 토큰 82% (●) │
│✎ │ ┌─────────┐ ├────────────────────────────────────────────┤
│💬│ │ 새 채팅   │ │                                              │
│지식│ │ 검색     │ │               <Outlet />                     │
│자동│ ├─────────┤ │                                              │
│AI│ │ 고정     │ │                                              │
│팀│ │ 최근 대화 │ │                                              │
│  │ │ …        │ │                                              │
│🛡│ └─────────┘ │                                              │
│⚙ │             │                                              │
│(●)│  280px      │                                              │
└──┴─────────────┴────────────────────────────────────────────┘
 68px
```

- **레일(68px)**: 로고, 새 채팅(브랜드 원형), 그룹 5개(아이콘 22px + 10px 레이블, 활성 시 좌측 3px 바), 하단 관리자(권한자)·설정·아바타.
- **보조 패널(280px, 접기 가능, `nh_ui_panel_open` 영속)**: 채팅 그룹 → 대화 목록(새 채팅·검색·고정·최근·⋮ 메뉴), 다른 그룹 → 항목 목록(아이콘·레이블·설명). 그룹을 다시 누르면 접힘. 1024px 미만 기본 접힘.
- **헤더(52px)**: 패널 토글, 화면 제목+그룹 설명, 검색/명령 버튼, 프롬프트 보관함 토글(채팅 화면만), 알림 벨(실시간), 도움말, 토큰 잔량 칩(15%↓ 위험색), 아바타 → 계정 팝오버.
- **명령 팔레트(Ctrl/⌘ K)**: 이동(숨김 라우트 포함) · 최근 대화 · 작업(새 채팅, 테마 전환, 설정, 패널 토글, 관리자, 로그아웃). ↑↓ Enter Esc.
- **계정 메뉴**: 프로필, 토큰 미터 + 증액 요청, 테마 3단 토글(시스템/라이트/다크, 시스템 변경 실시간 반영), 설정, 가이드, 관리자 링크, 로그아웃.

### 4.2 모바일 (< 768px)

```
┌────────────────────────────┐
│ ☰  채팅                🔍 🔔 (●)│  52px + safe-area-top
├────────────────────────────┤
│                              │
│         <Outlet />           │
│                              │
├────────────────────────────┤
│  💬     📁     ▦     ⚡    👤  │  56px + safe-area-bottom
│ 채팅  자료실   앱   자동화  내 정보│
└────────────────────────────┘
```

- 하단 탭 5개(라벨 포함). **앱** 탭 → 전체 화면 시트 런처(검색 + 그룹별 타일 + 계정·지원). **내 정보** → 계정 시트.
- ☰ → 좌측 드로어(대화 목록, PC 패널과 동일 컴포넌트).
- 채팅 입력창(textarea)에 포커스하면 하단 탭이 내려가 키보드 영역을 확보한다. 셸 루트가 `--app-bottom-nav` 변수(56px+safe-area ↔ 0)를 노출하고, `main` 의 `padding-bottom` 과 Dashboard 의 고정 컴포저 `bottom` 이 이를 참조한다.
- 모든 시트/드로어는 `Overlay` 컴포넌트: 백드롭·Esc·**뒤로가기** 로 닫힘, 배경 스크롤 잠금, 포커스 복원.

### 4.3 앱 (PWA standalone)

- `useIsStandaloneApp()` 로 감지 → 셸 루트 `data-standalone="true"` (앱 전용 스타일 훅).
- 뒤로가기로 오버레이 닫기(`useBackCloseable`) — Android 하드웨어 백·iOS 스와이프 백 대응.
- 매니페스트: `id`, `display_override: ['standalone','minimal-ui']`, `orientation: 'any'`, 바로가기 4종(새 채팅·자료실·자동화·노트북), `categories`.
- `theme-color` 라이트/다크 분리 + `useTheme` 가 런타임에 갱신. `color-scheme: light dark`.
- 폰트 self-host(`/fonts/*.woff2`) + preload → 오프라인에서도 서체 유지.
- 스플래시: 브랜드 마크, 450ms 후 페이드(reduced-motion 시 즉시), 세션당 1회.

---

## 5. 이번 변경 파일

**신규**
- `src/components/common/` — `icons.tsx`, `Overlay.tsx`, `ConfirmDialog.tsx`(Confirm/Prompt), `PageHeader.tsx`, `EmptyState.tsx`, `Avatar.tsx`, `TokenMeter.tsx`
- `src/components/layout/shell/` — `NavRail`, `ChatThreadsPanel`, `GroupPanel`, `AppHeader`, `BottomTabBar`, `AppLauncher`, `CommandPalette`, `AccountMenu`
- `src/lib/app-navigation.tsx`, `src/hooks/useTheme.ts`, `src/hooks/useDisplayMode.ts`, `src/hooks/useBackCloseable.ts`
- `.claude/launch.json`(개발 서버 미리보기), `docs/REDESIGN-2026-10.md`

**수정**
- `src/index.css` — 토큰 체계·@font-face·템플릿 잔재 제거 (루트 27px 는 유지)
- `src/components/layout/MainLayout.tsx` — 셸 v2 로 재작성
- `src/components/settings/SettingsDialog.tsx` — Overlay 기반, 예약 작업·플러그인 탭 연결, 안내 문구 정정
- `src/pages/admin/AdminLayout.tsx` — 메뉴 5개 영역 그룹화
- `src/pages/Dashboard.tsx`, `AiDesignerPage.tsx`, `AiProductPlannerPage.tsx` — 페이지 전용 헤더 제거(전역 헤더로 대체), 컴포저 하단 탭 오프셋
- `PrivateChatThreadRow`, `NotificationsAndTodos`, `PwaInstallPrompt`, `ReloadPrompt`, `RouteLoadingFallback`, `PrivateChatHomeRedirect`, `AdminRoute`, `App.tsx` — 토큰 적용·px 치수·dev 라우트
- `index.html`, `vite.config.ts`(매니페스트), `package.json`(sonner), `README.md`

**삭제**
- `src/App.css`, `src/components/layout/SidebarNavDock.tsx`, `src/components/layout/AccountHeaderActions.tsx`, `public/splash-bg.png`

**2~4단계 추가 (커밋 12b0da4 · 0eb0162 · 3df7037)**
- `src/index.css` 루트 16px · 역보정 제거 · `@layer base` 타이포/포커스 기본값
- `src/components/common/DialogProvider.tsx` (`useDialogs`), `src/lib/token-budget.ts`
- 13개 화면 `PageHeader`, 8개 화면 `EmptyState`, `LibraryPage` 토큰화, 네이티브 다이얼로그 20곳 교체
- `public/` 아이콘 192/512/180 리사이즈 + `pwa-maskable-512.png`, `vite.config.ts` 매니페스트 maskable 분리
- `src/App.tsx` `portalPageRoutes`·`adminPageRoutes` 추출 + DEV 검수 라우트 `/__ui-check/app/*` (채팅 포함) · `/__ui-check/admin/*`, `DevUiCheckPage` 에 채팅 홈 갤러리 목업
- `MainLayout` 본문 건너뛰기 링크(`#main-content`), 마이그레이션으로 투명도가 빠진 장식 요소(`bg-accent/10`, `bg-accent/20`) 복원

**9단계 — 한글 문서(.hwpx) 저장**
- `src/lib/hwpx/hwpx-package.ts` — OWPML(KS X 6101) 패키지 조립. 구조는 nh-travel `docxToHwpx.js`(한글 2024 검증)와 동일: `mimetype`(STORE, 첫 항목)·`version.xml`·`Contents/header.xml|section0.xml|content.hpf`·`settings.xml`·`Preview/PrvText.txt`·`META-INF/*`. A4, 좌우 30mm·상 20mm·하 15mm.
- `src/lib/hwpx/markdown-to-hwpx.ts` — 마크다운(remark-gfm) → 문단. 제목(H1·H2 하단 괘선), 목록(•◦▪·번호·체크박스, 내어쓰기), 인용(좌측 괘선), 코드 블록(굴림체·음영), GFM 표(비례 열 너비·머리행 반복), 구분선, 하단 쪽번호 `- N -`.
- `src/lib/hwpx/save-hwpx.ts`, `src/hooks/useHwpxSave.ts` — 지연 로딩(별도 청크 약 8KB gzip) + 저장 토스트. 부제 기본값 `NH-AX-HUB · YYYY-MM-DD`.
- 저장 버튼 위치: 채팅 답변 더보기 메뉴 「한글(HWPX)로 저장」, 아티팩트 패널, 현장 평가 보고서, AI Planner(PRD+기능 명세), 노트북 통합 보고서, 관리자 주간 트렌드 리포트.
- 검증: `src/lib/__tests__/markdown-to-hwpx.test.ts`(zip 구조·XML 적격성·ID 범위), 한글 2024 COM 자동화로 샘플·브라우저 생성 파일을 열어 쪽수·본문 텍스트·PDF 렌더 확인.
- 한글은 문단 테두리를 문단 뒤 간격 바깥에 그리므로 괘선 제목·표·구분선 뒤에는 빈 간격 문단을 둔다.

**10단계 — 대화 흐름 · 품질**
- 잘린 답변 자동 이어쓰기 2회 → 5회. '이어서 생성' 버튼도 한 번 누르면 다시 잘릴 때 끝까지 이어 쓴다.
- **이어서 물어보기**: `src/lib/chat-followups.ts` 지시문을 ai-chat 실험실 오버레이(append)로 덧붙여, 모델이 본문 끝에
  `<followups>` 블록으로 후속 질문 3개를 쓴다. 스트리밍 중에는 블록을 숨기고 완료 시 마지막 답변 아래 칩
  (`FollowupSuggestions`)으로 보여 준다. 칩을 누르면 그 질문을 바로 보낸다. 별도 요청이 없어 지연·추가 비용이 거의 없다.
  캔버스·Dify·워크플로·이미지 첨부·브라우저 직접 호출 모드에서는 붙이지 않는다.
- jsdom 컴포넌트 테스트(DialogProvider·Overlay·CommandPalette) + 추천 질문 파서 테스트.
- ESLint 경고 69 → 5. effect 안 setState 는 렌더 중 조정·파생값으로 바꾸고, 첫 로드는 기존 관례(`queueMicrotask`)를
  따르며, 채팅 화면의 저장소 부트스트랩 구간은 선언 순서 의존 때문에 사유 주석과 함께 effect 로 유지했다.
  남은 5건: `DxfCanvas` 4건(CAD 편집기, 동작 검증 후 정리), `Dashboard` 대기열 `runDrain` 1건.
- Dify·MCP 점검 보고서: `docs/reports/2026-10-dify-mcp-review.md`.

---

## 6. 페이지 마이그레이션 가이드 (후속)

1. 페이지 루트: `mx-auto flex w-full max-w-[1200px] flex-col gap-[20px] px-[16px] py-[20px] md:px-[24px]`.
2. 헤더: `<PageHeader eyebrow="지식 · 자료실" title="사내 자료실" description="…" icon={IconFolder} actions={…} />`.
3. 색 치환 표

   | 기존 | 신규 |
   |---|---|
   | `bg-[#FAF9F6]` `bg-white` `bg-stone-50` | `bg-bg` / `bg-surface` |
   | `bg-stone-100` `bg-stone-200/..` | `bg-surface-2` / `bg-surface-3` |
   | `border-stone-200` `border-stone-300` | `border-border` / `border-border-strong` |
   | `text-stone-900` `text-stone-600` `text-stone-400` | `text-fg` / `text-fg-muted` / `text-fg-subtle` |
   | `bg-orange-800 text-white` (주 버튼) | `bg-brand text-brand-fg hover:bg-brand-strong` |
   | `bg-orange-100 text-orange-900` (칩) | `bg-brand-soft text-brand` |
   | `text-indigo-600` (링크/강조) | `text-accent` |
   | `bg-red-50 text-red-700` | `bg-danger-soft text-danger` |
   | `dark:` 쌍 | 토큰이 다크를 내포하므로 대부분 삭제 |

4. 빈 상태: `<EmptyState icon title description action />`. 확인/입력: `ConfirmDialog`/`PromptDialog`. 성공/실패 알림: `toast`.
5. 치수: 루트 16px 전환이 끝났으므로 Tailwind 기본 스케일(`h-9`, `gap-3`, `text-sm`)을 그대로 사용한다.
6. 검수: `/__ui-check/shell` 에서 토큰·컴포넌트, 각 페이지는 390/768/1280 폭에서 확인.

### 6.1 1차 기계 마이그레이션 결과와 잔여 작업

- 스크립트(§6 치환표 + `dark:` 팔레트 변형 삭제)를 93개 파일에 적용: 페이지 전부(아래 제외), 채팅·프롬프트·설정·관리자 컴포넌트.
- **2차 적용(5단계)**: `LibraryPage`, AI Sheets 랜딩 컴포넌트(Hero·LandingLayout·ModeAccordion·PromptSection·SheetPreviewPanel·SplitLayout), `UniverOfficePage`, `CadEditorPage`, `KnowledgeGraphHelpDialog` 까지 토큰화.
- **여전히 제외(의도된 독자 테마)**: `components/ai-sheets/SheetsGlobalCanvas·SheetsDesignerRibbon·SheetsRibbon*·SheetsContextMenu`(Google Sheets 형 hex 테마), `KnowledgeGraphPage`·`KnowledgeGraphViewer`(항상 다크인 3D 그래프).
- 잔여: hex(`bg-[#…]`) 색상은 손대지 않았다(Gemini 변형 채팅 UI 등). 이후 수작업으로 `PageHeader`/`EmptyState` 적용과 함께 정리한다.
- 실제 로그인 세션이 필요한 화면(자료실·팀·관리자)은 로컬에서 로그인 후 390/768/1280 폭 육안 검수를 권장한다.

---

## 7. 검증

- `npx tsc -p tsconfig.app.json --noEmit` 통과, `npm run build` 통과 (작업 로그 참조).
- 개발 서버 `/__ui-check/shell` 에서 PC(1280)·태블릿(768)·모바일(390) 레이아웃, 다크 모드, 런처·명령 팔레트·계정 시트 동작 확인.
- Supabase 세션이 필요한 실제 채팅 흐름(스레드 목록·알림 실시간)은 로컬에서 로그인 후 확인 필요.
