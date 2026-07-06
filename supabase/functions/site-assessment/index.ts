/**
 * site-assessment — 현장 사진 기반 안전보건/품질관리 AI 평가 + 공식 보고서 생성
 *
 * POST body:
 *   image_data_url   string   data:image/...;base64,... (최대 5 MB)
 *   category         "safety" | "quality"
 *   preferred_model? "claude" | "gemini" | "hermes"  (기본: claude)
 *   metadata         object   보고서 기본 정보 (사업장명, 평가자 등)
 *   location?        string   촬영 장소 (metadata.location_detail 과 중복 허용)
 *   notes?           string   추가 맥락
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createAnthropic } from "npm:@ai-sdk/anthropic@3.0.78"
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google@3.0.75"
import { createOpenAI } from "npm:@ai-sdk/openai@3.0.64"
import { generateText, type LanguageModel } from "npm:ai@6.0.184"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"

import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts"

// ─────────────────────────────────────────────────────────────────────────────
// 시스템 프롬프트
// ─────────────────────────────────────────────────────────────────────────────

const SAFETY_SYSTEM = `당신은 대한민국 산업안전보건법 및 KOSHA 기준을 숙지한 안전보건관리자(산업안전기사 이상)입니다.
첨부된 현장 사진과 제공된 사업장 정보를 바탕으로 위험성평가 보고서를 작성하십시오.

반드시 아래 JSON 형식만 출력하십시오. JSON 외 텍스트를 절대 포함하지 마십시오.

{
  "overall_risk_level": "low|medium|high|critical",
  "summary": "2~3문장 종합 평가",
  "findings": [
    {
      "no": 1,
      "work_activity": "해당 작업/공정명",
      "hazard": "유해·위험요인 명칭",
      "hazard_type": "물리적|화학적|생물학적|인간공학적|심리사회적",
      "current_measures": "현재 안전보건 조치 상태",
      "probability": 1~5,
      "severity": 1~5,
      "risk_score": probability × severity 계산값,
      "risk_level": "low|medium|high|critical",
      "reduction_measures": "위험 감소대책 (공학적→관리적→PPE 순)",
      "residual_risk_level": "low|medium",
      "regulation": "관련 법규·기준 (산업안전보건기준에 관한 규칙 제N조 등)"
    }
  ],
  "compliant_items": ["현재 준수 중인 안전 사항"],
  "recommendations": ["중장기 개선 권고 사항"],
  "applicable_regulations": ["산업안전보건법 제N조", "KOSHA Guide 번호 등"],
  "report_text": "아래 형식의 마크다운 보고서 전문"
}

report_text 작성 규칙:
1. 아래 구조를 반드시 따를 것
2. 표는 마크다운 테이블로 작성
3. 위험성 = 가능성(1~5) × 중대성(1~5), 위험도: 1~4 낮음 / 5~9 보통 / 10~14 높음 / 15~25 매우높음
4. 메타데이터가 제공된 경우 반드시 반영할 것

report_text 형식 예시:
"# 위험성평가 보고서\\n\\n## 1. 평가 개요\\n| 항목 | 내용 |\\n|------|------|\\n| 사업장명 | (metadata.workplace) |\\n...\\n\\n## 2. 위험성 평가 결과\\n\\n### 위험성 평가표\\n| 번호 | 작업/공정 | 유해위험요인 | 위험요인 유형 | 현재 안전조치 | 가능성 | 중대성 | 위험성 점수 | 위험도 | 감소대책 | 잔류위험 | 관련법규 |\\n|---|---|...\\n\\n## 3. 사진 분석 소견\\n(사진에서 관찰된 구체적 상황 설명)\\n\\n## 4. 종합 의견 및 권고사항\\n(전문가 의견)\\n\\n## 5. 관련 법규 및 기준\\n- 산업안전보건법...\\n\\n---\\n*본 보고서는 AI 분석 결과로, 공식 평가 시 전문가 검토가 필요합니다.*"

평가 기준 (사진에서 확인할 항목):
- 개인보호구(PPE): 안전모·안전화·안전벨트·보호복 착용 여부
- 추락·낙하: 안전난간, 낙하물 방지망, 개구부 덮개
- 전기 안전: 임시배전반, 접지, 방호 조치
- 중장비: 안전거리, 신호수 배치, 접근금지
- 정리정돈: 통로 확보, 자재 적치 상태
- 화재·폭발: 인화성 물질 관리, 소화기 비치`

const QUALITY_SYSTEM = `당신은 대한민국 건설기술진흥법 및 KS 기준을 숙지한 품질관리 전문가(건설기술인)입니다.
첨부된 현장·시설물 사진과 제공된 시설물 정보를 바탕으로 품질검사 보고서를 작성하십시오.

반드시 아래 JSON 형식만 출력하십시오. JSON 외 텍스트를 절대 포함하지 마십시오.

{
  "overall_grade": "A|B|C|D|F",
  "quality_score": 0~100,
  "summary": "2~3문장 종합 평가",
  "defects": [
    {
      "no": 1,
      "location": "결함 위치 (사진 기준)",
      "defect_type": "결함 분류명 (균열/박리/누수/부식/변형 등)",
      "severity": "minor|major|critical",
      "size_description": "크기·범위 추정 (예: 폭 0.3mm 이상, 면적 약 0.5㎡)",
      "cause_analysis": "발생 원인 추정",
      "description": "상세 설명",
      "repair_method": "보수·보강 방법",
      "repair_priority": "즉시|단기(1개월내)|중기(6개월내)|장기",
      "standard_reference": "관련 기준 (KS F 코드, 시설물안전법 등)"
    }
  ],
  "conformant_items": ["기준에 적합한 시공·관리 사항"],
  "recommendations": ["장기 유지관리 권고 사항"],
  "applicable_standards": ["건설기술진흥법", "KS F 규격 코드", "시설물안전법 등"],
  "report_text": "아래 형식의 마크다운 보고서 전문"
}

report_text 작성 규칙:
1. 아래 구조를 반드시 따를 것
2. 표는 마크다운 테이블로 작성
3. 결함 등급: minor(경미)=보수권고 / major(중결함)=보수필요 / critical(중대결함)=즉시보수
4. 메타데이터가 제공된 경우 반드시 반영할 것

report_text 형식:
"# 품질검사 보고서\\n\\n## 1. 검사 개요\\n| 항목 | 내용 |\\n|------|------|\\n| 시설물명 | (metadata.facility_name) |\\n...\\n\\n## 2. 검사 결과\\n\\n### 종합 품질 등급\\n**등급: (grade) | 점수: (score)점**\\n\\n### 결함 현황표\\n| 번호 | 위치 | 결함 분류 | 심각도 | 규모 | 원인 | 보수 방법 | 우선순위 | 기준 |\\n|---|...\\n\\n## 3. 사진 분석 소견\\n(사진에서 관찰된 구체적 상황)\\n\\n## 4. 종합 의견\\n(전문가 의견 및 보수 계획 권고)\\n\\n## 5. 적용 기준\\n- 건설기술진흥법...\\n\\n---\\n*본 보고서는 AI 분석 결과로, 공식 검사 시 전문가 검토가 필요합니다.*"

평가 기준 (사진에서 확인할 항목):
- 균열: 폭·길이·패턴으로 구조적/비구조적 구분
- 마감: 도장, 타일, 방수층, 미장 품질
- 철근·콘크리트: 피복두께, 다짐, 양생 상태
- 방수·누수: 외벽, 지붕, 지하 침투 흔적
- 접합부: 용접, 볼트 체결, 조인트 상태
- 배관·설비: 설치, 지지대, 보온재 상태`

// ─────────────────────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────────────────────

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl.trim())
  if (!m) return null
  return { mimeType: m[1].toLowerCase(), base64: m[2].replace(/\s/g, "") }
}

function extractLevel(result: Record<string, unknown>, category: string): string {
  if (category === "safety") {
    const v = String(result.overall_risk_level ?? "").toLowerCase()
    return ["low", "medium", "high", "critical"].includes(v) ? v : "unknown"
  } else {
    const v = String(result.overall_grade ?? "").toUpperCase()
    return ["A", "B", "C", "D", "F"].includes(v) ? v : "unknown"
  }
}

/** 메타데이터를 사람이 읽기 좋은 텍스트 블록으로 변환 */
function metadataToContext(meta: Record<string, unknown>, category: string): string {
  if (!meta || Object.keys(meta).length === 0) return ""
  const lines: string[] = ["[보고서 기본 정보 - 반드시 보고서에 반영하십시오]"]
  if (category === "safety") {
    if (meta.workplace)        lines.push(`사업장명: ${meta.workplace}`)
    if (meta.project_name)     lines.push(`공사명/작업명: ${meta.project_name}`)
    if (meta.work_type)        lines.push(`작업 종류: ${meta.work_type}`)
    if (meta.work_stage)       lines.push(`공사 단계: ${meta.work_stage}`)
    if (meta.assessor_name)    lines.push(`평가자: ${meta.assessor_name}`)
    if (meta.department)       lines.push(`소속부서: ${meta.department}`)
    if (meta.assessment_date)  lines.push(`평가일: ${meta.assessment_date}`)
    if (meta.worker_count)     lines.push(`작업인원: ${meta.worker_count}`)
    if (meta.work_description) lines.push(`작업 내용: ${meta.work_description}`)
  } else {
    if (meta.facility_name)    lines.push(`시설물명/공사명: ${meta.facility_name}`)
    if (meta.inspection_area)  lines.push(`검사 부위: ${meta.inspection_area}`)
    if (meta.inspector_name)   lines.push(`검사자: ${meta.inspector_name}`)
    if (meta.department)       lines.push(`소속부서: ${meta.department}`)
    if (meta.inspection_date)  lines.push(`검사일: ${meta.inspection_date}`)
    if (meta.contractor)       lines.push(`시공사: ${meta.contractor}`)
    if (meta.completion_year)  lines.push(`준공연도: ${meta.completion_year}`)
    if (meta.facility_age)     lines.push(`경과연수: ${meta.facility_age}년`)
    if (meta.building_use)     lines.push(`시설물 용도: ${meta.building_use}`)
  }
  return lines.join("\n")
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight
  if (req.method !== "POST") return jsonResponse({ error: "POST required." }, 405)

  const auth = req.headers.get("Authorization")
  if (!auth?.startsWith("Bearer ")) return jsonResponse({ error: "인증이 필요합니다." }, 401)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

  const anonClient = createClient(supabaseUrl, supabaseAnon)
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(auth.slice(7))
  if (authErr || !user) return jsonResponse({ error: "유효하지 않은 세션입니다." }, 401)

  let body: {
    image_data_url?: string
    category?: string
    location?: string
    notes?: string
    preferred_model?: string
    metadata?: Record<string, unknown>
  }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: "요청 본문을 파싱할 수 없습니다." }, 400)
  }

  const { image_data_url, category, location, notes, preferred_model, metadata = {} } = body
  const modelPref = (preferred_model ?? "claude").toLowerCase()

  if (!image_data_url) return jsonResponse({ error: "image_data_url이 필요합니다." }, 400)
  if (category !== "safety" && category !== "quality") {
    return jsonResponse({ error: "category는 'safety' 또는 'quality'여야 합니다." }, 400)
  }

  const parsed = parseDataUrl(image_data_url)
  if (!parsed) return jsonResponse({ error: "올바른 이미지 data URL이 아닙니다." }, 400)

  if (Math.ceil(parsed.base64.length * 0.75) > 5 * 1024 * 1024) {
    return jsonResponse({ error: "이미지 크기가 5MB를 초과합니다." }, 400)
  }

  // 모델 초기화
  let visionModel: LanguageModel
  let resolvedModelName: string
  try {
    if (modelPref === "gemini") {
      const key = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY") ?? ""
      if (!key) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.")
      visionModel = createGoogleGenerativeAI({ apiKey: key })("gemini-2.5-flash")
      resolvedModelName = "gemini-2.5-flash"
    } else if (modelPref === "hermes") {
      const key = Deno.env.get("HERMES_API_KEY") ?? ""
      const base = Deno.env.get("HERMES_API_BASE_URL") ?? ""
      if (!key || !base) throw new Error("HERMES_API_KEY / HERMES_API_BASE_URL가 설정되지 않았습니다.")
      const id = Deno.env.get("HERMES_MODEL_ID") ?? "hermes-default"
      visionModel = createOpenAI({ apiKey: key, baseURL: base })(id)
      resolvedModelName = id
    } else {
      const key = Deno.env.get("ANTHROPIC_API_KEY") ?? Deno.env.get("CORP_ANTHROPIC_API_KEY") ?? ""
      if (!key) throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다.")
      visionModel = createAnthropic({ apiKey: key })("claude-sonnet-4-6")
      resolvedModelName = "claude-sonnet-4-6"
    }
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "모델 초기화 실패" }, 503)
  }

  // 사용자 메시지 구성
  const systemPrompt = category === "safety" ? SAFETY_SYSTEM : QUALITY_SYSTEM
  const metaContext = metadataToContext(metadata, category)
  const extraContext = [
    location ? `촬영 장소: ${location}` : null,
    notes ? `추가 맥락: ${notes}` : null,
    metaContext || null,
  ].filter(Boolean).join("\n\n")

  const userText = extraContext
    ? `다음 현장 사진을 분석하고 보고서를 작성해주세요.\n\n${extraContext}`
    : "다음 현장 사진을 분석하고 보고서를 작성해주세요."

  // AI 호출
  let rawText = ""
  try {
    const { text } = await generateText({
      model: visionModel,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image: parsed.base64,
              mimeType: parsed.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            },
            { type: "text", text: userText },
          ],
        },
      ],
      maxTokens: 4096,
      temperature: 0.1,
    })
    rawText = text
  } catch (e) {
    console.error(`[site-assessment] ${resolvedModelName} 호출 실패:`, e)
    return jsonResponse({ error: "AI 분석 중 오류가 발생했습니다." }, 500)
  }

  // JSON 파싱
  let result: Record<string, unknown>
  try {
    const m = /\{[\s\S]*\}/m.exec(rawText)
    result = JSON.parse(m ? m[0] : rawText)
  } catch {
    return jsonResponse({ error: "AI 응답 파싱 실패", raw: rawText.slice(0, 300) }, 500)
  }

  const overall_level = extractLevel(result, category)
  const report_text = typeof result.report_text === "string" ? result.report_text : null

  // report_text를 result에서 분리 저장 (result jsonb 크기 절약)
  const resultWithoutReport = { ...result }
  delete resultWithoutReport.report_text

  const image_thumb_b64 = parsed.base64.length <= 68000 ? image_data_url : null

  const serviceClient = createClient(supabaseUrl, supabaseServiceKey)
  const { data: saved, error: dbErr } = await serviceClient
    .from("site_assessments")
    .insert({
      user_id: user.id,
      category,
      location: location ?? null,
      notes: notes ?? null,
      image_thumb_b64,
      result: resultWithoutReport,
      overall_level,
      preferred_model: resolvedModelName,
      report_metadata: metadata,
      report_text,
    })
    .select("id, created_at")
    .single()

  if (dbErr) console.error("[site-assessment] DB 저장 실패:", dbErr)

  return jsonResponse({
    ok: true,
    id: saved?.id ?? null,
    model: resolvedModelName,
    category,
    overall_level,
    result: resultWithoutReport,
    report_text,
    created_at: saved?.created_at ?? new Date().toISOString(),
  })
})
