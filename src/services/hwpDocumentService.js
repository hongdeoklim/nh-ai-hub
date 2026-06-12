/**
 * NH AI Hub — 한글 문서(HWP / HWPX) 자동 생성 서비스
 *
 * Node.js 백엔드(Express 등) 전용 모듈입니다.
 * 견적·예약 등 기존 비즈니스 로직과 분리되어 있으며, 문서 생성만 담당합니다.
 *
 * Dual-Track:
 *   - .hwpx → adm-zip + xml-js 로 content.hml 플레이스홀더 치환 (API 비용 없음)
 *   - .hwp  → 한컴 외부 API 로 템플릿 치환 후 파일 수신
 */

import fs from 'node:fs/promises'
import path from 'node:path'

import AdmZip from 'adm-zip'
import convert from 'xml-js'

/** zip 내부 content.hml 탐색 후보 경로 */
const CONTENT_HML_CANDIDATE_PATHS = [
  'Contents/content.hml',
  'content.hml',
  'Contents/section0/content.hml',
]

/** HWP 레거시 포맷 — 한컴 API 엔드포인트 (가상) */
const HANCOM_REPLACE_API_URL =
  'https://api.hancom.com/v1/document/replace'

/** 기본 출력 디렉터리 (프로젝트 루트 기준) */
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'output', 'documents')

/**
 * @typedef {Record<string, string | number | boolean | null | undefined>} ReportData
 */

/**
 * @typedef {Object} GenerateKoreanReportSuccess
 * @property {true} success
 * @property {'hwpx' | 'hwp'} format
 * @property {string} outputPath
 * @property {number} byteLength
 * @property {string} [contentHmlEntry]
 */

/**
 * @typedef {Object} GenerateKoreanReportFailure
 * @property {false} success
 * @property {'hwpx' | 'hwp' | 'unknown'} format
 * @property {string} error
 * @property {string|null} outputPath
 */

/**
 * @typedef {GenerateKoreanReportSuccess | GenerateKoreanReportFailure} GenerateKoreanReportResult
 */

/**
 * XML(HML) 텍스트 노드 삽입용 이스케이프
 * @param {unknown} value
 * @returns {string}
 */
function escapeXmlText(value) {
  const text = value == null ? '' : String(value)
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * data 객체 키를 {{KEY}} 플레이스홀더 형태로 정규화
 * @param {ReportData} data
 * @returns {Record<string, string>}
 */
function buildPlaceholderMap(data) {
  /** @type {Record<string, string>} */
  const map = {}

  if (!data || typeof data !== 'object') {
    return map
  }

  for (const [rawKey, rawValue] of Object.entries(data)) {
    const normalizedKey = rawKey.trim()
    if (!normalizedKey.length) continue

    const placeholderKey = normalizedKey.startsWith('{{')
      ? normalizedKey
      : `{{${normalizedKey}}}`

    map[placeholderKey] = escapeXmlText(rawValue)
  }

  return map
}

/**
 * 문자열 내 {{KEY}} 플레이스홀더 일괄 치환
 * @param {string} source
 * @param {Record<string, string>} placeholderMap
 * @returns {string}
 */
function applyPlaceholderReplacements(source, placeholderMap) {
  let result = source

  for (const [placeholder, replacement] of Object.entries(placeholderMap)) {
    if (!result.includes(placeholder)) continue
    result = result.split(placeholder).join(replacement)
  }

  return result
}

/**
 * xml-js 트리(text 노드) 재귀 순회하며 치환
 * @param {unknown} node
 * @param {Record<string, string>} placeholderMap
 */
function walkXmlJsNodeAndReplace(node, placeholderMap) {
  if (!node || typeof node !== 'object') return

  /** @type {{ type?: string, text?: string, elements?: unknown[] }} */
  const current = node

  if (current.type === 'text' && typeof current.text === 'string') {
    current.text = applyPlaceholderReplacements(current.text, placeholderMap)
  }

  if (Array.isArray(current.elements)) {
    for (const child of current.elements) {
      walkXmlJsNodeAndReplace(child, placeholderMap)
    }
  }
}

/**
 * adm-zip entries 에서 content.hml 경로 탐색
 * @param {import('adm-zip').IZipEntry[]} entries
 * @returns {string|null}
 */
function findContentHmlEntryName(entries) {
  for (const candidate of CONTENT_HML_CANDIDATE_PATHS) {
    const matched = entries.find(
      (entry) => !entry.isDirectory && entry.entryName === candidate,
    )
    if (matched) return matched.entryName
  }

  const fallback = entries.find(
    (entry) =>
      !entry.isDirectory &&
      entry.entryName.toLowerCase().endsWith('content.hml'),
  )

  return fallback ? fallback.entryName : null
}

/**
 * @param {string} filePath
 * @returns {Promise<void>}
 */
async function assertReadableFile(filePath) {
  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) {
      throw new Error(`경로가 파일이 아닙니다: ${filePath}`)
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('파일이 아닙니다')) {
      throw error
    }
    throw new Error(`템플릿 파일을 찾을 수 없습니다: ${filePath}`)
  }
}

/**
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
async function ensureParentDirectory(outputPath) {
  const parentDir = path.dirname(outputPath)
  await fs.mkdir(parentDir, { recursive: true })
}

/**
 * outputFilename 을 절대 경로로 변환
 * @param {string} outputFilename
 * @param {'hwpx' | 'hwp'} format
 * @returns {string}
 */
function resolveOutputPath(outputFilename, format) {
  const trimmed = outputFilename.trim()
  if (!trimmed.length) {
    throw new Error('outputFilename 이 비어 있습니다.')
  }

  let resolved = path.isAbsolute(trimmed)
    ? trimmed
    : path.join(DEFAULT_OUTPUT_DIR, trimmed)

  const expectedExt = `.${format}`
  if (!resolved.toLowerCase().endsWith(expectedExt)) {
    resolved = `${resolved}${expectedExt}`
  }

  return path.resolve(resolved)
}

/**
 * xml-js 로 content.hml 파싱 후 플레이스홀더 치환
 * @param {string} hmlXml
 * @param {ReportData} data
 * @returns {string}
 */
function replacePlaceholdersInHmlWithXmlJs(hmlXml, data) {
  const placeholderMap = buildPlaceholderMap(data)

  if (Object.keys(placeholderMap).length === 0) {
    throw new Error('치환할 data 객체가 비어 있습니다.')
  }

  /** @type {import('xml-js').Element} */
  let parsed
  try {
    parsed = convert.xml2js(hmlXml, {
      compact: false,
      ignoreComment: false,
      alwaysChildren: true,
    })
  } catch (parseError) {
    const message =
      parseError instanceof Error ? parseError.message : String(parseError)
    throw new Error(`content.hml XML 파싱 실패: ${message}`)
  }

  walkXmlJsNodeAndReplace(parsed, placeholderMap)

  let serialized = convert.js2xml(parsed, {
    compact: false,
    ignoreComment: false,
    spaces: 0,
  })

  serialized = applyPlaceholderReplacements(serialized, placeholderMap)

  const unresolved = serialized.match(/\{\{[A-Z0-9_]+\}\}/g)
  if (unresolved && unresolved.length > 0) {
    const unique = [...new Set(unresolved)]
    console.warn(
      `[hwpDocumentService] 치환되지 않은 플레이스홀더가 남아 있습니다: ${unique.join(', ')}`,
    )
  }

  return serialized
}

/**
 * HWPX 트랙 — zip 해제 → content.hml 치환 → zip 재압축
 * @param {string} templatePath
 * @param {string} outputPath
 * @param {ReportData} data
 * @returns {Promise<GenerateKoreanReportSuccess>}
 */
async function generateFromHwpxTemplate(templatePath, outputPath, data) {
  await assertReadableFile(templatePath)
  await ensureParentDirectory(outputPath)

  const templateBuffer = await fs.readFile(templatePath)
  if (!templateBuffer.length) {
    throw new Error('HWPX 템플릿 파일이 비어 있습니다.')
  }

  const zip = new AdmZip(templateBuffer)
  const entries = zip.getEntries()
  const contentEntryName = findContentHmlEntryName(entries)

  if (!contentEntryName) {
    throw new Error(
      'HWPX 내부에서 content.hml 을 찾지 못했습니다. 템플릿 구조를 확인하세요.',
    )
  }

  const originalHml = zip.readAsText(contentEntryName, 'utf8')
  if (!originalHml.trim().length) {
    throw new Error('content.hml 내용이 비어 있습니다.')
  }

  const updatedHml = replacePlaceholdersInHmlWithXmlJs(originalHml, data)
  zip.updateFile(contentEntryName, Buffer.from(updatedHml, 'utf8'))

  const outputBuffer = zip.toBuffer()
  await fs.writeFile(outputPath, outputBuffer)

  return {
    success: true,
    format: 'hwpx',
    outputPath,
    byteLength: outputBuffer.length,
    contentHmlEntry: contentEntryName,
  }
}

/**
 * HWP 트랙 — 한컴 외부 API 로 템플릿 + data 전송
 * @param {string} templatePath
 * @param {string} outputPath
 * @param {ReportData} data
 * @returns {Promise<GenerateKoreanReportSuccess>}
 */
async function generateFromHwpTemplate(templatePath, outputPath, data) {
  await assertReadableFile(templatePath)
  await ensureParentDirectory(outputPath)

  const templateBuffer = await fs.readFile(templatePath)
  if (!templateBuffer.length) {
    throw new Error('HWP 템플릿 파일이 비어 있습니다.')
  }

  const apiKey = process.env.HANCOM_API_KEY?.trim()
  const headers = {
    Accept: 'application/octet-stream, application/json',
  }

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const formData = new FormData()
  const templateBlob = new Blob([templateBuffer], {
    type: 'application/x-hwp',
  })
  formData.append('template', templateBlob, path.basename(templatePath))
  formData.append('data', JSON.stringify(data ?? {}))
  formData.append('outputFormat', 'hwp')

  let response
  try {
    response = await fetch(HANCOM_REPLACE_API_URL, {
      method: 'POST',
      headers,
      body: formData,
    })
  } catch (networkError) {
    const message =
      networkError instanceof Error
        ? networkError.message
        : String(networkError)
    throw new Error(`한컴 API 네트워크 오류: ${message}`)
  }

  if (!response.ok) {
    let errorDetail = ''
    try {
      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        const jsonBody = await response.json()
        errorDetail =
          typeof jsonBody?.message === 'string'
            ? jsonBody.message
            : JSON.stringify(jsonBody)
      } else {
        errorDetail = await response.text()
      }
    } catch {
      errorDetail = '(응답 본문 파싱 실패)'
    }

    throw new Error(
      `한컴 API 오류 (HTTP ${response.status}): ${errorDetail || response.statusText}`,
    )
  }

  const arrayBuffer = await response.arrayBuffer()
  const outputBuffer = Buffer.from(arrayBuffer)

  if (!outputBuffer.length) {
    throw new Error('한컴 API 가 빈 파일을 반환했습니다.')
  }

  await fs.writeFile(outputPath, outputBuffer)

  return {
    success: true,
    format: 'hwp',
    outputPath,
    byteLength: outputBuffer.length,
  }
}

/**
 * 한글 보고서 자동 생성 (Dual-Track)
 *
 * @param {string} templatePath - HWP 또는 HWPX 템플릿 절대/상대 경로
 * @param {string} outputFilename - 저장 파일명 (상대 경로면 output/documents/ 하위)
 * @param {ReportData} data - {{COMPANY_NAME}} 형태로 치환할 key-value
 * @returns {Promise<GenerateKoreanReportResult>}
 *
 * @example
 * const result = await generateKoreanReport(
 *   './templates/quote.hwpx',
 *   'quote-20260519.hwpx',
 *   { COMPANY_NAME: '농협네트웍스', TOTAL_PRICE: '1,280,000원' },
 * )
 * if (result.success) {
 *   console.log('생성 완료:', result.outputPath)
 * } else {
 *   console.error('생성 실패:', result.error)
 * }
 */
export async function generateKoreanReport(
  templatePath,
  outputFilename,
  data,
) {
  let format = 'unknown'

  try {
    if (typeof templatePath !== 'string' || !templatePath.trim().length) {
      throw new Error('templatePath 는 필수 문자열입니다.')
    }
    if (typeof outputFilename !== 'string' || !outputFilename.trim().length) {
      throw new Error('outputFilename 은 필수 문자열입니다.')
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('data 는 key-value 객체여야 합니다.')
    }

    const resolvedTemplatePath = path.resolve(templatePath.trim())
    const extension = path.extname(resolvedTemplatePath).toLowerCase()

    if (extension === '.hwpx') {
      format = 'hwpx'
      const outputPath = resolveOutputPath(outputFilename.trim(), 'hwpx')
      return await generateFromHwpxTemplate(
        resolvedTemplatePath,
        outputPath,
        data,
      )
    }

    if (extension === '.hwp') {
      format = 'hwp'
      const outputPath = resolveOutputPath(outputFilename.trim(), 'hwp')
      return await generateFromHwpTemplate(
        resolvedTemplatePath,
        outputPath,
        data,
      )
    }

    throw new Error(
      `지원하지 않는 템플릿 확장자입니다: "${extension || '(없음)'}". .hwpx 또는 .hwp 만 지원합니다.`,
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '알 수 없는 문서 생성 오류'

    console.error('[hwpDocumentService] generateKoreanReport 실패:', message)

    return {
      success: false,
      format,
      error: message,
      outputPath: null,
    }
  }
}

/**
 * 샘플 data 객체 (개발·테스트용)
 * @returns {ReportData}
 */
export function createSampleReportData() {
  return {
    COMPANY_NAME: '농협네트웍스',
    TOTAL_PRICE: '1,280,000원',
    TOUR_TITLE: '2026 임직원 워크숍 — 제주 3박 4일',
    REPORT_DATE: '2026-05-19',
    MANAGER_NAME: '홍길동',
  }
}
