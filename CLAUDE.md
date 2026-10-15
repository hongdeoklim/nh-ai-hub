# nh-ai-hub — Claude Code 작업 규칙

## 프로젝트 스택
- **React 19 + TypeScript + Vite 8** (SPA, `react-router-dom` v7)
- **Tailwind CSS v4** — CSS-first 방식. `tailwind.config.js`는 **없음**.
  설정은 `src/index.css`의 `@import "tailwindcss";` + `@theme { ... }` 블록과
  `:root` CSS 변수(`--accent`, `--text`, `--bg` 등)로 관리됨.
- 백엔드: Supabase (edge functions) + Firebase
- 문서/시트 편집: Univer (`@univerjs/*`)

## 스타일링 규칙 (최우선 — 반드시 준수)

1. **기존 Tailwind 유틸리티 클래스를 최우선으로 사용한다.**
   레이아웃·간격·색상·타이포그래피는 `className`에 Tailwind 유틸리티
   (`flex`, `gap-4`, `px-3`, `text-sm`, `rounded-lg`, `md:flex-row` 등)로만 표현한다.

2. **인라인 `style={{ ... }}` 사용 금지.**
   동적 값(런타임 계산된 width/transform 등) 때문에 불가피한 경우에만 사용하고,
   그 외 정적 스타일은 절대 인라인으로 작성하지 않는다.

3. **새로운 CSS 클래스나 별도 `.css` 파일을 만들지 않는다.**
   기존 `src/index.css`, `src/App.css`, 컴포넌트별 기존 `.css`에 클래스를
   추가하는 대신, Tailwind 유틸리티 조합으로 해결한다.

4. **색상/폰트는 디자인 토큰을 따른다.**
   하드코딩된 hex 값 대신 `src/index.css`에 정의된 CSS 변수
   (`var(--accent)`, `var(--text)`, `var(--border)` 등)를 사용하거나,
   해당 토큰과 매핑되는 Tailwind 유틸리티를 사용한다.

5. **반응형은 Tailwind 브레이크포인트로만 처리한다.**
   모바일 대응은 `sm:` / `md:` / `lg:` 접두사를 사용하고,
   별도 미디어쿼리 CSS를 새로 작성하지 않는다.

6. **루트 폰트는 16px(Tailwind 표준 스케일)이다. (2026-10 전환 완료)**
   `h-8`, `gap-3`, `text-sm` 같은 기본 유틸이 설계값 그대로 렌더되므로 그대로 사용한다.
   `text-[13px]!` 처럼 `!`(important) 접미사로 폰트 보정 규칙을 우회하던 관행은 폐지됐다 —
   `.app-shell`/`.admin-shell` 의 역보정 CSS 는 모두 제거됐고, 기본 타이포는 `@layer base` 에만 둔다.
   모바일 입력창(input/textarea)은 iOS 자동 확대를 피하기 위해 16px 이상(`text-base`)으로 지정한다.

8. **색상은 시맨틱 토큰 유틸로 쓴다.** `bg-bg` `bg-surface` `bg-surface-2` `border-border`
   `text-fg` `text-fg-muted` `text-fg-subtle` `bg-brand` `text-brand` `bg-brand-soft` `text-accent`
   `text-success|warning|danger` (+ `-soft` 배경). 토큰이 다크 모드를 내포하므로 `dark:` 변형을
   덧붙이지 않는다. 치환표는 `docs/REDESIGN-2026-10.md` §6.

7. 위 규칙과 충돌하는 기존 코드를 발견하면, 임의로 전면 리팩터링하지 말고
   먼저 사용자에게 알린 뒤 진행한다.

## 작업 일반 규칙
- 기존 파일의 들여쓰기·네이밍·코드 스타일을 그대로 따른다.
- 요청받지 않은 광범위한 리팩터링·포맷팅 변경을 하지 않는다.
- 민감 파일(`.env`, `key.txt`, `nh-ai-hub-*.json`)은 읽거나 출력하지 않는다.
- 변경 후 타입 체크가 필요하면 `npm run build`(tsc 포함) 또는 `npm run lint`로 확인한다.
