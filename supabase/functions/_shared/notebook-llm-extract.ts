import { createAnthropic } from "npm:@ai-sdk/anthropic@3.0.78"
import { createOpenAI } from "npm:@ai-sdk/openai@3.0.64"
import { generateText } from "npm:ai@6.0.184"

export type ExtractedEntity = {
  entity_type: string
  entity_value: string
  confidence: number
}

export type ExtractedRelation = {
  target_document_id: string
  relation_type: string
  description: string
  weight: number
}

export type LlmExtractionResult = {
  entities: ExtractedEntity[]
  relations: ExtractedRelation[]
}

type PeerDocSummary = {
  id: string
  fileName: string
  snippet: string
  existingEntities: string[]
}

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

function parseExtractionJson(raw: string): LlmExtractionResult | null {
  const trimmed = raw.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed)
  const candidate = fence ? fence[1].trim() : trimmed
  try {
    const parsed = JSON.parse(candidate) as {
      entities?: unknown
      relations?: unknown
    }
    const entities: ExtractedEntity[] = []
    if (Array.isArray(parsed.entities)) {
      for (const e of parsed.entities) {
        if (!e || typeof e !== "object") continue
        const row = e as Record<string, unknown>
        const value = String(row.entity_value ?? row.value ?? "").trim()
        if (!value) continue
        entities.push({
          entity_type: String(row.entity_type ?? row.type ?? "keyword").trim(),
          entity_value: value.slice(0, 200),
          confidence: Math.min(
            1,
            Math.max(0, Number(row.confidence ?? 0.7) || 0.7),
          ),
        })
      }
    }

    const relations: ExtractedRelation[] = []
    if (Array.isArray(parsed.relations)) {
      for (const r of parsed.relations) {
        if (!r || typeof r !== "object") continue
        const row = r as Record<string, unknown>
        const targetId = String(
          row.target_document_id ?? row.target_id ?? "",
        ).trim()
        if (!targetId) continue
        relations.push({
          target_document_id: targetId,
          relation_type: String(row.relation_type ?? row.type ?? "related")
            .trim()
            .slice(0, 64),
          description: String(row.description ?? "").trim().slice(0, 500),
          weight: Math.min(1, Math.max(0, Number(row.weight ?? 0.6) || 0.6)),
        })
      }
    }

    return { entities, relations }
  } catch {
    return null
  }
}

export async function extractEntitiesAndRelations(
  currentFileName: string,
  documentText: string,
  currentDocumentId: string,
  peerDocs: PeerDocSummary[],
): Promise<LlmExtractionResult> {
  const anthropicKey = readEnv("ANTHROPIC_API_KEY")
  const openaiKey = readEnv("OPENAI_API_KEY")

  const peerBlock =
    peerDocs.length === 0
      ? "(비교 대상 문서 없음)"
      : peerDocs
          .map(
            (p) =>
              `- id: ${p.id}\n  파일: ${p.fileName}\n  기존개체: ${p.existingEntities.join(", ") || "없음"}\n  요약: ${p.snippet.slice(0, 400)}`,
          )
          .join("\n\n")

  const prompt = `당신은 사내 문서 지식 그래프 분석기입니다.
현재 문서에서 핵심 개체를 추출하고, 아래 다른 문서들과의 연관 관계를 JSON으로만 반환하세요.

## 현재 문서
- id: ${currentDocumentId}
- 파일명: ${currentFileName}

## 본문 (일부)
${documentText.slice(0, 12000)}

## 비교 대상 문서
${peerBlock}

## 출력 JSON 스키마 (이 형식만)
{
  "entities": [
    { "entity_type": "location|material|person|project|keyword|date", "entity_value": "문자열", "confidence": 0.0~1.0 }
  ],
  "relations": [
    { "target_document_id": "uuid", "relation_type": "same_location|same_material|same_project|references|semantic_similarity", "description": "한국어 설명", "weight": 0.0~1.0 }
  ]
}

규칙:
- entities는 3~12개, 중복·너무 일반적인 단어(문서, 내용) 제외
- relations는 실제로 본문·비교 문서에서 연결 근거가 있을 때만 (0~5개)
- target_document_id는 반드시 비교 대상 목록의 id만 사용
- JSON 외 텍스트 금지`

  const modelId =
    readEnv("NOTEBOOK_EXTRACT_MODEL") ??
    "claude-3-5-sonnet-20241022"

  let raw = ""

  if (anthropicKey) {
    const anthropic = createAnthropic({ apiKey: anthropicKey })
    const { text } = await generateText({
      model: anthropic(modelId),
      prompt,
      maxOutputTokens: 2048,
    })
    raw = text
  } else if (openaiKey) {
    const openai = createOpenAI({ apiKey: openaiKey })
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      prompt,
      maxOutputTokens: 2048,
    })
    raw = text
  } else {
    return heuristicExtract(currentFileName, documentText, peerDocs)
  }

  const parsed = parseExtractionJson(raw)
  if (parsed) return parsed
  return heuristicExtract(currentFileName, documentText, peerDocs)
}

function heuristicExtract(
  fileName: string,
  text: string,
  peerDocs: PeerDocSummary[],
): LlmExtractionResult {
  const tokens = text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && w.length <= 24)
  const freq = new Map<string, number>()
  for (const t of tokens) {
    const lower = t.toLowerCase()
    if (lower.length < 2) continue
    freq.set(lower, (freq.get(lower) ?? 0) + 1)
  }
  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w)

  const entities: ExtractedEntity[] = [
    {
      entity_type: "keyword",
      entity_value: fileName.replace(/\.[^.]+$/, ""),
      confidence: 0.9,
    },
    ...top.map((w) => ({
      entity_type: "keyword" as const,
      entity_value: w,
      confidence: 0.55,
    })),
  ]

  const relations: ExtractedRelation[] = []
  const currentSet = new Set(top)
  for (const peer of peerDocs.slice(0, 10)) {
    const overlap = peer.existingEntities.filter((e) =>
      currentSet.has(e.toLowerCase()),
    )
    if (overlap.length > 0) {
      relations.push({
        target_document_id: peer.id,
        relation_type: "semantic_similarity",
        description: `공통 키워드: ${overlap.slice(0, 3).join(", ")}`,
        weight: Math.min(0.85, 0.4 + overlap.length * 0.1),
      })
    }
  }

  return { entities, relations }
}

export type { PeerDocSummary }
