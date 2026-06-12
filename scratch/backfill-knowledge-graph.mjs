/**
 * [일회성] 기존 자료실(knowledge_base) 문서를 재처리하여 지식 그래프(nh_knowledge_nodes)에 적재.
 *
 * 전제: process-document / knowledge-ingest 엣지 함수가 재배포되어 있고,
 *       OPENAI_API_KEY · GDRIVE_* 시크릿이 설정되어 있어야 한다.
 *
 * 실행: node scratch/backfill-knowledge-graph.mjs
 *
 * 인증: .env 의 VITE_DEV_LOGIN_EMAIL / VITE_DEV_LOGIN_PASSWORD 로 로그인해 JWT 를 얻는다.
 *       (process-document 는 knowledge_base 소스에 대해선 소유자 검사를 하지 않으므로
 *        인증된 사용자면 누구나 재처리 트리거 가능)
 */
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import * as path from 'path'
import { PDFParse } from 'pdf-parse'

/** pdf-parse 래퍼: Buffer → { text, numpages }
 *  getText() 반환 구조: { pages:[{text, num}], text, total }
 *  pages 배열의 각 text 를 이어붙여 전체 텍스트를 구성한다.
 */
async function parsePdfBuffer(buf) {
  const parser = new PDFParse({ data: new Uint8Array(buf) })
  await parser.load()
  const result = await parser.getText()
  const numpages = result.total ?? (result.pages?.length ?? 0)
  const text = (result.pages ?? [])
    .map((p) => (p.text ?? '').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim()
  return { text, numpages }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const env = {}
fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n').forEach((line) => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
  if (m) { let v = m[2] || ''; if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); env[m[1]] = v }
})

const url = env['VITE_SUPABASE_URL']
const anon = env['VITE_SUPABASE_ANON_KEY']
const service = env['SUPABASE_SERVICE_ROLE_KEY']
const devEmail = env['VITE_DEV_LOGIN_EMAIL']
const devPassword = env['VITE_DEV_LOGIN_PASSWORD']

if (!url || !anon || !service) { console.error('VITE_SUPABASE_URL/ANON/SERVICE 키 누락'); process.exit(1) }
if (!devEmail || !devPassword) {
  console.error('VITE_DEV_LOGIN_EMAIL / VITE_DEV_LOGIN_PASSWORD 가 .env 에 필요합니다 (JWT 발급용).')
  process.exit(1)
}

// 1) 로그인해서 사용자 JWT 확보
const authClient = createClient(url, anon)
const { data: signIn, error: signErr } = await authClient.auth.signInWithPassword({
  email: devEmail.trim(),
  password: devPassword,
})
if (signErr || !signIn.session) {
  console.error('로그인 실패:', signErr?.message)
  process.exit(1)
}
const jwt = signIn.session.access_token
console.log('로그인 성공, JWT 확보됨')

// 2) 자료실 문서 목록 — file_url 포함 (service role)
const admin = createClient(url, service)
const { data: rows, error: rowsErr } = await admin
  .from('knowledge_base')
  .select('id, file_name, file_url')
  .is('deleted_at', null)
if (rowsErr) { console.error('knowledge_base 조회 실패:', rowsErr.message); process.exit(1) }

console.log(`재처리 대상 ${rows.length}건\n`)

// .env 에 GDRIVE_* 시크릿이 있으면 Drive OAuth 토큰을 얻어 PDF 를 직접 다운로드한다.
const gClientId = env['GDRIVE_CLIENT_ID'] || env['GOOGLE_OAUTH_CLIENT_ID'] || ''
const gClientSecret = env['GDRIVE_CLIENT_SECRET'] || env['GOOGLE_OAUTH_CLIENT_SECRET'] || ''
const gRefreshToken = env['GDRIVE_REFRESH_TOKEN'] || env['GOOGLE_OAUTH_REFRESH_TOKEN'] || ''

/** Google OAuth refresh_token → access_token */
async function getGdriveAccessToken() {
  if (!gClientId || !gClientSecret || !gRefreshToken) return null
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: gRefreshToken,
      client_id: gClientId,
      client_secret: gClientSecret,
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.access_token ?? null
}

/** Drive URL 에서 fileId 추출 */
function extractDriveFileId(u) {
  if (!u) return null
  const m1 = u.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (m1?.[1]) return m1[1]
  const m2 = u.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (m2?.[1]) return m2[1]
  const m3 = u.match(/\/d\/([a-zA-Z0-9_-]+)/)
  if (m3?.[1]) return m3[1]
  return null
}

/** URL(스토리지 or Drive) → PDF Buffer 취득 */
async function downloadPdfBuffer(fileUrl, accessToken) {
  // (a) Supabase Storage Signed URL / Public URL
  const BUCKET = 'knowledge-documents'
  if (fileUrl.includes(BUCKET)) {
    const res = await fetch(fileUrl)
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    console.warn(`  스토리지 다운로드 실패 (${res.status})`)
  }

  // (b) Google Drive alt=media
  const driveId = extractDriveFileId(fileUrl)
  if (driveId) {
    if (!accessToken) {
      console.warn('  Drive URL 이지만 GDRIVE_* 시크릿이 없어 다운로드 불가')
      return null
    }
    const mediaUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}?alt=media&supportsAllDrives=true`
    const res = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    const errText = await res.text()
    console.warn(`  Drive 다운로드 실패 (${res.status}): ${errText.slice(0, 150)}`)
  }

  return null
}

// Drive 토큰 1회 취득 (모든 문서가 공유 드라이브이므로 반복 불필요)
const driveToken = await getGdriveAccessToken()
if (driveToken) {
  console.log('Google Drive OAuth 토큰 취득 성공\n')
} else {
  console.warn('Google Drive OAuth 토큰 없음 — Drive PDF 다운로드 불가. .env 에 GDRIVE_* 시크릿을 확인하세요.\n')
}

// knowledge-ingest 에 doc_id/chunk_index 를 추가한 버전이 배포되어 있어야 한다.
// 로컬에서 PDF 를 파싱해 텍스트만 추출 → knowledge-ingest 로 전달 (임베딩은 서버에서 처리)
const MAX_TEXT_CHARS = 150_000  // 엣지 함수 메모리 보호 상한 (약 83청크)

for (const row of rows) {
  process.stdout.write(`- ${row.file_name} ... `)

  // 기존 노드 정리: doc_id 기준으로 기존 노드를 모두 삭제해 unique 충돌 방지
  const adminClient2 = createClient(url, service)
  const { data: existingDoc2 } = await adminClient2
    .from('nh_knowledge_documents')
    .select('id')
    .eq('title', row.file_name)
    .limit(1)
    .maybeSingle()
  if (existingDoc2?.id) {
    await adminClient2.from('nh_knowledge_nodes').delete().eq('doc_id', existingDoc2.id)
    await adminClient2.from('nh_knowledge_documents').delete().eq('id', existingDoc2.id)
    process.stdout.write(`(기존 노드 정리) `)
  }

  let fullText = ''

  // ── 로컬 파싱 ───────────────────────────────────────────────────────────────
  const ext = (row.file_name ?? '').split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') {
    try {
      const buf = await downloadPdfBuffer(row.file_url ?? '', driveToken)
      if (buf) {
        const result = await parsePdfBuffer(buf)
        fullText = (result.text ?? '').trim()
        process.stdout.write(`pdf-parse ${result.numpages}p ${fullText.length}자`)
      } else {
        process.stdout.write('다운로드 실패')
      }
    } catch (e) {
      process.stdout.write(`pdf-parse 오류(${e.message})`)
    }
  } else if (ext === 'txt' || ext === 'md') {
    try {
      const res = await fetch(row.file_url ?? '')
      if (res.ok) {
        fullText = (await res.text()).trim()
        process.stdout.write(`text ${fullText.length}자`)
      }
    } catch (e) {
      process.stdout.write(`fetch 오류(${e.message})`)
    }
  } else {
    process.stdout.write(`비지원 확장자(${ext})`)
  }

  if (!fullText || fullText.length < 20) {
    console.log(' → 텍스트 미확보, 스킵')
    continue
  }

  // 상한 초과 시 앞부분만 사용 (엣지 메모리 보호)
  const truncated = fullText.length > MAX_TEXT_CHARS
  const content = truncated ? fullText.slice(0, MAX_TEXT_CHARS) : fullText
  if (truncated) {
    process.stdout.write(` (앞 ${MAX_TEXT_CHARS.toLocaleString()}자만 사용)`)
  }

  // ── knowledge-ingest 엣지 함수 호출 (doc_id + 임베딩 모두 서버에서 처리) ──
  process.stdout.write(' → knowledge-ingest 호출 중... ')
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/functions/v1/knowledge-ingest`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'INSERT',
        title: row.file_name,
        content,
        source_file_name: row.file_name,
        visibility: 'public',
        metadata: { source: 'knowledge_base', kb_id: row.id },
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.log(`실패 (${res.status}): ${json.error ?? JSON.stringify(json).slice(0, 150)}`)
    } else {
      console.log(`OK — chunks_created: ${json.chunks_created}, chunks_embedded: ${json.chunks_embedded}`)
    }
  } catch (e) {
    console.log(`예외: ${e.message}`)
  }
}

console.log('\n완료. 지식 그래프 페이지를 새로고침해 노드가 생겼는지 확인하세요.')
