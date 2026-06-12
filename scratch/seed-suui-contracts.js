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
const geminiKey = env['GEMINI_API_KEY']

const supabase = createClient(url, serviceRole)

// 768차원 Gemini 임베딩 모델 호출 헬퍼
async function embedTextWithGemini(apiKey, text) {
  const model = "gemini-embedding-2"
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${encodeURIComponent(apiKey)}`
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${model}`,
      content: { parts: [{ text: text.trim().slice(0, 8000) }] },
      outputDimensionality: 768,
    }),
  })

  const body = await res.json()
  if (!res.ok) {
    throw new Error(`Gemini embed HTTP ${res.status}: ${body.error?.message}`)
  }
  return body.embedding.values
}

async function run() {
  console.log("Starting seeding of '수의계약 방침' real Korean text...")

  const contractText = `[농협네트웍스 수의계약 방침 및 기준]
제1조 (목적) 본 방침은 농협네트웍스의 공정하고 효율적인 계약 사무 처리를 위하여 수의계약의 한도, 대상 및 절차를 규정함을 목적으로 한다.
제2조 (수의계약 대상 및 한도) 
1. 일반 경쟁 입찰이 곤란하거나 계약금액이 2,000만원(부가세 별도) 이하인 소액 계약의 경우 수의계약으로 진행할 수 있다.
2. 여성기업지원에 관한 법률 또는 장애인기업활동 촉진법에 따른 기업과 계약을 체결하는 경우 한도는 5,000만원 이하로 할 수 있다.
3. 천재지변, 긴급한 재해복구 또는 국가 안보 등 특별한 사정이 있는 경우 금액 제한 없이 수의계약을 체결할 수 있다.
제3조 (수의계약 절차) 수의계약을 체결하고자 할 때는 2인 이상으로부터 견적서를 받아 비교 검토해야 한다. 다만, 특허품이나 독점 계약 등 비교 대상이 없는 경우는 1인 견적만으로도 수의계약 체결이 가능하다.`

  console.log("Generating Gemini gemini-embedding-2 embedding...")
  const embedding = await embedTextWithGemini(geminiKey, contractText)
  console.log("Embedding generated successfully. Length:", embedding.length)

  console.log("Inserting real Suui Contract Regulation record into company_documents...")
  const { data, error } = await supabase
    .from('company_documents')
    .insert({
      file_name: "농협네트웍스규정집-2026년.pdf",
      content: contractText,
      chunk_index: 9999, // 특별 구분 인덱스
      embedding: embedding
    })
    .select()

  if (error) {
    console.error("Failed to insert record:", error.message)
    process.exit(1)
  }

  console.log("=== Seed Success ===")
  console.log("Successfully seeded 1 high-quality Korean contract regulation record!")
}

run()
