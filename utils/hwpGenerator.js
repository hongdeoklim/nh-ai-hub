/**
 * NH AI Hub — HWPX 한글 보고서 자동 생성 유틸리티
 *
 * 한컴 유료 API 대신 HWPX(zip) 템플릿의 content.hml 내부 플레이스홀더를
 * 정적 데이터로 치환한 뒤 다시 zip으로 압축하여 .hwpx 파일을 생성합니다.
 *
 * Express 예시:
 *   import { generateHwpxFromTemplate } from './utils/hwpGenerator.js'
 *   app.post('/api/reports/hwpx', async (req, res) => {
 *     const result = await generateHwpxFromTemplate({
 *       templatePath: './templates/tour-report.hwpx',
 *       outputPath: './output/report.hwpx',
 *       data: req.body,
 *     })
 *     res.download(result.outputPath)
 *   })
 */

import fs from 'node:fs/promises'
import path from 'node:path'

import AdmZip from 'adm-zip'

/** 템플릿 content.hml 에서 치환할 플레이스홀더 키 */
export const HWP_TEMPLATE_KEYS = {
  TOUR_TITLE: '{{TOUR_TITLE}}',
  PRICE: '{{PRICE}}',
  ITINERARY_TABLE: '{{ITINERARY_TABLE}}',
}

/** zip 내부에서 content.hml 을 찾을 때 우선 탐색할 경로 */
const CONTENT_HML_CANDIDATE_PATHS = [
  'Contents/content.hml',
  'content.hml',
  'Contents/section0/content.hml',
]

/**
 * XML(HML) 삽입 시 특수문자 이스케이프
 * @param {unknown} value
 * @returns {string}
 */
export function escapeXml(value) {
  const text = value == null ? '' : String(value)
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * @param {string} filePath
 * @returns {Promise<void>}
 */
async function assertFileExists(filePath) {
  try {
    await fs.access(filePath)
  } catch {
    throw new Error(`파일을 찾을 수 없습니다: ${filePath}`)
  }
}

/**
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
async function ensureOutputDirectory(outputPath) {
  const dir = path.dirname(outputPath)
  await fs.mkdir(dir, { recursive: true })
}

/**
 * adm-zip 항목 목록에서 content.hml 경로를 찾습니다.
 * @param {import('adm-zip').IZipEntry[]} entries
 * @returns {string|null}
 */
export function findContentHmlEntryName(entries) {
  for (const candidate of CONTENT_HML_CANDIDATE_PATHS) {
    const found = entries.find(
      (entry) => !entry.isDirectory && entry.entryName === candidate,
    )
    if (found) return found.entryName
  }

  const fallback = entries.find(
    (entry) =>
      !entry.isDirectory &&
      entry.entryName.toLowerCase().endsWith('content.hml'),
  )

  return fallback ? fallback.entryName : null
}

/**
 * 숫자·문자열 가격을 보고서용 문자열로 정규화합니다.
 * @param {string|number|null|undefined} price
 * @returns {string}
 */
export function formatPriceForReport(price) {
  if (price == null || price === '') return '-'
  if (typeof price === 'number' && Number.isFinite(price)) {
    return `${price.toLocaleString('ko-KR')}원`
  }
  return String(price).trim()
}

/**
 * 일정 행 1개를 HML 테이블 셀(hp:tc) 블록으로 변환합니다.
 * @param {string} cellText
 * @returns {string}
 */
function buildTableCellHml(cellText) {
  const safeText = escapeXml(cellText)
  return [
    '<hp:tc name="" borderFillIDRef="1" editable="true" dirty="false" hasMargin="false">',
    '  <hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" textWidth="0" textHeight="0" hasTextRef="false" hasNumRef="false">',
    '    <hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="false" columnBreak="false" merged="false">',
    '      <hp:run charPrIDRef="0">',
    `        <hp:t>${safeText}</hp:t>`,
    '      </hp:run>',
    '    </hp:p>',
    '  </hp:subList>',
    '</hp:tc>',
  ].join('\n')
}

/**
 * 일정 행(hp:tr) 블록 생성
 * @param {string[]} cellValues
 * @returns {string}
 */
function buildTableRowHml(cellValues) {
  const cells = cellValues.map((value) => buildTableCellHml(value)).join('\n')
  return ['<hp:tr>', cells, '</hp:tr>'].join('\n')
}

/**
 * 여행 일정 배열을 HML 테이블 XML 조각으로 변환합니다.
 *
 * @param {Array<Record<string, unknown>>|null|undefined} itineraryRows
 * @returns {string}
 */
export function buildItineraryTableHml(itineraryRows) {
  if (!Array.isArray(itineraryRows) || itineraryRows.length === 0) {
    return buildTableRowHml(['등록된 일정이 없습니다.', '-', '-', '-'])
  }

  const headerRow = buildTableRowHml(['일차', '일정', '식사', '숙박'])

  const bodyRows = itineraryRows.map((row, index) => {
    const day =
      row.day != null && String(row.day).trim() !== ''
        ? String(row.day)
        : String(index + 1)
    const program =
      row.program ??
      row.schedule ??
      row.itinerary ??
      row.description ??
      '-'
    const meals = row.meals ?? row.meal ?? '-'
    const hotel = row.hotel ?? row.accommodation ?? '-'

    return buildTableRowHml([
      `${day}일차`,
      String(program),
      String(meals),
      String(hotel),
    ])
  })

  return [
    '<hp:tbl id="0" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="false" dropcapstyle="None" pageBreak="CELL" repeatHeader="true" rowCnt="' +
      (itineraryRows.length + 1) +
      '" colCnt="4" cellSpacing="0" borderFillIDRef="1" noAdjust="false">',
    '  <hp:sz width="41954" widthRelTo="ABSOLUTE" height="2822" heightRelTo="ABSOLUTE" protect="false"/>',
    '  <hp:pos treatAsChar="true" affectLSpacing="false" flowWithText="true" allowOverlap="false" holdAnchorAndSO="false" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>',
    '  <hp:outMargin left="141" right="141" top="141" bottom="141"/>',
    '  <hp:inMargin left="141" right="141" top="141" bottom="141"/>',
    headerRow,
    bodyRows.join('\n'),
    '</hp:tbl>',
  ].join('\n')
}

/**
 * content.hml 문자열 내부 플레이스홀더를 데이터로 치환합니다.
 *
 * @param {string} hmlContent
 * @param {{
 *   tourTitle?: string
 *   price?: string|number
 *   itinerary?: Array<Record<string, unknown>>
 * }} data
 * @returns {string}
 */
export function replaceTemplatePlaceholders(hmlContent, data) {
  if (typeof hmlContent !== 'string' || hmlContent.length === 0) {
    throw new Error('content.hml 내용이 비어 있습니다.')
  }

  const tourTitle = escapeXml(data.tourTitle ?? data.title ?? '')
  const priceText = escapeXml(formatPriceForReport(data.price))
  const itineraryTableHml = buildItineraryTableHml(data.itinerary)

  let replaced = hmlContent

  if (!replaced.includes(HWP_TEMPLATE_KEYS.TOUR_TITLE)) {
    throw new Error(
      `템플릿에 ${HWP_TEMPLATE_KEYS.TOUR_TITLE} 플레이스홀더가 없습니다.`,
    )
  }
  if (!replaced.includes(HWP_TEMPLATE_KEYS.PRICE)) {
    throw new Error(
      `템플릿에 ${HWP_TEMPLATE_KEYS.PRICE} 플레이스홀더가 없습니다.`,
    )
  }
  if (!replaced.includes(HWP_TEMPLATE_KEYS.ITINERARY_TABLE)) {
    throw new Error(
      `템플릿에 ${HWP_TEMPLATE_KEYS.ITINERARY_TABLE} 플레이스홀더가 없습니다.`,
    )
  }

  replaced = replaced.split(HWP_TEMPLATE_KEYS.TOUR_TITLE).join(tourTitle)
  replaced = replaced.split(HWP_TEMPLATE_KEYS.PRICE).join(priceText)
  replaced = replaced
    .split(HWP_TEMPLATE_KEYS.ITINERARY_TABLE)
    .join(itineraryTableHml)

  return replaced
}

/**
 * HWPX(zip) 버퍼에서 content.hml 을 치환한 새 HWPX 버퍼를 생성합니다.
 *
 * @param {Buffer|Uint8Array} templateBuffer
 * @param {{
 *   tourTitle?: string
 *   price?: string|number
 *   itinerary?: Array<Record<string, unknown>>
 * }} data
 * @returns {Buffer}
 */
export function generateHwpxBuffer(templateBuffer, data) {
  if (!templateBuffer || templateBuffer.length === 0) {
    throw new Error('HWPX 템플릿 버퍼가 비어 있습니다.')
  }

  const zip = new AdmZip(Buffer.from(templateBuffer))
  const entries = zip.getEntries()
  const contentEntryName = findContentHmlEntryName(entries)

  if (!contentEntryName) {
    throw new Error(
      'HWPX 내부에서 content.hml 파일을 찾지 못했습니다. 템플릿 구조를 확인하세요.',
    )
  }

  const originalHml = zip.readAsText(contentEntryName, 'utf8')
  const updatedHml = replaceTemplatePlaceholders(originalHml, data)

  zip.updateFile(contentEntryName, Buffer.from(updatedHml, 'utf8'))

  return zip.toBuffer()
}

/**
 * HWPX 템플릿 파일 경로와 출력 경로를 받아 보고서 .hwpx 파일을 생성합니다.
 *
 * @param {{
 *   templatePath: string
 *   outputPath: string
 *   data: {
 *     tourTitle?: string
 *     title?: string
 *     price?: string|number
 *     itinerary?: Array<Record<string, unknown>>
 *   }
 *   outputFileName?: string
 * }} options
 * @returns {Promise<{
 *   outputPath: string
 *   contentHmlEntry: string
 *   byteLength: number
 * }>}
 */
export async function generateHwpxFromTemplate(options) {
  const templatePath = options?.templatePath
  const outputPath = options?.outputPath
  const data = options?.data ?? {}

  if (!templatePath || typeof templatePath !== 'string') {
    throw new Error('templatePath 는 필수 문자열입니다.')
  }
  if (!outputPath || typeof outputPath !== 'string') {
    throw new Error('outputPath 는 필수 문자열입니다.')
  }

  await assertFileExists(templatePath)
  await ensureOutputDirectory(outputPath)

  const templateBuffer = await fs.readFile(templatePath)
  const outputBuffer = generateHwpxBuffer(templateBuffer, data)

  await fs.writeFile(outputPath, outputBuffer)

  const zip = new AdmZip(templateBuffer)
  const contentHmlEntry = findContentHmlEntryName(zip.getEntries()) ?? 'unknown'

  return {
    outputPath: path.resolve(outputPath),
    contentHmlEntry,
    byteLength: outputBuffer.length,
  }
}

/**
 * Express/Vite SSR 등에서 바로 응답할 수 있도록 Buffer 만 반환하는 헬퍼
 *
 * @param {string} templatePath
 * @param {{
 *   tourTitle?: string
 *   title?: string
 *   price?: string|number
 *   itinerary?: Array<Record<string, unknown>>
 * }} data
 * @returns {Promise<Buffer>}
 */
export async function generateHwpxBufferFromFile(templatePath, data) {
  await assertFileExists(templatePath)
  const templateBuffer = await fs.readFile(templatePath)
  return generateHwpxBuffer(templateBuffer, data)
}

/**
 * CLI/스크립트에서 바로 실행할 수 있는 샘플 데이터 생성기
 * @returns {{
 *   tourTitle: string
 *   price: number
 *   itinerary: Array<{ day: number, program: string, meals: string, hotel: string }>
 * }}
 */
export function createSampleTourReportData() {
  return {
    tourTitle: '2026 농협네트웍스 임직원 워크숍 — 제주 3박 4일',
    price: 1280000,
    itinerary: [
      {
        day: 1,
        program: '김포 출발 → 제주 도착 → 오후 팀 빌딩 워크숍',
        meals: '중/석',
        hotel: '제주 그랜드 호텔',
      },
      {
        day: 2,
        program: '오전 AI 활용 세미나 → 오후 올레길 트레킹',
        meals: '조/중/석',
        hotel: '제주 그랜드 호텔',
      },
      {
        day: 3,
        program: '자유 일정 및 기념품 구매 → 저녁 환송 만찬',
        meals: '조/석',
        hotel: '제주 그랜드 호텔',
      },
      {
        day: 4,
        program: '호텔 체크아웃 → 제주 출발 → 김포 도착',
        meals: '조',
        hotel: '-',
      },
    ],
  }
}
