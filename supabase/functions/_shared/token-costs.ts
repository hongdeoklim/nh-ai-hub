/**
 * NH AI Inside Hub - AI 모델별 토큰 가중치 (비용 추산용)
 * 
 * 구글/OpenAI/Anthropic의 실제 API 비용 비율을 반영하여,
 * '사내 표준 토큰(NH Credits)'으로 환산하기 위한 배율(Weight)을 정의합니다.
 */

export const TOKEN_COST_WEIGHTS: Record<string, number> = {
  // --- 저가형 모델 (1배수 기준) ---
  "gemini-2.5-flash": 1,
  "gpt-4o-mini": 1,
  "claude-3-haiku-20240307": 1,

  // --- 사내 AI (Dify) ---
  // RAG 벡터 검색(Embeddings) 비용 + 내부 LLM 비용 추산
  "dify-ax": 5,

  // --- 고성능/고비용 모델 ---
  "gpt-4o": 10,
  "claude-3-5-sonnet-20241022": 10,
  "gemini-2.5-pro": 10,
}

/**
 * 모델 ID를 입력받아 가중치를 반환합니다.
 * 목록에 없으면 안전하게 5배수(중간값)를 기본으로 적용합니다.
 */
export function getTokenWeight(modelId: string): number {
  const normalizedId = modelId.toLowerCase().trim()
  return TOKEN_COST_WEIGHTS[normalizedId] || 5
}
