/**
 * 배포 전 Vite 클라이언트 환경 변수 점검 (로컬 .env / .env.production)
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

function loadEnvFile(name) {
  const path = resolve(root, name)
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

const merged = {
  ...loadEnvFile('.env'),
  ...loadEnvFile('.env.local'),
  ...loadEnvFile('.env.production'),
  ...loadEnvFile('.env.production.local'),
}

const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']
const missing = required.filter((k) => !merged[k]?.trim())

if (missing.length > 0) {
  console.error('[deploy:check-env] 누락된 변수:', missing.join(', '))
  console.error('→ .env.production 에 Supabase URL/Anon Key 를 설정하세요.')
  process.exit(1)
}

console.log('[deploy:check-env] 필수 Vite 변수 OK')
console.log('  VITE_SUPABASE_URL =', merged.VITE_SUPABASE_URL)
console.log(
  '  VITE_AI_TRANSPORT =',
  merged.VITE_AI_TRANSPORT?.trim() || 'edge (기본)',
)
