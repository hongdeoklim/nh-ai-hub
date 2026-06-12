/**
 * NH AI Hub — 멀티 LLM 미디어 오케스트레이터
 *
 * - 이미지: activeModel 이 gpt* 이면 DALL·E 3, 그 외(Gemini/Claude) Imagen 3
 * - 동영상: 모델별 기획·라우팅 안내 (REST 이미지 생성과 분리)
 */
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts"
import { normalizePreferredAiToResolvedModel } from "../_shared/normalize-preferred-ai-model.ts"

const IMAGEN_3_MODEL = "imagen-3.0-generate-002"
const DALLE_3_MODEL = "dall-e-3"
const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations"
const IMAGEN_GENERATE_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_3_MODEL}:generateImages`

export type MediaRouterRequest = {
  activeModel: string
  actionType: "image" | "video"
  prompt: string
  model_id?: string
}

export type MediaRouterSuccess = {
  markdown: string
  provider: string
  model: string
  routedVia: string
}

export type MediaRouterResult =
  | { ok: true; data: MediaRouterSuccess }
  | { ok: false; error: string; status: number }

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

function readGeminiKey(): string | undefined {
  return readEnv("GEMINI_API_KEY") ?? readEnv("GOOGLE_GENERATIVE_AI_API_KEY")
}

type ModelFamily = "google" | "openai" | "anthropic"

function resolveModelFamily(activeModel: string): ModelFamily {
  const raw = activeModel.trim().toLowerCase()
  if (raw.includes("gemini") || raw === "google" || raw === "auto") {
    return "google"
  }
  if (
    raw.includes("gpt") ||
    raw.includes("openai") ||
    raw.startsWith("o1") ||
    raw.startsWith("o3") ||
    raw.startsWith("o4")
  ) {
    return "openai"
  }
  if (raw.includes("claude") || raw.includes("anthropic")) {
    return "anthropic"
  }
  const { kind } = normalizePreferredAiToResolvedModel(activeModel)
  return kind
}

function resolveImageBackend(modelId: string, activeModel: string): {
  useOpenAi: boolean
  openAiModel: string
  imagenModel: string
} {
  const id = modelId.trim().toLowerCase()
  if (id.length > 0) {
    const useOpenAi =
      id.includes("dall-e") ||
      id.startsWith("gpt") ||
      id.includes("openai")
    return {
      useOpenAi,
      openAiModel: useOpenAi ? (modelId.trim() || DALLE_3_MODEL) : DALLE_3_MODEL,
      imagenModel: useOpenAi ? IMAGEN_3_MODEL : (modelId.trim() || IMAGEN_3_MODEL),
    }
  }
  const useOpenAi = activeModel.toLowerCase().startsWith("gpt")
  return {
    useOpenAi,
    openAiModel: DALLE_3_MODEL,
    imagenModel: IMAGEN_3_MODEL,
  }
}

/** 이미지 생성 — DALL·E 3 / Imagen 3 직접 REST 호출 */
export async function handleMediaGeneration(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  try {
    const body = await req.json() as {
      activeModel?: string
      prompt?: string
      model_id?: string
    }
    const activeModel = (body.activeModel ?? "").trim()
    const prompt = (body.prompt ?? "").trim()
    const modelId = typeof body.model_id === "string" ? body.model_id.trim() : ""

    if (!prompt.length) {
      return jsonResponse({ success: false, error: "prompt 가 필요합니다." }, 400)
    }

    const { useOpenAi, openAiModel, imagenModel } = resolveImageBackend(
      modelId,
      activeModel,
    )

    if (useOpenAi) {
      const apiKey = readEnv("OPENAI_API_KEY")
      if (!apiKey) {
        return jsonResponse(
          { success: false, error: "OPENAI_API_KEY 가 설정되지 않았습니다." },
          500,
        )
      }

      const res = await fetch(OPENAI_IMAGES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: openAiModel,
          prompt,
          n: 1,
          size: "1024x1024",
          response_format: "b64_json",
        }),
      })

      if (!res.ok) {
        let detail = res.statusText
        try {
          const errBody = await res.json() as { error?: { message?: string } }
          detail = errBody.error?.message ?? detail
        } catch {
          detail = (await res.text().catch(() => detail)) || detail
        }
        return jsonResponse({ success: false, error: detail }, 500)
      }

      const result = await res.json() as {
        data?: Array<{ b64_json?: string }>
      }
      const b64 = result.data?.[0]?.b64_json
      if (!b64) {
        return jsonResponse(
          { success: false, error: "DALL·E 3 응답에 이미지 데이터가 없습니다." },
          500,
        )
      }

      return jsonResponse({
        success: true,
        mediaUrl: `data:image/jpeg;base64,${b64}`,
      })
    }

    const geminiKey = readGeminiKey()
    if (!geminiKey) {
      return jsonResponse({
        success: false,
        error:
          "GEMINI_API_KEY(또는 GOOGLE_GENERATIVE_AI_API_KEY)가 설정되지 않았습니다.",
      }, 500)
    }

    const imagenGenerateUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(imagenModel)}:generateImages`

    const imagenRes = await fetch(
      `${imagenGenerateUrl}?key=${encodeURIComponent(geminiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          numberOfImages: 1,
          outputMimeType: "image/jpeg",
          aspectRatio: "1:1",
        }),
      },
    )

    if (!imagenRes.ok) {
      let detail = imagenRes.statusText
      try {
        const errBody = await imagenRes.json() as { error?: { message?: string } }
        detail = errBody.error?.message ?? detail
      } catch {
        detail = (await imagenRes.text().catch(() => detail)) || detail
      }
      return jsonResponse({ success: false, error: detail }, 500)
    }

    const imagenResult = await imagenRes.json() as {
      generatedImages?: Array<{ image?: { imageBytes?: string } }>
    }
    const imageBytes = imagenResult.generatedImages?.[0]?.image?.imageBytes
    if (!imageBytes) {
      return jsonResponse(
        { success: false, error: "Imagen 3 응답에 이미지 데이터가 없습니다." },
        500,
      )
    }

    return jsonResponse({
      success: true,
      mediaUrl: `data:image/jpeg;base64,${imageBytes}`,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return jsonResponse({ success: false, error: message }, 500)
  }
}

function buildVideoGuidanceMarkdown(
  prompt: string,
  family: ModelFamily,
  proxied = false,
  mediaModelId = "",
): MediaRouterSuccess {
  const engineLabel = mediaModelId.trim().length > 0
    ? mediaModelId.trim()
    : family === "google"
    ? "Google Veo"
    : family === "openai"
    ? "OpenAI Sora"
    : "Google Veo (proxy)"

  const lines = [
    "### 동영상 만들기 (멀티 LLM 라우팅)",
    "",
    "| 선택 엔진 | 라우팅 |",
    "|-----------|--------|",
    `| **${engineLabel}** | ${
      family === "google"
        ? "Google Veo / Video FX (Gemini 생태계)"
        : family === "openai"
        ? "OpenAI Sora (별도 접근)"
        : "Claude → **Google Veo** 대리 안내"
    } |`,
    "",
    "#### 요청 장면",
    prompt,
    "",
    "#### 추천 스토리보드 (3컷)",
    "1. **도입** — 장면·피사체 소개",
    "2. **전개** — 핵심 동작·카메라",
    "3. **마무리** — 메시지·CTA",
    "",
  ]

  if (proxied) {
    lines.push(
      "> Claude는 동영상 생성 API가 없습니다. **Google AI Studio Veo**에서 동일 프롬프트로 시도하거나, 「이미지 만들기」로 키 프레임을 생성하세요.",
    )
  } else if (family === "google") {
    lines.push(
      "> [Google AI Studio · Veo](https://aistudio.google.com/)에서 동영상 생성을 시도할 수 있습니다.",
    )
  } else {
    lines.push(
      "> OpenAI Sora는 별도 권한이 필요합니다. Google Veo 또는 「이미지 만들기」 키 프레임 워크플로를 권장합니다.",
    )
  }

  lines.push(
    "",
    "_이 포털 REST 경로는 동영상 **기획·라우팅 안내**를 제공합니다. 키 프레임은 Imagen 3 이미지 생성을 사용하세요._",
  )

  return {
    markdown: lines.join("\n"),
    provider: proxied ? "google-veo-proxy-for-claude" : family,
    model: mediaModelId.trim().length > 0 ? mediaModelId.trim() : "video-guidance",
    routedVia: proxied
      ? "google-veo-proxy-for-claude"
      : `${family}-video-guidance`,
  }
}

function routeVideoGeneration(
  prompt: string,
  family: ModelFamily,
  mediaModelId = "",
): MediaRouterResult {
  if (family === "anthropic") {
    return {
      ok: true,
      data: buildVideoGuidanceMarkdown(prompt, family, true, mediaModelId),
    }
  }
  return {
    ok: true,
    data: buildVideoGuidanceMarkdown(prompt, family, false, mediaModelId),
  }
}

/** 동영상 기획·라우팅 안내 (이미지는 handleMediaGeneration 사용) */
export async function handleMediaRouterRequest(
  input: MediaRouterRequest,
): Promise<MediaRouterResult> {
  const activeModel = input.activeModel?.trim() ?? ""
  const prompt = input.prompt?.trim() ?? ""
  const mediaModelId = input.model_id?.trim() ?? ""

  if (!prompt.length) {
    return { ok: false, error: "prompt 가 필요합니다.", status: 400 }
  }

  if (input.actionType !== "video") {
    return {
      ok: false,
      error: "actionType 은 video 여야 합니다.",
      status: 400,
    }
  }

  const family = mediaModelId.length > 0
    ? (mediaModelId.toLowerCase().includes("sora") ||
        mediaModelId.toLowerCase().includes("openai") ||
        mediaModelId.toLowerCase().startsWith("gpt")
      ? "openai"
      : mediaModelId.toLowerCase().includes("claude") ||
          mediaModelId.toLowerCase().includes("anthropic")
      ? "anthropic"
      : "google")
    : resolveModelFamily(
      activeModel.length > 0 ? activeModel : "gemini-2.5-flash",
    )

  return routeVideoGeneration(prompt, family, mediaModelId)
}
