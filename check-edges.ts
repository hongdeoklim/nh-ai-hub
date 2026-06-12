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
  const supabase = createClient(supabaseUrl, envs.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey)
  const { data, error } = await supabase.from('nh_knowledge_edges').select('id').limit(1)
  console.log('Edges check:', error ? error.message : 'Table exists')
}

test().catch(console.error)
