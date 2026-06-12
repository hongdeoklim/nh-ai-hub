/**
 * 하이브리드 문서 파서 — Excel·CSV·텍스트·PDF/HWP 폴백
 */

export type ParsedDocumentSection = {
  pageNumber: number | null
  chunkIndex: number
  content: string
}

export type ParsedDocument = {
  fullText: string
  sections: ParsedDocumentSection[]
  parseMethod: string
}

function chunkText(text: string, maxLen = 2400): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim()
  if (!normalized) return []
  const chunks: string[] = []
  let start = 0
  while (start < normalized.length) {
    let end = Math.min(start + maxLen, normalized.length)
    if (end < normalized.length) {
      const nl = normalized.lastIndexOf("\n", end)
      if (nl > start + maxLen * 0.5) end = nl + 1
    }
    chunks.push(normalized.slice(start, end).trim())
    start = end
  }
  return chunks.filter((c) => c.length > 0)
}

function sectionsFromText(
  text: string,
  parseMethod: string,
): ParsedDocument {
  const chunks = chunkText(text)
  const sections: ParsedDocumentSection[] = chunks.map((content, i) => ({
    pageNumber: i + 1,
    chunkIndex: i,
    content,
  }))
  return {
    fullText: text,
    sections,
    parseMethod,
  }
}

async function parseExcel(bytes: Uint8Array): Promise<ParsedDocument> {
  const XLSX = await import("npm:xlsx@0.18.5")
  const workbook = XLSX.read(bytes, { type: "array" })
  const parts: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", RS: "\n" })
    const trimmed = csv.trim()
    if (!trimmed) continue
    parts.push(`## 시트: ${sheetName}\n${trimmed}`)
  }

  const text =
    parts.length > 0
      ? parts.join("\n\n---\n\n")
      : "(빈 스프레드시트)"
  return sectionsFromText(text, "xlsx_sheetjs")
}

function parsePlainText(bytes: Uint8Array, method: string): ParsedDocument {
  const decoder = new TextDecoder("utf-8", { fatal: false })
  const text = decoder.decode(bytes)
  return sectionsFromText(text, method)
}

async function parsePdfBestEffort(
  bytes: Uint8Array,
  filename: string,
): Promise<ParsedDocument> {
  // 1순위: unpdf(서버리스 pdf.js)로 실제 본문 텍스트를 추출한다.
  //         FlateDecode 로 압축된 일반 PDF(규정집 등)도 페이지 단위로 추출 가능.
  //         (배포 시 버전 고정이 필요하면 "npm:unpdf@<버전>" 으로 핀 한다.)
  try {
    const { extractText, getDocumentProxy } = await import("npm:unpdf")
    const pdf = await getDocumentProxy(bytes)
    const { text } = await extractText(pdf, { mergePages: true })
    const merged = (Array.isArray(text) ? text.join("\n\n") : text ?? "").trim()
    if (merged.length > 80) {
      return sectionsFromText(merged, "pdf_unpdf")
    }
  } catch (e) {
    console.warn("[notebook-document-parser] unpdf 추출 실패, 폴백 진행:", e)
  }

  // 2순위: 비압축 PDF 스트림에서 괄호 리터럴 프로브 (구형 폴백 — 기존 로직 보존)
  const decoder = new TextDecoder("latin1", { fatal: false })
  const raw = decoder.decode(bytes)
  const textMatches = raw.match(/\(([^()\\]{4,200})\)/g) ?? []
  const extracted = textMatches
    .map((m) => m.slice(1, -1).replace(/\\n/g, "\n").trim())
    .filter((t) => /[\p{L}\p{N}]/u.test(t))
    .join(" ")
  if (extracted.length > 80) {
    return sectionsFromText(extracted, "pdf_stream_probe")
  }

  // 3순위: 추출 불가 시 메타데이터 폴백
  const fallback =
    `(PDF 「${filename}」 — 본문 추출 제한. 파일명·메타 기반 인덱싱.)`
  return sectionsFromText(fallback, "pdf_fallback")
}

async function parseHwpxBestEffort(
  bytes: Uint8Array,
  filename: string,
): Promise<ParsedDocument> {
  try {
    const { unzipSync } = await import("npm:fflate@0.8.2")
    const files = unzipSync(bytes)
    const xmlParts: string[] = []
    for (const [name, data] of Object.entries(files)) {
      if (!/\.xml$/i.test(name) && !name.includes("Contents")) continue
      const decoder = new TextDecoder("utf-8", { fatal: false })
      const raw = decoder.decode(data)
      const stripped = raw
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
      if (stripped.length > 30) xmlParts.push(stripped)
    }
    if (xmlParts.length > 0) {
      return sectionsFromText(xmlParts.join("\n\n"), "hwpx_xml")
    }
  } catch (e) {
    console.warn("[notebook-document-parser] hwpx", e)
  }
  const fallback = `(HWP/HWPX 「${filename}」 — 바이너리 본문 추출 제한. 메타·파일명 기반 인덱싱.)`
  return sectionsFromText(fallback, "hwp_fallback")
}

export async function parseDocumentBytes(
  bytes: Uint8Array,
  filename: string,
  kind: string,
): Promise<ParsedDocument> {
  const ext = filename.includes(".")
    ? filename.slice(filename.lastIndexOf(".")).toLowerCase()
    : ""
  const k = kind.toLowerCase()

  if (k === "xlsx" || k === "xls" || ext === ".xlsx" || ext === ".xls") {
    return parseExcel(bytes)
  }
  if (k === "csv" || ext === ".csv") {
    return parsePlainText(bytes, "csv")
  }
  if (ext === ".txt" || ext === ".md") {
    return parsePlainText(bytes, "text")
  }
  if (k === "pdf" || ext === ".pdf") {
    return parsePdfBestEffort(bytes, filename)
  }
  if (k === "hwp" || k === "hwpx" || ext === ".hwp" || ext === ".hwpx") {
    return parseHwpxBestEffort(bytes, filename)
  }

  try {
    const asText = new TextDecoder("utf-8", { fatal: false }).decode(bytes)
    if (asText.length > 0 && !asText.includes("\u0000")) {
      return sectionsFromText(asText, "utf8_probe")
    }
  } catch {
    /* fall through */
  }

  return sectionsFromText(
    `(지원 제한 형식: ${filename}). 업로드 메타만 저장되었습니다.`,
    "unsupported",
  )
}
