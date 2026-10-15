# NH-AX-HUB

농협네트웍스 임직원 전용 생성형 AI 업무 포털.
멀티 모델 채팅(GPT · Claude · Gemini · DeepSeek · Dify RAG), 사내 자료실/지식 허브, 자동화 스튜디오(플러그인 · MCP · 워크플로우), AI Planner/Designer/Slides/Sheets, 팀 공유 채팅, 현장 AI 평가, CAD 에이전트를 하나의 PWA로 제공합니다.

## 스택

| 영역 | 기술 |
| --- | --- |
| 프런트엔드 | React 19 · TypeScript · Vite 8 · Tailwind CSS v4 (CSS-first) · react-router v7 |
| 백엔드 | Supabase (Postgres · Auth · Edge Functions) · Firebase (FCM 푸시) · Google Cloud Storage |
| 문서 편집 | Univer (`@univerjs/*`) |
| 배포 | Vercel (웹) · `vite-plugin-pwa` (설치형 앱) |

## 시작하기

```bash
npm install
cp .env.example .env   # Supabase / AI 키 입력
npm run dev
```

| 스크립트 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 (http://localhost:5173) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | 프로덕션 빌드 (타입 체크 포함) |
| `npm run deploy:check-env` | 배포 전 환경 변수 점검 |
| `npm run functions:deploy` | Supabase Edge Functions 배포 |

로그인 없이 UI 를 확인하려면 개발 서버에서 `/__ui-check/shell` (앱 셸 · 디자인 토큰) 과 `/__ui-check` (채팅 말풍선 상태) 를 열어 보세요.

## 디렉터리

```
src/
  components/
    common/        공용 프리미티브 (icons · Overlay · ConfirmDialog · PageHeader · EmptyState · Avatar · TokenMeter)
    layout/        앱 셸 (MainLayout · shell/* · NotificationsAndTodos)
    chat/          채팅 UI (ChatArea · ChatInput · ChatMessage …)
    settings/      설정 다이얼로그 패널
    ai-*/          AI 앱 (slides · sheets · designer)
  lib/             클라이언트 유틸 (app-navigation = IA 단일 소스, private-chat-storage …)
  hooks/           useTheme · useDisplayMode · useBackCloseable …
  pages/           라우트 화면 (admin/ 은 관리자 콘솔)
  services/        Supabase / AI / 연동 API 호출
supabase/functions/  Edge Functions (ai-chat · rag-ingest · workflow-execute …)
agent/               CAD 에이전트 (Python, 직원 PC 설치형)
docs/                운영 문서 · 개편 보고서
```

## 디자인 규칙 (요약)

- 색상·간격·타이포는 Tailwind 유틸만 사용하고, 색상은 `src/index.css` 의 디자인 토큰(`bg-surface`, `text-fg`, `bg-brand` …)을 쓴다. hex 직접 지정 금지.
- 크기·간격은 px 임의값(`h-[36px]`, `gap-[8px]`)으로 지정한다. 루트 폰트가 27px 이라 rem 유틸이 팽창한다 — 전환 계획은 [docs/REDESIGN-2026-10.md](docs/REDESIGN-2026-10.md) 참고.
- 인라인 `style`, 새 CSS 클래스/파일 생성 금지. 자세한 규칙은 [CLAUDE.md](CLAUDE.md).

## 문서

- [docs/REDESIGN-2026-10.md](docs/REDESIGN-2026-10.md) — 2026-10 전면 개편: 문제 진단 · 제안 · 셸 설계(PC/모바일/앱) · 마이그레이션 가이드
- [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md) — 배포 절차
- [docs/CAD-AGENT-GUIDE.md](docs/CAD-AGENT-GUIDE.md) — CAD 에이전트 설치·운영
