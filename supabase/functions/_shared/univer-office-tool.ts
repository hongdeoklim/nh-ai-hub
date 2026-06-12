/**
 * NH AX Hub ??Univer ?�합 ?�피??aiDataSignal 주입 ?�구
 *
 * ?�론?�엔??`UniverWorkspace` ??aiDataSignal ?�로?�콜�?1:1 매핑?�니??
 */
import { tool, zodSchema } from "npm:ai@6.0.184"
import { z } from "npm:zod@4.4.3"

// ---------------------------------------------------------------------------
// ?�수 · ?�??
// ---------------------------------------------------------------------------

export const INJECT_UNIVER_OFFICE_DATA_TOOL_NAME = "inject_univer_office_data"

export type UniverOfficeActiveTab = "sheets" | "docs" | "slides"

export type UniverCellValue = string | number | boolean | null

export type UniverAiCellUpdate = {
  range?: string
  a1Notation?: string
  value: UniverCellValue
  sheetName?: string
  sheet?: string
}

/** ?�론??UniverWorkspace 가 ?�용?�는 aiDataSignal ?�식 */
export type UniverAiDataSignal = {
  tick: number | string
  text?: string
  range?: string
  value?: UniverCellValue
  sheetName?: string
  updates?: UniverAiCellUpdate[]
  cells?: UniverAiCellUpdate[]
  map?: Record<string, UniverCellValue>
}

export type InjectUniverOfficeDataInput = {
  user_request: string
  activeTab?: UniverOfficeActiveTab
  range?: string
  value?: UniverCellValue
  sheetName?: string
  updates?: UniverAiCellUpdate[]
  map?: Record<string, UniverCellValue>
  text?: string
}

export type InjectUniverOfficeDataResult =
  | {
    ok: true
    activeTab: UniverOfficeActiveTab
    aiDataSignal: UniverAiDataSignal
    message: string
  }
  | {
    ok: false
    error: string
    activeTab?: UniverOfficeActiveTab
  }

// ---------------------------------------------------------------------------
// MCP ?�구 ?�언 (Anthropic tools[] / inputSchema)
// ---------------------------------------------------------------------------

export type UniverOfficeMcpToolDefinition = {
  name: string
  description: string
  inputSchema: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
}

export const INJECT_UNIVER_OFFICE_DATA_MCP_DEFINITION: UniverOfficeMcpToolDefinition = {
  name: INJECT_UNIVER_OFFICE_DATA_TOOL_NAME,
  description:
    "NH AX ?�합 ?�피??UniverWorkspace)???�시�??�이?��? 주입?�니?? " +
    "문서 ?�성·기획?�·보고서??docs(text), ?�산·?�·수?�·�? ?�력?� sheets(range/value·updates·map)�?분기?�니?? " +
    "?�출 ??반환??aiDataSignal ???�론?��? 그�?�??�신·?�용?�니??",
  inputSchema: {
    type: "object",
    properties: {
      user_request: {
        type: "string",
        description:
          "?�용???�연???�도(?�수). activeTab ?�동 ?�별???�용. ?? '기획???�줘', '?�산??채워�?",
      },
      activeTab: {
        type: "string",
        enum: ["sheets", "docs", "slides"],
        description:
          "명시???? ?�략 ??user_request ?�워?�로 sheets/docs/slides ?�동 ?�별",
      },
      text: {
        type: "string",
        description: "docs ?? 문서 본문??append ???스??마크?운 가??",
      },
      range: {
        type: "string",
        description:
          "sheets 방식1 단일 셀/범위 A1 표기. 시트 명 참조 시 '결산!A1' 또는 sheetName 별도 지정",
      },
      value: {
        description:
          "sheets ?식1 ??? ? ?식? =SUM(A1:A10) 처럼 ?문자 ?수??용",
        oneOf: [
          { type: "string" },
          { type: "number" },
          { type: "boolean" },
          { type: "null" },
        ],
      },
      sheetName: {
        type: "string",
        description:
          "sheets ??range ??! 가 ?�을 ???�트�??�두. ?? sheetName='결산', range='A1'",
      },
      updates: {
        type: "array",
        description: "sheets ?�식2 ???�중 ?� ?�괄 주입 배열",
        items: {
          type: "object",
          properties: {
            range: { type: "string" },
            a1Notation: { type: "string" },
            value: {
              oneOf: [
                { type: "string" },
                { type: "number" },
                { type: "boolean" },
                { type: "null" },
              ],
            },
            sheetName: { type: "string" },
            sheet: { type: "string" },
          },
          required: ["value"],
        },
      },
      map: {
        type: "object",
        description: "sheets 방식3 예시: { 'A1': '매출', 'B1': '=SUM(B2:B10)' } 등",
        additionalProperties: {
          oneOf: [
            { type: "string" },
            { type: "number" },
            { type: "boolean" },
            { type: "null" },
          ],
        },
      },
    },
    required: ["user_request"],
  },
}

// ---------------------------------------------------------------------------
// ?�스???�롬?�트 가?�드 (AI JSON ?�격 규칙)
// ---------------------------------------------------------------------------

export const UNIVER_OFFICE_TOOL_GUIDANCE = `

## ?�합 ?�피???�이??주입 (inject_univer_office_data)
?�용?��? **NH AX ?�합 ?�피??*(?�프?�드?�트·문서·?�라?�드)???�용??채우거나 ?�성?�길 ?�하�?**inject_univer_office_data** �??�출?�라.

### ???�동 ?�별 (activeTab)
- **docs** ??기획?�·문?�·보고서·?�안?�·초?�·본문·워?�·작?�·써줘·텍?�트 ?�성
- **sheets** ???�산·?�산?�·엑?�·?�트·?�프?�드?�트·?�·�?·?�식·채워·계산·매출·SUM·AVERAGE
- **slides** ???�라?�드·PPT·?�워?�인?�·발?�자료·프?�젠?�이??
- ?�실?��? ?�으�?user_request �?그�?�??�고, 모델??activeTab ??명시?�라.

### Sheets ???�론?��? ?�용?�는 3가지 JSON ?�식 (??, updates 권장)
**?�식1 · ?�일 ?�**
\`\`\`json
{ "user_request": "?�산??A1???�목", "activeTab": "sheets", "range": "A1", "value": "매출 ??��", "sheetName": "결산" }
\`\`\`

**?�식2 · updates 배열 (복수 ?� · ?�산?�·표 채우기에 최적)**
\`\`\`json
{
  "user_request": "?�산??채워�?,
  "activeTab": "sheets",
  "updates": [
    { "range": "A1", "value": "??��", "sheetName": "결산" },
    { "range": "B1", "value": "=SUM(B2:B10)", "sheetName": "결산" },
    { "range": "결산!C1", "value": "=AVERAGE(C2:C10)" }
  ]
}
\`\`\`

**?�식3 · map 객체**
\`\`\`json
{
  "user_request": "?�트 �?주입",
  "activeTab": "sheets",
  "map": { "A1": "매출", "B1": "=SUM(B2:B10)", "결산!C1": "=AVERAGE(C2:C10)" }
}
\`\`\`

### Sheets ???�식·?�트 참조 규칙 (?�수)
- 모든 Excel ?�수명�? **반드???�문자**: \`=SUM()\`, \`=AVERAGE()\`, \`=COUNT()\`, \`=MAX()\`, \`=MIN()\`, \`=IF()\`
- ?�트 �?참조가 ?�요?�면 **?�트�??�** ?�식: \`'결산'!A1\`, \`Sheet1!B2:C4\`
- sheetName �?range �?분리???? sheetName='결산', range='A1' ???�론?��? \`결산!A1\` �??�코??
- range ???��? \`!\` 가 ?�으�?그�?�??�용 (sheetScopedRange 검�?로직)

### Docs ??본문 ?�입
\`\`\`json
{ "user_request": "기획???�줘", "activeTab": "docs", "text": "1. 개요\\n2. 목표\\n3. ?�정..." }
### Sheets ???식·?트 참조 규칙 (?수)
- 모든 Excel ?수명? **반드???문자**: \`=SUM()\`, \`=AVERAGE()\`, \`=COUNT()\`, \`=MAX()\`, \`=MIN()\`, \`=IF()\`
- ?트 ?참조가 ?요?면 **?트??** ?식: \`'결산'!A1\`, \`Sheet1!B2:C4\`
- sheetName ?range ?분리???? sheetName='결산', range='A1' ???론?? \`결산!A1\` ??코??
- range ???? \`!\` 가 ?으?그???용 (sheetScopedRange 검?로직)

### Docs ??본문 ?입
\`\`\`json
{ "user_request": "기획???줘", "activeTab": "docs", "text": "1. 개요\\n2. 목표\\n3. ?정..." }
\`\`\`
- docs ???는 **text** ?드??용. updates/map/range ???? 마라.

### ?구 반환?
- ?공 ??\`{ ok: true, activeTab, aiDataSignal, message }\` ??aiDataSignal ???론?? UniverWorkspace ???달
- 실패 시 error 를 사용자에게 설명하고 다시 시도

`

// ---------------------------------------------------------------------------
// Zod · ?규??· ??추론
// ---------------------------------------------------------------------------

const cellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
])

export const injectUniverOfficeInputZod = z.object({
  user_request: z.string().min(1),
  activeTab: z.enum(["sheets", "docs", "slides"]).optional(),
  text: z.string().optional(),
  range: z.string().min(1).optional(),
  value: cellValueSchema.optional(),
  sheetName: z.string().min(1).optional(),
  updates: z
    .array(
      z.object({
        range: z.string().min(1).optional(),
        a1Notation: z.string().min(1).optional(),
        value: cellValueSchema,
        sheetName: z.string().min(1).optional(),
        sheet: z.string().min(1).optional(),
      }).refine(
        (row) => Boolean(row.range ?? row.a1Notation),
        { message: "updates �???��?�는 range ?�는 a1Notation ???�요?�니??" },
      ),
    )
    .optional(),
  map: z.record(z.string(), cellValueSchema).optional(),
})

const DOCS_KEYWORDS = [
  "기획", "문서", "보고서", "제안서", "워드", "word",
  "본문", "초안", "작성", "써줘", "만들어", "상세", "letter", "memo", "메모"
]

const SHEETS_KEYWORDS = [
  "예산", "결산", "엑셀", "excel", "시트", "sheet", "스프레드시트",
  "spreadsheet", "표", "수식", "채워", "채우", "입력", "계산", "매출",
  "sum", "average", "count", "피벗"
]

const SLIDES_KEYWORDS = [
  "슬라이드", "slide", "ppt", "파워포인트", "powerpoint", "발표", "프레젠테이션",
  "presentation", "deck"
]

function scoreKeywords(text: string, keywords: string[]): number {
  const lower = text.toLowerCase()
  let score = 0
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) score += 1
  }
  return score
}

/** user_request ?�워??기반 activeTab 추론 */
export function inferUniverOfficeActiveTab(
  userRequest: string,
): UniverOfficeActiveTab {
  const docsScore = scoreKeywords(userRequest, DOCS_KEYWORDS)
  const sheetsScore = scoreKeywords(userRequest, SHEETS_KEYWORDS)
  const slidesScore = scoreKeywords(userRequest, SLIDES_KEYWORDS)

  if (docsScore >= sheetsScore && docsScore >= slidesScore && docsScore > 0) {
    return "docs"
  }
  if (slidesScore > sheetsScore && slidesScore > 0) {
    return "slides"
  }
  if (sheetsScore > 0) {
    return "sheets"
  }
  return "sheets"
}

/** =sum( ??=SUM( ???�수�??�문자??*/
export function normalizeUniverFormulaValue(value: UniverCellValue): UniverCellValue {
  if (typeof value !== "string") return value
  const trimmed = value.trim()
  if (!trimmed.startsWith("=")) return value

  return trimmed.replace(
    /=([a-zA-Z_][a-zA-Z0-9_.]*)\s*\(/g,
    (_, fn: string) => `=${fn.toUpperCase()}(`,
  )
}

/** ?�트명에 공백·?�수문자가 ?�으�??��??�옴?�로 감싼 '결산'!A1 ?�태 */
export function quoteSheetNameForRange(sheetName: string): string {
  if (/^[\w가-힣]+$/.test(sheetName)) return sheetName
  return `'${sheetName.replace(/'/g, "''")}'`
}

/**
 * sheetScopedRange 검�??�리 (?�론??UniverWorkspace ?� ?�일):
 * rangeRef.includes('!') ? rangeRef : sheetKey ? `${sheetKey}!${rangeRef}` : rangeRef
 */
export function buildSheetScopedRange(
  rangeRef: string,
  sheetKey?: string,
): string {
  if (rangeRef.includes("!")) return rangeRef
  if (!sheetKey) return rangeRef
  return `${quoteSheetNameForRange(sheetKey)}!${rangeRef}`
}

function normalizeUpdateRow(row: UniverAiCellUpdate): UniverAiCellUpdate {
  const rangeRaw = row.range ?? row.a1Notation ?? ""
  const sheetKey = row.sheetName ?? row.sheet
  const scopedRange = buildSheetScopedRange(String(rangeRaw), sheetKey)
  const value = normalizeUniverFormulaValue(row.value)

  if (scopedRange.includes("!")) {
    const bang = scopedRange.lastIndexOf("!")
    const sheetPart = scopedRange.slice(0, bang)
    const cellPart = scopedRange.slice(bang + 1)
    return {
      range: cellPart,
      a1Notation: scopedRange,
      value,
      sheetName: sheetPart.replace(/^'|'$/g, "").replace(/''/g, "'"),
      sheet: sheetPart.replace(/^'|'$/g, "").replace(/''/g, "'"),
    }
  }

  return {
    ...row,
    range: scopedRange,
    a1Notation: scopedRange,
    value,
    sheetName: sheetKey,
    sheet: sheetKey,
  }
}

function normalizeMapEntries(
  map: Record<string, UniverCellValue>,
): Record<string, UniverCellValue> {
  const out: Record<string, UniverCellValue> = {}
  for (const [key, rawValue] of Object.entries(map)) {
    const value = normalizeUniverFormulaValue(rawValue)
    if (key.includes("!")) {
      out[key] = value
    } else {
      out[key] = value
    }
  }
  return out
}

function hasSheetsPayload(input: InjectUniverOfficeDataInput): boolean {
  return Boolean(
    (input.range != null && input.value !== undefined) ||
      (input.updates && input.updates.length > 0) ||
      (input.map && Object.keys(input.map).length > 0),
  )
}

/** activeTab · ?�력�????�론??aiDataSignal 빌드 */
export function buildUniverAiDataSignal(
  input: InjectUniverOfficeDataInput,
  activeTab: UniverOfficeActiveTab,
): UniverAiDataSignal | null {
  const tick = Date.now()

  if (activeTab === "docs") {
    const text = input.text?.trim()
    if (!text) return null
    return { tick, text }
  }

  if (activeTab === "slides") {
    return { tick }
  }

  if (input.updates && input.updates.length > 0) {
    return {
      tick,
      updates: input.updates.map(normalizeUpdateRow),
    }
  }

  if (input.map && Object.keys(input.map).length > 0) {
    return {
      tick,
      map: normalizeMapEntries(input.map),
    }
  }

  if (input.range != null && input.value !== undefined) {
    const rangeRef = String(input.range)
    const sheetScopedRange = buildSheetScopedRange(rangeRef, input.sheetName)
    const value = normalizeUniverFormulaValue(input.value)

    if (sheetScopedRange.includes("!")) {
      const bang = sheetScopedRange.lastIndexOf("!")
      const sheetPart = sheetScopedRange.slice(0, bang)
      const cellPart = sheetScopedRange.slice(bang + 1)
      return {
        tick,
        range: cellPart,
        value,
        sheetName: sheetPart.replace(/^'|'$/g, "").replace(/''/g, "'"),
      }
    }

    return {
      tick,
      range: sheetScopedRange,
      value,
      sheetName: input.sheetName,
    }
  }

  return null
}

/** MCP / AI SDK execute 본체 */
export function executeInjectUniverOfficeData(
  rawInput: unknown,
): InjectUniverOfficeDataResult {
  const parsed = injectUniverOfficeInputZod.safeParse(rawInput)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.message,
    }
  }

  const input = parsed.data
  const activeTab = input.activeTab ??
    inferUniverOfficeActiveTab(input.user_request)

  if (activeTab === "docs") {
    if (!input.text?.trim()) {
      return {
        ok: false,
        activeTab,
        error:
          "docs ??��??text ?�드(문서 본문)가 ?�요?�니?? user_request='기획???�줘' ?�태�?text???�체 초안???�으?�요.",
      }
    }
  } else if (activeTab === "sheets") {
    if (!hasSheetsPayload(input)) {
      return {
        ok: false,
        activeTab,
        error:
          "sheets ??��??range+value, updates 배열, map 객체 �??�나가 ?�요?�니??",
      }
    }
  }

  const aiDataSignal = buildUniverAiDataSignal(input, activeTab)
  if (!aiDataSignal) {
    return {
      ok: false,
      activeTab,
      error: "aiDataSignal ?�이로드�??�성?��? 못했?�니?? ?�력 ?�식???�인?�세??",
    }
  }

  return {
    ok: true,
    activeTab,
    aiDataSignal,
    message:
      `Univer ?�피??${activeTab} ??�� aiDataSignal 주입 준�??�료. tick=${aiDataSignal.tick}`,
  }
}

/** AI SDK tool() ?�토�???ai-chat mergedTools ??병합 */
export function createInjectUniverOfficeDataTool() {
  return tool({
    description: INJECT_UNIVER_OFFICE_DATA_MCP_DEFINITION.description,
    inputSchema: zodSchema(injectUniverOfficeInputZod),
    execute: async (input) => executeInjectUniverOfficeData(input),
  })
}
