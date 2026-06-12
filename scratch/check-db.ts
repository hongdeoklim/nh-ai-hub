import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// .env 파일 파싱
const envPath = path.resolve(__dirname, '../.env')
const envContent = fs.readFileSync(envPath, 'utf8')
const env: Record<string, string> = {}
envContent.split('\n').forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
  if (match) {
    const key = match[1]
    let value = match[2] || ''
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
})

const supabaseUrl = env['VITE_SUPABASE_URL']
const supabaseAnonKey = env['VITE_SUPABASE_ANON_KEY']
const supabaseServiceKey = env['SUPABASE_SERVICE_ROLE_KEY']

async function run() {
  console.log('Supabase URL:', supabaseUrl)
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase URL or Anon Key is missing in .env')
    return
  }

  // 1. Anon Client로 쿼리 (사용자 권한 RLS 테스트)
  const anonClient = createClient(supabaseUrl, supabaseAnonKey)
  console.log('\n--- Anon Client RLS Test ---')
  
  const { data: kbAnon, error: kbAnonErr } = await anonClient
    .from('knowledge_base')
    .select('id, file_name, category, target_department, created_at')
    .limit(5)
  
  if (kbAnonErr) {
    console.error('knowledge_base (Anon) Error:', kbAnonErr.message)
  } else {
    console.log(`knowledge_base (Anon) count: ${kbAnon?.length}`)
    console.log('Sample rows:', kbAnon)
  }

  const { data: nodesAnon, error: nodesAnonErr } = await anonClient
    .from('nh_knowledge_nodes')
    .select('id, title, node_type, department')
    .limit(5)

  if (nodesAnonErr) {
    console.error('nh_knowledge_nodes (Anon) Error:', nodesAnonErr.message)
  } else {
    console.log(`nh_knowledge_nodes (Anon) count: ${nodesAnon?.length}`)
    console.log('Sample rows:', nodesAnon)
  }

  // 2. Service Role Client로 쿼리 (어드민 전체 데이터 확인)
  if (supabaseServiceKey) {
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    console.log('\n--- Service Role Client (Admin) Test ---')
    
    const { data: kbAdmin, error: kbAdminErr } = await adminClient
      .from('knowledge_base')
      .select('id, file_name, category, target_department, created_at')
      .limit(5)

    if (kbAdminErr) {
      console.error('knowledge_base (Admin) Error:', kbAdminErr.message)
    } else {
      console.log(`knowledge_base (Admin) count: ${kbAdmin?.length}`)
      console.log('Sample rows:', kbAdmin)
    }

    const { data: nodesAdmin, error: nodesAdminErr } = await adminClient
      .from('nh_knowledge_nodes')
      .select('id, title, node_type, department')
      .limit(5)

    if (nodesAdminErr) {
      console.error('nh_knowledge_nodes (Admin) Error:', nodesAdminErr.message)
    } else {
      console.log(`nh_knowledge_nodes (Admin) count: ${nodesAdmin?.length}`)
      console.log('Sample rows:', nodesAdmin)
    }
  } else {
    console.log('\nService Role Key is missing in .env')
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
