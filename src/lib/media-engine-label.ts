import type { AiModelRow } from '../types/ai-models'

/** 선택된 미디어 엔진의 표시명 (목록에 없으면 모델 ID 그대로) */
export function mediaEngineLabel(
  engines: readonly AiModelRow[] | null | undefined,
  selectedModelId: string,
): string {
  const safeEngines: readonly AiModelRow[] = Array.isArray(engines)
    ? engines
    : []
  const match = safeEngines.find((engine) => engine?.api_id === selectedModelId)
  return match?.display_name ?? selectedModelId
}
