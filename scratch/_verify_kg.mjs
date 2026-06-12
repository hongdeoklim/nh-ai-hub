import { chromium } from 'playwright'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import * as path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const env = {}
fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
  if (m) { let v = m[2] || ''; if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); env[m[1]] = v }
})

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setViewportSize({ width: 1400, height: 900 })

const consoleLogs = []
page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`))

// 로그인 페이지
await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(3000)
await page.screenshot({ path: path.resolve(__dirname, '_verify_login.png') })
console.log('로그인 페이지 스크린샷 저장')

// 폼 셀렉터 확인
const emailInputs = await page.locator('input[type=email]').count()
const emailById = await page.locator('#login-email').count()
console.log('email input count:', emailInputs, '/ #login-email count:', emailById)

if (emailInputs > 0) {
  await page.locator('input[type=email]').fill(env['VITE_DEV_LOGIN_EMAIL']?.trim() ?? '')
  await page.locator('input[type=password]').fill(env['VITE_DEV_LOGIN_PASSWORD'] ?? '')
  await page.locator('button[type=submit]').click()
  await page.waitForTimeout(4000)
  console.log('로그인 후 URL:', page.url())
  await page.screenshot({ path: path.resolve(__dirname, '_verify_after_login.png') })
}

// 지식그래프 직접 이동
await page.goto('http://localhost:5173/knowledge-graph', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(6000)

const overlayText = await page.locator('text=/노드:/').first().textContent().catch(() => '없음')
console.log('노드 오버레이:', overlayText)

const errorText = await page.locator('text=/데이터를 불러오지 못/').count()
console.log('에러 박스 표시:', errorText > 0 ? '있음' : '없음')

const emptyText = await page.locator('text=/로딩 중이거나 그래프 데이터가 없/').count()
console.log('"데이터 없음" 메시지:', emptyText > 0 ? '있음' : '없음')

await page.screenshot({ path: path.resolve(__dirname, '_verify_kg.png') })
console.log('지식그래프 스크린샷: scratch/_verify_kg.png')

consoleLogs.filter(l => /knowledge-graph|nodes|error|Error|인증|세션/i.test(l))
  .slice(0, 15).forEach(l => console.log(l))

await browser.close()
