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
const supabaseServiceRoleKey = envs.SUPABASE_SERVICE_ROLE_KEY || envs.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

async function check() {
  const { error } = await supabase.from('nh_knowledge_nodes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('Deleted all nodes:', error)
  const { data: nodes } = await supabase.from('nh_knowledge_nodes').select('id')
  console.log('Remaining nodes:', nodes?.length)
}

check().catch(console.error)
