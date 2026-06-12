import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import './index.css'
import { isSupabaseConfigured } from './lib/supabase'
import { clientAiEnvStatus } from './services/ai/config'
import {
  assertSupabaseEnvConfigured,
  SupabaseEnvValidationError,
} from './utils/supabaseClient'
import App from './App.tsx'

if (import.meta.env.PROD) {
  try {
    assertSupabaseEnvConfigured()
  } catch (err) {
    const detail =
      err instanceof SupabaseEnvValidationError
        ? err.message
        : '[nh-ai-hub] Supabase 환경 변수 설정을 확인할 수 없습니다.'
    throw new Error(
      `${detail}\n\n` +
        '프로덕션 배포 전 필수 설정:\n' +
        '  1. Vercel Dashboard → Project → Settings → Environment Variables\n' +
        '     · VITE_SUPABASE_URL\n' +
        '     · VITE_SUPABASE_ANON_KEY\n' +
        '  2. 로컬 점검: npm run deploy:check-env\n' +
        '  3. 상세 가이드: 프로젝트 루트 DEPLOY_GUIDE.md',
    )
  }
} else if (!isSupabaseConfigured || !clientAiEnvStatus.configured) {
  console.warn(
    '[nh-ai-hub] Supabase/AI 환경 변수가 없습니다. 로컬 개발 시 .env 파일을 확인하세요. npm run deploy:check-env',
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
