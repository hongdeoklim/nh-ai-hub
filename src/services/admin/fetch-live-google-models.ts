import { readSupabaseEnv } from '../../utils/supabaseClient'
import { fetchEdgeFunction } from '../ai/api'

/** Google Generative Language API 에서 현재 사용 가능한 models/* 이름 집합 */
export async function fetchLiveGoogleModelIds(
  accessToken: string,
): Promise<Set<string> | null> {
  try {
    const { url } = readSupabaseEnv()
    const res = await fetchEdgeFunction('list-gemini-models', {
      method: 'POST',
      accessToken,
    })

    if (!res.ok) {
      console.warn('[ai-models-sync] list-gemini-models failed:', res.status)
      return null
    }

    const body = (await res.json()) as { models?: string[]; ok?: boolean }
    if (!body.ok || !Array.isArray(body.models)) {
      return null
    }

    return new Set(
      body.models
        .map((name) => name.trim())
        .filter((name) => name.length > 0),
    )
  } catch (err) {
    console.warn('[ai-models-sync] live Google model fetch error:', err)
    return null
  }
}

/** api_id 가 Google live 목록에 있는지 (목록 조회 실패 시 통과) */
export function isGoogleModelLive(
  apiId: string,
  liveGoogleIds: Set<string> | null,
): boolean {
  if (!liveGoogleIds || liveGoogleIds.size === 0) return true
  const id = apiId.trim()
  if (liveGoogleIds.has(id)) return true
  // imagen/veo 등 별도 엔드포인트 — generateContent models 목록에 없을 수 있음
  if (/^imagen-/i.test(id) || /^veo-/i.test(id)) return true
  if (/^gemini-.*-(image|tts|live)/i.test(id)) {
    return [...liveGoogleIds].some(
      (live) => live === id || live.startsWith(`${id}-`) || id.startsWith(live),
    )
  }
  return false
}
