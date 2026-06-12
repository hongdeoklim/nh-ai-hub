# NH AI Hub — 클라우드 배포 가이드 (Vercel + Supabase)

초보자도 따라 할 수 있는 **프로덕션 배포 체크리스트**입니다.  
각 항목을 순서대로 진행하며 `[ ]` 를 `[x]` 로 바꿔가세요.

> **중요:** API 키·OAuth 시크릿은 **절대** Vite 프론트(`VITE_*`) 환경 변수나 Git에 넣지 마세요.  
> Supabase Edge Function Secrets(`supabase secrets set`)에만 저장합니다.

---

## 권장 배포 순서 (요약)

1. DB 마이그레이션 (`db push`)
2. Edge Function Secrets 설정
3. Edge Functions 배포
4. Vercel 환경 변수 설정 + Vercel 배포
5. Google / Microsoft OAuth 리다이렉트 URI 갱신
6. Supabase Auth URL 설정
7. 스모크 테스트

---

## 사전 준비 (1회)

- [ ] **Node.js 20+** 및 **npm** 설치
- [ ] [Supabase CLI](https://supabase.com/docs/guides/cli) 사용 가능  
  ```bash
  npm i -g supabase
  # 또는 프로젝트에서 npx supabase 사용
  ```
- [ ] Supabase 프로젝트 생성 (Dashboard)
- [ ] [Vercel](https://vercel.com) 계정 및 Git 저장소 연결
- [ ] Google Cloud Console / Azure App Registration (OAuth 연동 시)

```bash
# 프로젝트 루트에서
cd c:\Users\HP\Desktop\nh-ai-hub

# Supabase 로그인 (브라우저 OAuth)
npx supabase login

# 로컬 프로젝트 ↔ Supabase 프로젝트 연결 (대화형)
npm run supabase:link
# 또는: npx supabase link --project-ref YOUR_PROJECT_REF
```

---

## 1. Supabase Edge Functions 배포

`supabase/functions/` 아래 **모든** 함수를 배포합니다.

| 함수 이름 | 용도 (요약) |
|-----------|-------------|
| `ai-chat` | 메인 AI 채팅 (가드레일·RAG·Drive) |
| `gdrive-service` | 사내 공유 Google Drive 목록·다운로드 |
| `deep-research` | 심층 리서치 |
| `google-agent` | Google 에이전트 |
| `daily-dlp-masking` | DLP 마스킹 (Cron) |
| `process-document` | 문서 처리 |
| `admin-user-action` | 관리자 사용자 액션 |
| `integration-google-start` | Google OAuth 시작 |
| `integration-google-exchange` | Google OAuth 토큰 교환 |
| `integration-google-status` | Google 연동 상태 |
| `integration-google-disconnect` | Google 연동 해제 |
| `integration-microsoft-start` | Microsoft OAuth 시작 |
| `integration-microsoft-exchange` | Microsoft OAuth 토큰 교환 |
| `integration-microsoft-status` | Microsoft 연동 상태 |
| `integration-microsoft-disconnect` | Microsoft 연동 해제 |
| `google-workspace-api` | Google Workspace API 프록시 |
| `microsoft-graph-api` | Microsoft Graph API 프록시 |
| `user-document-upload` | 사용자 문서 업로드 |
| `generate-weekly-report` | 주간 리포트 생성 (Cron) |

- [ ] **1-1.** `supabase login` 완료
- [ ] **1-2.** `npm run supabase:link` 로 프로젝트 연결
- [ ] **1-3.** 아래 명령으로 **전체 함수 일괄 배포**

```bash
npx supabase functions deploy admin-user-action ai-chat daily-dlp-masking deep-research gdrive-service generate-weekly-report google-agent google-workspace-api integration-google-disconnect integration-google-exchange integration-google-start integration-google-status integration-microsoft-disconnect integration-microsoft-exchange integration-microsoft-start integration-microsoft-status microsoft-graph-api process-document user-document-upload
```

> **project-ref 를 명시해야 할 때** (link 없이 배포):
> ```bash
> npx supabase functions deploy ai-chat --project-ref YOUR_PROJECT_REF
> ```

- [ ] **1-4.** Supabase Dashboard → **Edge Functions** 에서 19개 함수가 `ACTIVE` 인지 확인

---

## 2. Supabase Secrets (Edge Function 시크릿)

아래 값은 **Supabase CLI** 또는 Dashboard → **Project Settings → Edge Functions → Secrets** 에 설정합니다.

> ⚠️ **경고:** `OPENAI_API_KEY`, `GDRIVE_CLIENT_SECRET` 등은 **Vercel/Vite `VITE_*` 변수에 넣으면 안 됩니다.**  
> 브라우저 번들에 노출됩니다.

### 2-1. AI / 가드레일

| Secret | 설명 |
|--------|------|
| `OPENAI_API_KEY` | OpenAI API |
| `ANTHROPIC_API_KEY` | Anthropic API |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google Gemini |
| `GEMINI_API_KEY` | `GOOGLE_GENERATIVE_AI_API_KEY` 별칭 (deep-research) |
| `NH_AI_GUARDRAIL_PROVIDER` | `openai` 또는 `google` (기본 `openai`) |

### 2-2. Google Drive (현장 이미지 등)

| Secret | 설명 |
|--------|------|
| `GDRIVE_CLIENT_ID` | OAuth 클라이언트 ID |
| `GDRIVE_CLIENT_SECRET` | OAuth 클라이언트 Secret |
| `GDRIVE_REFRESH_TOKEN` | Drive 스코프 리프레시 토큰 |
| `GDRIVE_ROOT_FOLDER_ID` | 저장 루트 폴더 ID |

### 2-3. Google 사용자 연동 (Drive · Sheets · Calendar)

| Secret | 설명 |
|--------|------|
| `GOOGLE_OAUTH_CLIENT_ID` | 미설정 시 `GDRIVE_CLIENT_ID` 재사용 가능 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | 미설정 시 `GDRIVE_CLIENT_SECRET` 재사용 가능 |
| `GOOGLE_OAUTH_REDIRECT_URI` | **프로덕션 URL과 문자열 완전 일치** (아래 4절) |
| `INTEGRATION_OAUTH_STATE_SECRET` | OAuth state 서명 (32바이트+ 랜덤) |
| `INTEGRATION_CREDENTIALS_SECRET` | 리프레시 토큰 AES-GCM 암호화 키 |

### 2-4. Microsoft 사용자 연동

| Secret | 설명 |
|--------|------|
| `MICROSOFT_OAUTH_CLIENT_ID` | Azure App Registration Client ID |
| `MICROSOFT_OAUTH_CLIENT_SECRET` | Client Secret |
| `MICROSOFT_OAUTH_REDIRECT_URI` | **프로덕션 URL과 문자열 완전 일치** |
| `MICROSOFT_OAUTH_TENANT` | `common` 또는 테넌트 ID |

### 2-5. Supabase / Cron

| Secret | 설명 |
|--------|------|
| `SUPABASE_SERVICE_ROLE_KEY` | Edge 런타임에 자동 주입되기도 하나, 문서화용으로 Dashboard에서 확인 |
| `CRON_SECRET` | `daily-dlp-masking`, `generate-weekly-report` 의 `x-cron-secret` 헤더 검증 (선택·권장) |

- [ ] **2-1.** `.env.example` 을 참고해 값 준비 (로컬 `.env`는 Git 제외)
- [ ] **2-2.** 아래 예시처럼 **한 번에 설정** (값은 본인 것으로 교체)

```bash
npx supabase secrets set \
  ANTHROPIC_API_KEY="sk-ant-..." \
  OPENAI_API_KEY="sk-..." \
  GOOGLE_GENERATIVE_AI_API_KEY="..." \
  GEMINI_API_KEY="..." \
  NH_AI_GUARDRAIL_PROVIDER="openai" \
  GDRIVE_CLIENT_ID="....apps.googleusercontent.com" \
  GDRIVE_CLIENT_SECRET="..." \
  GDRIVE_REFRESH_TOKEN="..." \
  GDRIVE_ROOT_FOLDER_ID="..." \
  GOOGLE_OAUTH_CLIENT_ID="....apps.googleusercontent.com" \
  GOOGLE_OAUTH_CLIENT_SECRET="..." \
  GOOGLE_OAUTH_REDIRECT_URI="https://YOUR-VERCEL-DOMAIN.vercel.app/oauth/google-integration" \
  MICROSOFT_OAUTH_CLIENT_ID="..." \
  MICROSOFT_OAUTH_CLIENT_SECRET="..." \
  MICROSOFT_OAUTH_REDIRECT_URI="https://YOUR-VERCEL-DOMAIN.vercel.app/oauth/microsoft-integration" \
  MICROSOFT_OAUTH_TENANT="common" \
  INTEGRATION_OAUTH_STATE_SECRET="your-long-random-string-32bytes-min" \
  INTEGRATION_CREDENTIALS_SECRET="another-long-random-string-32bytes-min" \
  CRON_SECRET="your-cron-secret-for-scheduled-jobs"
```

> Windows PowerShell에서는 `\` 대신 한 줄로 입력하거나 백틱 `` ` `` 으로 줄바꿈하세요.

- [ ] **2-3.** Dashboard → Edge Functions → Secrets 에 반영됐는지 확인

---

## 3. Vercel 환경 변수 (프론트엔드)

Vite 빌드 시 **번들에 포함**되는 변수만 `VITE_` 접두사로 설정합니다.

### 필수

| 변수 | 예시 |
|------|------|
| `VITE_SUPABASE_URL` | `https://abcdefgh.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → `anon` `public` |

### 권장 / 선택

| 변수 | 설명 |
|------|------|
| `VITE_AI_TRANSPORT` | `edge` (기본·권장). `direct`는 프로덕션 비권장 |
| `VITE_GOOGLE_OAUTH_REDIRECT_URI` | 미설정 시 앱이 `origin/oauth/google-integration` 자동 사용 |
| `VITE_MICROSOFT_OAUTH_REDIRECT_URI` | 미설정 시 `origin/oauth/microsoft-integration` 자동 사용 |

- [ ] **3-1.** 로컬에서 배포 전 점검

```bash
# .env.production 에 VITE_SUPABASE_* 가 있는지 확인
npm run deploy:check-env
```

- [ ] **3-2.** Vercel Dashboard 에 변수 추가

1. [vercel.com](https://vercel.com) → 프로젝트 선택  
2. **Settings** → **Environment Variables**  
3. **Add New** 클릭  
4. Name: `VITE_SUPABASE_URL`, Value: `https://YOUR_REF.supabase.co`  
5. Environment: **Production** (필요 시 Preview/Development 도)  
6. **Save**  
7. 동일하게 `VITE_SUPABASE_ANON_KEY` 추가  
8. (권장) `VITE_AI_TRANSPORT` = `edge`  
9. **Deployments** → 최신 배포 → **Redeploy** (환경 변수 변경 후 재배포 필수)

- [ ] **3-3.** `vercel.json` SPA rewrite 확인 (프로젝트 루트)

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

React Router 경로(`/chat`, `/settings` 등)를 새로고침해도 404가 나지 않습니다.

- [ ] **3-4.** Vercel 배포

```bash
npm run build
# Git push 시 Vercel 자동 배포, 또는:
npx vercel --prod
```

---

## 4. Google & Microsoft OAuth 리다이렉트 URI

OAuth 리다이렉트 URI는 **GCP/Azure · Supabase Secrets · (선택) Vite** 세 곳에서 **문자열이 완전히 같아야** 합니다.  
대소문자, `http` vs `https`, **끝 슬래시(`/`)** 까지 일치해야 합니다.

### 로컬 개발

```
http://localhost:5173/oauth/google-integration
http://localhost:5173/oauth/microsoft-integration
```

### 프로덕션 (Vercel)

```
https://YOUR-VERCEL-DOMAIN.vercel.app/oauth/google-integration
https://YOUR-VERCEL-DOMAIN.vercel.app/oauth/microsoft-integration
```

커스텀 도메인 사용 시 해당 도메인으로 교체하세요.

### Google Cloud Console

- [ ] **4-1.** [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**
- [ ] **4-2.** OAuth 2.0 Client ID 선택 (또는 Web application 생성)
- [ ] **4-3.** **Authorized redirect URIs** 에 로컬 + 프로덕션 URI **모두** 추가
- [ ] **4-4.** Supabase secrets 업데이트:

```bash
npx supabase secrets set GOOGLE_OAUTH_REDIRECT_URI="https://YOUR-VERCEL-DOMAIN.vercel.app/oauth/google-integration"
```

### Azure App Registration (Microsoft)

- [ ] **4-5.** [Azure Portal](https://portal.azure.com/) → **App registrations** → 앱 선택
- [ ] **4-6.** **Authentication** → **Platform configurations** → **Web**
- [ ] **4-7.** Redirect URIs 에 로컬 + 프로덕션 URI 추가 → **Save**
- [ ] **4-8.** Supabase secrets 업데이트:

```bash
npx supabase secrets set MICROSOFT_OAUTH_REDIRECT_URI="https://YOUR-VERCEL-DOMAIN.vercel.app/oauth/microsoft-integration"
```

---

## 5. Supabase Auth URL Configuration

Supabase 로그인(SSO) 사용 시 Site URL / Redirect URLs 불일치는 **로그인 루프·리다이렉트 실패**를 일으킵니다.

- [ ] **5-1.** Supabase Dashboard → **Authentication** → **URL Configuration**
- [ ] **5-2.** **Site URL** → 프로덕션 Vercel 도메인  
  예: `https://YOUR-VERCEL-DOMAIN.vercel.app`
- [ ] **5-3.** **Redirect URLs** 에 추가:
  - `https://YOUR-VERCEL-DOMAIN.vercel.app/**`
  - `http://localhost:5173/**` (로컬 개발 유지)
- [ ] **5-4.** **Save** 후 프로덕션에서 로그인 → 리다이렉트 동작 확인

**왜 중요한가?**  
Auth가 허용 목록에 없는 URL로 리다이렉트하면 세션이 저장되지 않거나, 로그인 후 다시 로그인 화면으로 돌아가는 **루프**가 발생할 수 있습니다.

---

## 6. DB 마이그레이션 (배포 1단계)

Functions 배포 **전** 또는 **직후** 스키마를 맞춥니다.

```bash
npm run db:deploy
# 동일: npx supabase db push
```

- [ ] 마이그레이션 오류 없이 완료
- [ ] Dashboard → **Table Editor** 에 `chat_sessions`, `profiles` 등 예상 테이블 존재

---

## 7. 스모크 테스트 체크리스트

배포 후 프로덕션 URL에서 확인:

- [ ] 홈/대시보드 로드 (새로고침 시 404 없음)
- [ ] Supabase 로그인 / 로그아웃
- [ ] AI 채팅 1회 전송 (`ai-chat` Edge Function)
- [ ] (해당 시) Google 연동 시작 → OAuth → `/oauth/google-integration` 콜백
- [ ] (해당 시) Microsoft 연동 동일
- [ ] 브라우저 DevTools → Network: `*.supabase.co` 요청 200/401(비로그인) 정상
- [ ] API 키가 번들에 없는지: DevTools → Sources 에서 `sk-`, `ANTHROPIC` 검색 → **없어야 함**

---

## 참고 스크립트

| 명령 | 설명 |
|------|------|
| `npm run deploy:check-env` | 로컬 `.env` / `.env.production` 필수 `VITE_*` 점검 |
| `npm run deploy:help` | 터미널 배포 요약 출력 |
| `npm run db:deploy` | Supabase DB 마이그레이션 |
| `npm run edge:deploy` | `ai-chat` 만 배포 (전체는 1절 명령 사용) |
| `npm run build` | TypeScript + Vite 프로덕션 빌드 |
| `npm run preview` | `dist/` 로컬 미리보기 |

환경 변수 전체 목록: 프로젝트 루트 **`.env.example`**

---

## 문제 해결

| 증상 | 확인 |
|------|------|
| 프로덕션 빈 화면 + 콘솔 Supabase 오류 | Vercel `VITE_SUPABASE_*` 설정 후 **Redeploy** |
| `/settings` 새로고침 404 | `vercel.json` rewrite 배포 여부 |
| Google OAuth `redirect_uri_mismatch` | GCP Redirect URI ↔ `GOOGLE_OAUTH_REDIRECT_URI` 문자열 일치 |
| Microsoft OAuth 오류 | Azure Redirect URI ↔ `MICROSOFT_OAUTH_REDIRECT_URI` 일치 |
| Edge Function 500 | Dashboard → Edge Functions → Logs, Secrets 누락 여부 |
| 로그인 후 다시 로그인 화면 | Supabase Auth **Site URL** / **Redirect URLs** |

---

## 전체 배포 한 줄 요약

```bash
npm run supabase:link && npm run db:deploy && npx supabase secrets set ... && npx supabase functions deploy admin-user-action ai-chat ... && npm run deploy:check-env && npm run build
```

상세 단계는 위 체크리스트를 따르세요. **`DEPLOY_GUIDE.md`** 와 **`scripts/deploy-help.mjs`** 를 함께 참고하면 됩니다.
