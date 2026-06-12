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
// We'll use service key if available

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

async function cleanupOrphaned() {
  console.log('Fetching all knowledge_base URLs...')
  const { data: kbData, error: kbErr } = await supabase.from('knowledge_base').select('id, file_url')
  if (kbErr) {
    console.error('Error fetching knowledge_base:', kbErr)
    return
  }
  const validUrls = new Set(kbData.map(r => r.file_url).filter(Boolean))
  const validIds = new Set(kbData.map(r => r.id))
  console.log(`Found ${validUrls.size} valid knowledge_base URLs.`)

  console.log('Fetching all nh_knowledge_nodes...')
  const { data: nodes, error: nodeErr } = await supabase.from('nh_knowledge_nodes').select('id, source_url')
  if (nodeErr) {
    console.error('Error fetching nodes:', nodeErr)
    return
  }
  
  // Library uploads have source_url pointing to supabase storage.
  const nodesToDelete = nodes.filter(n => 
    n.source_url && 
    n.source_url.includes('/storage/v1/object/public/knowledge-documents/') && 
    !validUrls.has(n.source_url)
  )
  console.log(`Found ${nodesToDelete.length} orphaned nodes to delete based on URL.`)

  if (nodesToDelete.length > 0) {
    const idsToDelete = nodesToDelete.map(n => n.id)
    const { error: delErr } = await supabase.from('nh_knowledge_nodes').delete().in('id', idsToDelete)
    if (delErr) {
      console.error('Error deleting nodes:', delErr)
    } else {
      console.log('Successfully deleted orphaned nodes.')
    }
  }

  // Also document_chunks
  console.log('Fetching all document_chunks...')
  const { data: chunks, error: chunkErr } = await supabase.from('document_chunks').select('id, document_id, source_kind').eq('source_kind', 'knowledge_base')
  if (!chunkErr && chunks) {
    const chunksToDelete = chunks.filter(c => !validIds.has(c.document_id))
    console.log(`Found ${chunksToDelete.length} orphaned document_chunks to delete.`)
    if (chunksToDelete.length > 0) {
      const chunkIdsToDelete = chunksToDelete.map(c => c.id)
      const { error: delChunkErr } = await supabase.from('document_chunks').delete().in('id', chunkIdsToDelete)
      if (delChunkErr) console.error('Error deleting chunks:', delChunkErr)
      else console.log('Successfully deleted orphaned document_chunks.')
    }
  }
}

cleanupOrphaned().catch(console.error)
