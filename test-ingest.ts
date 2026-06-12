import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envContent = fs.readFileSync('.env', 'utf-8')
const envs: Record<string, string> = {}
for (const line of envContent.split('\n')) {
  if (line.includes('=')) {
    const [key, ...vals] = line.split('=')
    let val = vals.join('=').trim()
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1)
    envs[key.trim()] = val
  }
}

const supabaseUrl = envs.VITE_SUPABASE_URL
const supabaseAnonKey = envs.VITE_SUPABASE_ANON_KEY

async function test() {
  const loginRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: envs.VITE_DEV_LOGIN_EMAIL, password: envs.VITE_DEV_LOGIN_PASSWORD })
  })
  const { access_token } = await loginRes.json()

  const textData = `(PDF 「농협네트웍스규정집-2026년.pdf」 — 대용량 파일 본문 추출 제한(크기: 3.5MB). 파일명·메타 기반 인덱싱.)`
  
  const res = await fetch(`${supabaseUrl}/functions/v1/knowledge-ingest`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'UPDATE',
      title: '농협네트웍스규정집-2026년.pdf',
      content: textData,
      source_drive_id: '1GkFGoX0oZ83XJ6QIamhrQf3GXgObnCM5',
      source_file_name: '농협네트웍스규정집-2026년.pdf',
      visibility: 'public',
      department: null,
      metadata: { source: 'google_drive' }
    })
  })
  
  console.log('Status:', res.status)
  console.log('Response:', await res.text())
}

test().catch(console.error)
