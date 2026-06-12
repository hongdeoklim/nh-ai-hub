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
const supabase = createClient(envs.VITE_SUPABASE_URL, envs.SUPABASE_SERVICE_ROLE_KEY)

async function test() {
  const dummyEmbedding = new Array(1536).fill(0)
  const { error } = await supabase.from('nh_knowledge_nodes').insert({
    title: '테스트',
    slug: 'concept-test-1234',
    node_type: 'concept',
    content: '핵심 개념: 테스트',
    embedding: JSON.stringify(dummyEmbedding), // let's try JSON stringify
    visibility: 'public',
    chunk_index: -1
  })
  console.log('Error with JSON:', error)

  const { error: err2 } = await supabase.from('nh_knowledge_nodes').insert({
    title: '테스트2',
    slug: 'concept-test-5678',
    node_type: 'concept',
    content: '핵심 개념: 테스트2',
    embedding: `[${dummyEmbedding.join(',')}]`,
    visibility: 'public',
    chunk_index: -1
  })
  console.log('Error with bracket string:', err2)
}
test()
