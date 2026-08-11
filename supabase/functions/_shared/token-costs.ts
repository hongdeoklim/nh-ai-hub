/**
 * NH AI Inside Hub - AI 모델별 토큰 가중치 (비용 추산용)
 *
 * 실제 API 단가 비율을 반영해 '사내 표준 토큰(NH Credits)'으로 환산하는
 * 배율(Weight)을 정의합니다. 기준: gemini-2.5-flash = 1.
 *
 * 주의: 키는 "실제 프로바이더 호출 ID"의 접두사(prefix)로 매칭됩니다.
 * (예: "claude-sonnet-4-5-20250929" → "claude-sonnet" 매칭)
 * 새 모델을 추가하면 여기와 ai_models 테이블 가중치를 함께 갱신할 것.
 */

export const TOKEN_COST_WEIGHTS: Record<string, number> = {
  // --- 저가형 (1배수 기준) ---
  "gemini-2.5-flash-lite": 1,
  "gemini-2.5-flash": 1,
  "gemini-1.5-flash": 1,
  "gpt-4o-mini": 1,
  "gpt-5-nano": 1,
  "gpt-5-mini": 1,
  "deepseek": 1,

  // --- 중간 ---
  "claude-3-5-haiku": 3,
  "claude-haiku": 3,
  "o3-mini": 4,
  "o4-mini": 4,

  // --- 사내 AI (Dify): RAG 임베딩 + 내부 LLM 비용 추산 ---
  "dify-ax": 5,

  // --- 고성능 ---
  "gemini-2.5-pro": 8,
  "gemini-1.5-pro": 8,
  "gpt-4o": 8,
  "gpt-4-turbo": 8,
  "gpt-5": 8, // gpt-5-mini/nano 는 위에서 먼저 매칭됨(최장 접두사 우선)
  "gpt-5.5": 8,

  // --- Claude Sonnet 계열 ---
  "claude-3-5-sonnet": 12,
  "claude-3-7-sonnet": 12,
  "claude-sonnet": 12,

  // --- 최고가 (Opus 계열) ---
  "claude-3-opus": 50,
  "claude-opus": 50,
}

// 최장 접두사 우선 매칭을 위해 미리 정렬해 둔다.
const WEIGHT_KEYS_BY_LENGTH = Object.keys(TOKEN_COST_WEIGHTS)
  .sort((a, b) => b.length - a.length)

/**
 * 모델 ID의 가중치를 반환합니다. 정확 일치 → 최장 접두사 매칭 순서로 찾고,
 * 목록에 없으면 안전하게 5배수(중간값)를 기본으로 적용합니다.
 */
export function getTokenWeight(modelId: string): number {
  const normalizedId = modelId.toLowerCase().trim()
  const exact = TOKEN_COST_WEIGHTS[normalizedId]
  if (exact !== undefined) return exact
  for (const key of WEIGHT_KEYS_BY_LENGTH) {
    if (normalizedId.startsWith(key)) return TOKEN_COST_WEIGHTS[key]
  }
  return 5
}
