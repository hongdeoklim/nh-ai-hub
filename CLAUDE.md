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

6. 위 규칙과 충돌하는 기존 코드를 발견하면, 임의로 전면 리팩터링하지 말고
   먼저 사용자에게 알린 뒤 진행한다.

## 작업 일반 규칙
- 기존 파일의 들여쓰기·네이밍·코드 스타일을 그대로 따른다.
- 요청받지 않은 광범위한 리팩터링·포맷팅 변경을 하지 않는다.
- 민감 파일(`.env`, `key.txt`, `nh-ai-hub-*.json`)은 읽거나 출력하지 않는다.
- 변경 후 타입 체크가 필요하면 `npm run build`(tsc 포함) 또는 `npm run lint`로 확인한다.
