/**
 * NH AI Hub — Edge Function `creative-generate`
 * 이미지(Gemini Imagen / OpenAI DALL·E), 동영상(기획·안내), 음성(Gemini TTS)
 * Anthropic: 이미지·동영상·TTS 공식 생성 API 없음 → 안내 메시지
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createGoogleGenerativeAI } from "npm:@ai-sdk/google@3.0.75"
import { createOpenAI } from "npm:@ai-sdk/openai@3.0.64"
import { generateImage } from "npm:ai@6.0.184"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"

import { normalizePreferredAiToResolvedModel } from "../_shared/normalize-preferred-ai-model.ts"
import {
  handleCorsPreflight,
  jsonResponse,
} from "../_shared/cors.ts"

type CreativeTool = "image" | "video" | "speech"

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

function readGeminiKey(): string | undefined {
  return readEnv("GEMINI_API_KEY") ?? readEnv("GOOGLE_GENERATIVE_AI_API_KEY")
}

function resolveProvider(preferredAi: string): "google" | "openai" | "anthropic" {
  const { kind } = normalizePreferredAiToResolvedModel(preferredAi)
  return kind
}

async function generateImageForPrompt(
  prompt: string,
  preferredAi: string,
): Promise<
  { ok: true; markdown: string; provider: string; model: string } | {
    ok: false
    error: string
  }
> {
  const provider = resolveProvider(preferredAi)

  if (provider === "anthropic") {
    return {
      ok: false,
      error:
        "Anthropic Claude는 이미지 생성 API를 제공하지 않습니다. 모델을 Google(Gemini) 또는 OpenAI(GPT)로 선택해 주세요.",
    }
  }

  const tryGoogle = async () => {
    const apiKey = readGeminiKey()
    if (!apiKey) return null
    const google = createGoogleGenerativeAI({ apiKey })
    const modelId = "gemini-2.5-flash-image"
    const { image } = await generateImage({
      model: google.image(modelId),
      prompt,
      aspectRatio: "16:9",
    })
    const base64 = image.base64
    const mediaType = image.mediaType ?? "image/png"
    const dataUrl = `data:${mediaType};base64,${base64}`
    return {
      markdown:
        `### 생성 이미지 (Google Gemini · ${modelId})\n\n![${prompt.slice(0, 80)}](${dataUrl})\n\n` +
        `_프롬프트: ${prompt}_`,
      provider: "google",
      model: modelId,
    }
  }

  const tryOpenAi = async () => {
    const apiKey = readEnv("OPENAI_API_KEY")
    if (!apiKey) return null
    const openai = createOpenAI({ apiKey })
    const modelId = "dall-e-3"
    const { image } = await generateImage({
      model: openai.image(modelId),
      prompt,
      size: "1792x1024",
    })
    const base64 = image.base64
    const mediaType = image.mediaType ?? "image/png"
    const dataUrl = `data:${mediaType};base64,${base64}`
    return {
      markdown:
        `### 생성 이미지 (OpenAI · ${modelId})\n\n![${prompt.slice(0, 80)}](${dataUrl})\n\n` +
        `_프롬프트: ${prompt}_`,
      provider: "openai",
      model: modelId,
    }
  }

  try {
    if (provider === "google") {
      const g = await tryGoogle()
      if (g) return { ok: true, ...g }
      const o = await tryOpenAi()
      if (o) return { ok: true, ...o }
    } else {
      const o = await tryOpenAi()
      if (o) return { ok: true, ...o }
      const g = await tryGoogle()
      if (g) return { ok: true, ...g }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `이미지 생성 실패: ${msg}` }
  }

  return {
    ok: false,
    error:
      "이미지 생성 API 키가 없습니다. Supabase Secrets에 GEMINI_API_KEY 또는 OPENAI_API_KEY 를 설정하세요.",
  }
}

async function generateVideoGuidance(
  prompt: string,
  preferredAi: string,
): Promise<{ ok: true; markdown: string; provider: string; model: string }> {
  const provider = resolveProvider(preferredAi)
  const lines = [
    "### 동영상 만들기 (API 안내)",
    "",
    "브라우저에서 직접 호출 가능한 **공식 REST 동영상 생성**은 제한적입니다.",
    "",
    "| 제공자 | 서비스 | 비고 |",
    "|--------|--------|------|",
    "| **Google** | [Veo / Video FX](https://aistudio.google.com/) | Gemini 계열 동영상(프리뷰) |",
    "| **OpenAI** | [Sora](https://openai.com/sora) | 별도 제품·API 제한 |",
    "| **Anthropic** | — | 동영상 생성 API 없음 |",
    "",
    "#### 요청하신 장면",
    prompt,
    "",
  ]

  if (provider === "anthropic") {
    lines.push(
      "> 현재 **Claude** 모델은 동영상 생성 API가 없습니다. **Gemini** 또는 **OpenAI** 모델을 선택하거나, 위 Google AI Studio에서 Veo를 사용해 주세요.",
    )
  } else if (provider === "google") {
    lines.push(
      "> **Google Veo**는 [Google AI Studio](https://aistudio.google.com/)에서 동일 API 키로 시도할 수 있습니다. 이 포털에서는 장면 기획·스토리보드 텍스트를 제공합니다.",
    )
  } else {
    lines.push(
      "> **OpenAI Sora**는 별도 접근 권한이 필요합니다. 당분간 Google AI Studio Veo 또는 수동 편집 워크플로를 권장합니다.",
    )
  }

  lines.push(
    "",
    "#### 추천 스토리보드 (3컷)",
    "1. **도입** — 장면 설정·주요 피사체",
    "2. **전개** — 핵심 동작·카메라 이동",
    "3. **마무리** — 메시지·로고·CTA",
    "",
    "_이미지 컷이 필요하면 「도구 → 이미지 만들기」로 키 프레임을 생성한 뒤 편집기에서 이어 붙이세요._",
  )

  return {
    ok: true,
    markdown: lines.join("\n"),
    provider,
    model: "video-guidance",
  }
}

async function generateSpeech(
  prompt: string,
  preferredAi: string,
): Promise<
  { ok: true; markdown: string; provider: string; model: string } | {
    ok: false
    error: string
  }
> {
  const provider = resolveProvider(preferredAi)
  if (provider === "anthropic") {
    return {
      ok: false,
      error:
        "Anthropic은 TTS API를 제공하지 않습니다. 음성 생성은 Google(Gemini) 모델을 선택하거나 [Google AI Studio 음성](https://aistudio.google.com/generate-speech)을 사용해 주세요.",
    }
  }

  const apiKey = readGeminiKey()
  if (!apiKey) {
    return {
      ok: false,
      error:
        "Gemini TTS용 GEMINI_API_KEY 가 설정되지 않았습니다. [Google AI Studio 음성](https://aistudio.google.com/generate-speech?model=gemini-3.1-flash-tts-preview)에서도 동일 계열 모델을 쓸 수 있습니다.",
    }
  }

  const modelId = "gemini-2.5-flash-preview-tts"
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" },
            },
          },
        },
      }),
    })

    if (!res.ok) {
      const t = await res.text()
      return {
        ok: false,
        error:
          `Gemini TTS 오류 (${res.status}). AI Studio에서 동일 모델을 시도해 주세요: https://aistudio.google.com/generate-speech?model=gemini-3.1-flash-tts-preview — ${t.slice(0, 200)}`,
      }
    }

    const body = await res.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: { mimeType?: string; data?: string }
          }>
        }
      }>
    }

    const part = body.candidates?.[0]?.content?.parts?.find((p) =>
      p.inlineData?.data
    )
    const data = part?.inlineData?.data
    const mime = part?.inlineData?.mimeType ?? "audio/wav"

    if (!data) {
      return {
        ok: false,
        error:
          "음성 데이터를 받지 못했습니다. [Google AI Studio TTS](https://aistudio.google.com/generate-speech?model=gemini-3.1-flash-tts-preview)에서 직접 생성해 보세요.",
      }
    }

    const dataUrl = `data:${mime};base64,${data}`
    return {
      ok: true,
      markdown:
        `### 생성 음성 (Gemini TTS · ${modelId})\n\n<audio controls src="${dataUrl}"></audio>\n\n` +
        `_대본: ${prompt}_\n\n` +
        `[AI Studio에서 열기](https://aistudio.google.com/generate-speech?model=gemini-3.1-flash-tts-preview)`,
      provider: "google",
      model: modelId,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      error: `음성 생성 실패: ${msg}`,
    }
  }
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405)
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return jsonResponse({ error: "인증 헤더가 없습니다." }, 401)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!
  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser()
  if (userError || !user) {
    return jsonResponse({ error: "유효하지 않은 세션입니다." }, 401)
  }

  let body: { tool?: string; prompt?: string; preferredAi?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: "JSON 본문이 필요합니다." }, 400)
  }

  const tool = (body.tool ?? "").trim().toLowerCase() as CreativeTool
  const prompt = (body.prompt ?? "").trim()
  const preferredAi = (body.preferredAi ?? "gemini-2.5-flash").trim()

  if (!prompt.length) {
    return jsonResponse({ error: "prompt 가 필요합니다." }, 400)
  }

  if (!["image", "video", "speech"].includes(tool)) {
    return jsonResponse({ error: "지원하지 않는 tool 입니다." }, 400)
  }

  let result:
    | { ok: true; markdown: string; provider: string; model: string }
    | { ok: false; error: string }

  if (tool === "image") {
    result = await generateImageForPrompt(prompt, preferredAi)
  } else if (tool === "video") {
    result = await generateVideoGuidance(prompt, preferredAi)
  } else {
    result = await generateSpeech(prompt, preferredAi)
  }

  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, 400)
  }

  return jsonResponse({
    ok: true,
    markdown: result.markdown,
    provider: result.provider,
    model: result.model,
  })
})
