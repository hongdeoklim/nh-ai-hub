import type { AiSlidesTemplate } from '../data/ai-slides-catalog'

export type AiSlidesCustomTemplate = {
  id: string
  title: string
  thumbnailDataUrl: string
  createdAt: string
}

const STORAGE_KEY = 'nh-ai-hub.ai-slides.custom-templates.v1'

export function readCustomAiSlidesTemplates(): AiSlidesCustomTemplate[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AiSlidesCustomTemplate[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (row) =>
        row &&
        typeof row.id === 'string' &&
        typeof row.title === 'string' &&
        typeof row.thumbnailDataUrl === 'string',
    )
  } catch {
    return []
  }
}

export function saveCustomAiSlidesTemplate(
  template: AiSlidesCustomTemplate,
): void {
  const list = readCustomAiSlidesTemplates()
  list.unshift(template)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 24)))
  } catch {
    window.alert('템플릿 저장에 실패했습니다. 이미지 크기를 줄여 주세요.')
  }
}

export function customTemplateToSlidesTemplate(
  custom: AiSlidesCustomTemplate,
): AiSlidesTemplate {
  return {
    id: custom.id,
    title: custom.title,
    titleKo: custom.title,
    description: '내가 업로드한 슬라이드 템플릿 썸네일',
    style: 'business',
    theme: 'minimal',
    styleModes: ['professional', 'creative'],
    slideCount: '8–12',
    popularity: 100,
    thumbnailUrl: custom.thumbnailDataUrl,
    preview: { from: '#f5f5f4', to: '#e7e5e4', accent: '#78716c' },
    promptSeed: `업로드한 「${custom.title}」 템플릿 레이아웃·톤을 참고해 Canvas HTML 슬라이드 덱을 작성해 주세요.`,
  }
}

export function removeCustomAiSlidesTemplate(id: string): void {
  const next = readCustomAiSlidesTemplates().filter((row) => row.id !== id)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}
