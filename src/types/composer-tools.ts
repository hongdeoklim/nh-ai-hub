/** 채팅 컴포저 「도구」 메뉴 모드 */
export type ComposerToolMode = 'image' | 'video' | 'canvas' | 'speech'

export type ComposerToolMeta = {
  id: ComposerToolMode
  label: string
  hint: string
  placeholder: string
  /** 선택 모델 계열별 API 지원 여부(안내용) */
  providers: {
    google: boolean
    openai: boolean
    anthropic: boolean
  }
}

export const COMPOSER_TOOLS: ComposerToolMeta[] = [
  {
    id: 'image',
    label: '이미지 만들기',
    hint: 'Gemini Imagen · OpenAI DALL·E 3',
    placeholder: '만들고 싶은 이미지를 설명하세요. (예: 현장 안전 포스터, 16:9)',
    providers: { google: true, openai: true, anthropic: false },
  },
  {
    id: 'video',
    label: '동영상 만들기',
    hint: 'Google Veo · OpenAI Sora (안내·기획)',
    placeholder: '동영상 장면·길이·분위기를 설명하세요.',
    providers: { google: true, openai: true, anthropic: false },
  },
  {
    id: 'canvas',
    label: 'Canvas',
    hint: 'HTML·표·코드 미리보기 (모든 텍스트 모델)',
    placeholder: 'Canvas에 만들 UI·문서·대시보드를 설명하세요.',
    providers: { google: true, openai: true, anthropic: true },
  },
  {
    id: 'speech',
    label: '음성 만들기',
    hint: 'Gemini TTS (Google AI Studio 동일 계열)',
    placeholder: '읽어 줄 문장·안내 멘트를 입력하세요.',
    providers: { google: true, openai: false, anthropic: false },
  },
]

export function getComposerToolMeta(
  mode: ComposerToolMode | null | undefined,
): ComposerToolMeta | undefined {
  if (!mode) return undefined
  return COMPOSER_TOOLS.find((t) => t.id === mode)
}

export function providerForComposerTool(
  preferredAi: string,
): 'google' | 'openai' | 'anthropic' {
  const raw = preferredAi.trim().toLowerCase()
  if (raw.includes('gemini') || raw === 'google') return 'google'
  if (raw.includes('claude') || raw.includes('anthropic')) return 'anthropic'
  if (
    raw.includes('gpt') ||
    raw.includes('openai') ||
    raw.startsWith('o1') ||
    raw.startsWith('o3') ||
    raw.startsWith('o4')
  ) {
    return 'openai'
  }
  return 'google'
}
