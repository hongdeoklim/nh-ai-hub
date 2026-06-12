const EMBED_MODEL = "gemini-embedding-2"
const EMBED_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`

export const GEMINI_EMBEDDING_DIM = 768

type EmbedApiResponse = {
  embedding?: { values?: number[] }
  error?: { message?: string }
}

/** company_documents · rag-ingest 와 동일: Gemini gemini-embedding-2 (768차원) */
export async function embedTextWithGemini(
  apiKey: string,
  text: string,
): Promise<number[]> {
  const url = `${EMBED_URL}?key=${encodeURIComponent(apiKey)}`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text: text.trim().slice(0, 8000) }] },
      outputDimensionality: GEMINI_EMBEDDING_DIM,
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
  if (values.length !== GEMINI_EMBEDDING_DIM) {
    throw new Error(
      `예상 임베딩 차원 ${GEMINI_EMBEDDING_DIM}, 실제 ${values.length}`,
    )
  }
  return values
}
