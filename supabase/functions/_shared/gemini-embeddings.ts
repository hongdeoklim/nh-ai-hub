const EMBED_MODEL = "gemini-embedding-2"
const EMBED_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`

export const GEMINI_EMBEDDING_DIM = 768
/** nh_knowledge_nodes(VECTOR(1536)) 용 — 임베딩 일원화 표준 */
export const GEMINI_KG_EMBEDDING_DIM = 1536
/** nh_knowledge_nodes.embedding_model 에 기록하는 표준 태그 */
export const GEMINI_KG_EMBEDDING_MODEL_TAG = `${EMBED_MODEL}@${GEMINI_KG_EMBEDDING_DIM}`

type EmbedApiResponse = {
  embedding?: { values?: number[] }
  error?: { message?: string }
}

/** Gemini gemini-embedding-2 — outputDimensionality 지정 임베딩 */
export async function embedTextWithGeminiDim(
  apiKey: string,
  text: string,
  dim: number,
): Promise<number[]> {
  const url = `${EMBED_URL}?key=${encodeURIComponent(apiKey)}`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text: text.trim().slice(0, 8000) }] },
      outputDimensionality: dim,
    }),
  })

  const body = (await res.json()) as EmbedApiResponse
  if (!res.ok) {
    const msg = body.error?.message ?? (await res.text().catch(() => ""))
    throw new Error(`Gemini embed HTTP ${res.status}: ${msg}`.slice(0, 400))
  }

  const values = body.embedding?.values
  if (!values?.length) {
    throw new Error("Gemini embed 응답에 embedding.values 가 없습니다.")
  }
  if (values.length !== dim) {
    throw new Error(`예상 임베딩 차원 ${dim}, 실제 ${values.length}`)
  }
  return values
}

/** company_documents · rag-ingest 와 동일: Gemini gemini-embedding-2 (768차원) */
export function embedTextWithGemini(
  apiKey: string,
  text: string,
): Promise<number[]> {
  return embedTextWithGeminiDim(apiKey, text, GEMINI_EMBEDDING_DIM)
}
