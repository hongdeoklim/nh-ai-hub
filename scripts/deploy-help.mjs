/**
 * NH AI Inside Hub — 프로덕션 Supabase 배포 가이드
 *
 * [사전 준비 — 1회]
 * 1. Supabase CLI 설치: npm i -g supabase  (또는 npx supabase)
 * 2. supabase login
 * 3. npm run supabase:link
 *    → 대화형으로 프로덕션 project-ref 를 연결합니다.
 *    → link 없이 배포하려면 각 명령에 --project-ref <YOUR_PROJECT_REF> 를 붙이세요.
 *
 * [프론트엔드 .env.production — Vite]
 * VITE_SUPABASE_URL=https://<ref>.supabase.co
 * VITE_SUPABASE_ANON_KEY=<anon-key>
 * VITE_AI_TRANSPORT=edge   (기본값 edge — 브라우저 direct 라우팅은 프로덕션 비권장)
 *
 * [Edge Function Secrets — Supabase Dashboard 또는 CLI]
 * OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, ANTHROPIC_API_KEY (사용 모델에 맞게)
 * SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL
 * Google Drive / OAuth 관련 시크릿 (이미지·워크스페이스 연동 시)
 *
 * [배포 순서 — 권장]
 * 1. npm run db:deploy        → 마이그레이션 + RPC (match_work_cases 등) 반영
 * 2. npm run edge:deploy      → ai-chat (가드레일·토큰·RAG·Drive 업로드)
 * 3. npm run build            → dist/ 정적 빌드
 * 4. dist/ 를 호스팅(Netlify, Vercel, S3+CDN 등)에 업로드
 *
 * [edge:deploy 수동 project-ref 예시]
 * npx supabase functions deploy ai-chat --project-ref abcdefghijklmnop
 *
 * [검증]
 * npm run deploy:check-env    → 로컬 .env 필수 키 점검
 * npm run preview             → 빌드 결과 로컬 확인
 */

console.log(`
╔══════════════════════════════════════════════════════════════╗
║  NH AI Hub — 프로덕션 Supabase 배포 체크리스트               ║
╠══════════════════════════════════════════════════════════════╣
║  1) supabase login && npm run supabase:link                  ║
║  2) npm run deploy:check-env                                 ║
║  3) npm run db:deploy                                        ║
║  4) npm run edge:deploy                                      ║
║  5) npm run build && npm run preview                         ║
╚══════════════════════════════════════════════════════════════╝

자세한 설명: scripts/deploy-help.mjs 파일 상단 주석을 참고하세요.
`)
