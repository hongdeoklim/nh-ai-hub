import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envFile = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8')

const env = {}
envFile.split('\n').forEach((line) => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
  if (m) {
    let v = m[2] || ''
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1)
    env[m[1]] = v.trim()
  }
})

const url = env['VITE_SUPABASE_URL']
const serviceRole = env['SUPABASE_SERVICE_ROLE_KEY']

const supabase = createClient(url, serviceRole)

async function test() {
  console.log("Querying records for '농협네트웍스규정집-2026년.pdf'...")
  const { data, error } = await supabase
    .from('company_documents')
    .select('id, file_name, chunk_index, content')
    .ilike('file_name', '%농협네트웍스규정집%')
    .limit(10)

  if (error) {
    console.error("Error querying database:", error.message)
    process.exit(1)
  }

  console.log(`Found ${data.length} records.`)
  data.forEach((row, i) => {
    console.log(`[${i + 1}] File: ${row.file_name} (Chunk #${row.chunk_index})`)
    console.log(`    Content Length: ${row.content ? row.content.length : 0}`)
    console.log(`    Content Preview: ${JSON.stringify(row.content ? row.content.slice(0, 150) : "")}`)
  })
}

test()
