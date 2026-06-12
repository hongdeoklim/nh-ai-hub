export type AiSlidesStyleMode = 'professional' | 'creative'

export type AiSlidesGuideMode = 'standard' | 'speak'

export type AiSlidesImageEngine = 'gemini-image' | 'imagen-3'

export type AiSlidesAspectRatio =
  | 'auto'
  | '16:9'
  | '4:3'
  | '1:1'
  | '3:4'
  | '9:16'

export type AiSlidesSortKey = 'popularity' | 'newest'

export type AiSlidesTemplateStyle =
  | 'business'
  | 'marketing'
  | 'education'
  | 'report'
  | 'pitch'

export type AiSlidesTemplateTheme =
  | 'light'
  | 'dark'
  | 'brand'
  | 'minimal'
  | 'travel'

export type AiSlidesTemplate = {
  id: string
  title: string
  titleKo: string
  description: string
  style: AiSlidesTemplateStyle
  theme: AiSlidesTemplateTheme
  styleModes: AiSlidesStyleMode[]
  slideCount: string
  popularity: number
  isNew?: boolean
  koreanOnly?: boolean
  /** 사용자 업로드 또는 외부 썸네일 URL */
  thumbnailUrl?: string
  preview: {
    from: string
    to: string
    accent: string
  }
  promptSeed: string
}

export const AI_SLIDES_STYLE_MODES: {
  id: AiSlidesStyleMode
  label: string
}[] = [
  { id: 'professional', label: 'Professional' },
  { id: 'creative', label: 'Creative' },
]

export const AI_SLIDES_GUIDE_MODES: {
  id: AiSlidesGuideMode
  label: string
  hint: string
}[] = [
  { id: 'standard', label: 'Standard', hint: '슬라이드별 핵심 불릿 중심' },
  { id: 'speak', label: 'Speak', hint: '발표자 노트·스크립트 포함' },
]

export const AI_SLIDES_IMAGE_ENGINES: {
  id: AiSlidesImageEngine
  label: string
}[] = [
  { id: 'gemini-image', label: 'Gemini Image' },
  { id: 'imagen-3', label: 'Imagen 3' },
]

export const AI_SLIDES_ASPECT_RATIOS: {
  id: AiSlidesAspectRatio
  label: string
  hint: string
}[] = [
  {
    id: 'auto',
    label: 'Auto Ratio',
    hint: 'AI chooses the best ratio for you',
  },
  {
    id: '16:9',
    label: '16:9',
    hint: 'Presentations & modern screens',
  },
  {
    id: '4:3',
    label: '4:3',
    hint: 'Knowledge cards & classic slides',
  },
  {
    id: '1:1',
    label: '1:1',
    hint: 'Social posts & online ads',
  },
  {
    id: '3:4',
    label: '3:4',
    hint: 'Posters & print-ready layouts',
  },
  {
    id: '9:16',
    label: '9:16',
    hint: 'Mobile stories & vertical video',
  },
]

export const AI_SLIDES_STYLE_FILTERS: {
  id: 'all' | AiSlidesTemplateStyle
  label: string
}[] = [
  { id: 'all', label: 'All Styles' },
  { id: 'business', label: 'Business' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'education', label: 'Education' },
  { id: 'report', label: 'Report' },
  { id: 'pitch', label: 'Pitch' },
]

export const AI_SLIDES_THEME_FILTERS: {
  id: 'all' | AiSlidesTemplateTheme
  label: string
}[] = [
  { id: 'all', label: 'All Themes' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'brand', label: 'Brand' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'travel', label: 'Travel' },
]

export const AI_SLIDES_TEMPLATES: AiSlidesTemplate[] = [
  {
    id: 'biz-quarterly',
    title: 'Quarterly Business Review',
    titleKo: '분기 실적 보고',
    description: 'KPI·매출·과제·다음 분기 목표를 구조화한 임원 보고용.',
    style: 'business',
    theme: 'light',
    styleModes: ['professional', 'creative'],
    slideCount: '10–12',
    popularity: 98,
    koreanOnly: true,
    preview: { from: '#f8fafc', to: '#e2e8f0', accent: '#0f766e' },
    promptSeed:
      '분기 실적 보고 프레젠테이션을 Canvas HTML 슬라이드로 작성해 주세요. KPI, 매출 추이, 주요 성과, 리스크, 다음 분기 목표 슬라이드를 포함하고 16:9 레이아웃을 사용하세요.',
  },
  {
    id: 'safety-briefing',
    title: 'Safety Briefing',
    titleKo: '현장 안전 브리핑',
    description: '순회 점검·보호구·비상 연락망·사고 예방 체크리스트.',
    style: 'education',
    theme: 'brand',
    styleModes: ['professional'],
    slideCount: '8–10',
    popularity: 94,
    koreanOnly: true,
    preview: { from: '#ecfdf5', to: '#a7f3d0', accent: '#047857' },
    promptSeed:
      '현장 안전 브리핑 슬라이드를 Canvas HTML로 작성해 주세요. 점검 항목, 보호구, 화기 작업, 비상 연락망, 사고 사례 예방을 슬라이드별로 정리하고 아이콘·체크리스트 형식을 사용하세요.',
  },
  {
    id: 'travel-package',
    title: 'Travel Package Deck',
    titleKo: '여행 상품 소개',
    description: '일정·가격·포함/불포함·FAQ가 있는 판매용 덱.',
    style: 'marketing',
    theme: 'travel',
    styleModes: ['professional', 'creative'],
    slideCount: '12–15',
    popularity: 91,
    koreanOnly: true,
    preview: { from: '#fff7ed', to: '#fed7aa', accent: '#c2410c' },
    promptSeed:
      '여행 패키지 소개 프레젠테이션을 Canvas HTML 슬라이드로 작성해 주세요. 하이라이트, 일정표, 가격 옵션, 포함/불포함, 취소 규정, FAQ 슬라이드를 포함하고 여행사 톤으로 디자인하세요.',
  },
  {
    id: 'project-kickoff',
    title: 'Project Kickoff',
    titleKo: '프로젝트 킥오프',
    description: '목표·범위·일정·역할·리스크를 한 덱에 정리.',
    style: 'pitch',
    theme: 'minimal',
    styleModes: ['professional', 'creative'],
    slideCount: '9–11',
    popularity: 88,
    preview: { from: '#fafafa', to: '#e5e5e5', accent: '#525252' },
    promptSeed:
      '프로젝트 킥오프 발표 자료를 Canvas HTML 슬라이드로 작성해 주세요. 배경, 목표, 범위, 마일스톤, RACI, 리스크, 다음 액션 슬라이드를 포함하세요.',
  },
  {
    id: 'sales-pitch',
    title: 'Sales Pitch',
    titleKo: '영업 제안 피치',
    description: '고객 Pain·솔루션·ROI·견적 개요.',
    style: 'pitch',
    theme: 'dark',
    styleModes: ['professional', 'creative'],
    slideCount: '8–10',
    popularity: 86,
    isNew: true,
    preview: { from: '#1e293b', to: '#0f172a', accent: '#38bdf8' },
    promptSeed:
      'B2B 영업 제안 피치 덱을 Canvas HTML 슬라이드로 작성해 주세요. 고객 과제, 솔루션, 차별점, ROI, 도입 단계, 견적 개요 슬라이드를 다크 테마로 구성하세요.',
  },
  {
    id: 'training-module',
    title: 'Training Module',
    titleKo: '교육 모듈',
    description: '학습 목표·단원·퀴즈·요약이 있는 교육용.',
    style: 'education',
    theme: 'light',
    styleModes: ['professional', 'creative'],
    slideCount: '14–18',
    popularity: 82,
    koreanOnly: true,
    preview: { from: '#eff6ff', to: '#bfdbfe', accent: '#2563eb' },
    promptSeed:
      '직원 교육용 슬라이드 모듈을 Canvas HTML로 작성해 주세요. 학습 목표, 핵심 개념 3단원, 사례, 퀴즈, 요약 슬라이드를 포함하고 교육용 가독성을 우선하세요.',
  },
  {
    id: 'marketing-campaign',
    title: 'Marketing Campaign',
    titleKo: '마케팅 캠페인',
    description: '타깃·메시지·채널·크리에이티브 방향.',
    style: 'marketing',
    theme: 'brand',
    styleModes: ['creative'],
    slideCount: '10–12',
    popularity: 79,
    preview: { from: '#fdf4ff', to: '#f0abfc', accent: '#a21caf' },
    promptSeed:
      '마케팅 캠페인 기획 슬라이드를 Canvas HTML로 작성해 주세요. 타깃, 핵심 메시지, 채널 믹스, 크리에이티브 컨셉, 일정, KPI 슬라이드를 비주얼 중심으로 구성하세요.',
  },
  {
    id: 'exec-summary',
    title: 'Executive Summary',
    titleKo: '임원 요약',
    description: '한 페이지 요약 + 5장 핵심만 담은 경량 덱.',
    style: 'report',
    theme: 'minimal',
    styleModes: ['professional'],
    slideCount: '5–7',
    popularity: 77,
    koreanOnly: true,
    preview: { from: '#f5f5f4', to: '#d6d3d1', accent: '#44403c' },
    promptSeed:
      '임원 보고용 요약 프레젠테이션을 Canvas HTML 슬라이드로 작성해 주세요. 한 줄 요약, 핵심 3가지, 재무/운영 지표, 의사결정 요청, 부록 링크 슬라이드만 간결하게 구성하세요.',
  },
  {
    id: 'product-launch',
    title: 'Product Launch',
    titleKo: '신제품 런칭',
    description: '제품 스토리·기능·데모 플로·출시 일정.',
    style: 'marketing',
    theme: 'brand',
    styleModes: ['professional', 'creative'],
    slideCount: '11–13',
    popularity: 75,
    isNew: true,
    preview: { from: '#fef3c7', to: '#fde68a', accent: '#b45309' },
    promptSeed:
      '신제품 런칭 발표 슬라이드를 Canvas HTML로 작성해 주세요. 문제 정의, 제품 스토리, 핵심 기능, 데모 플로, 가격, 출시 일정, CTA 슬라이드를 포함하세요.',
  },
]

export function aiSlidesTemplatePromptLabel(template: AiSlidesTemplate): string {
  return `${template.title} Slides Template`
}

export function buildAiSlidesPrompt(
  template: AiSlidesTemplate,
  options: {
    styleMode: AiSlidesStyleMode
    guideMode: AiSlidesGuideMode
    aspectRatio: AiSlidesAspectRatio
    imageEngine: AiSlidesImageEngine
    topic?: string
  },
): string {
  const ratioLabel =
    options.aspectRatio === 'auto'
      ? '16:9 (자동)'
      : options.aspectRatio
  const guideHint =
    options.guideMode === 'speak'
      ? '각 슬라이드마다 발표자 노트(스크립트)를 하단에 포함하세요.'
      : '슬라이드별 핵심 불릿만 간결하게 작성하세요.'
  const styleHint =
    options.styleMode === 'creative'
      ? 'Creative 톤: 대담한 색·레이아웃, 시각적 강조.'
      : 'Professional 톤: 절제된 색·그리드, 업무용 가독성.'
  const imageHint =
    options.imageEngine === 'imagen-3'
      ? '이미지가 필요한 슬라이드는 Imagen 3 스타일 일러스트 설명을 placeholder로 넣으세요.'
      : '이미지가 필요한 슬라이드는 Gemini Image용 설명을 placeholder로 넣으세요.'

  const topicLine = options.topic?.trim()
    ? `주제: ${options.topic.trim()}`
    : '주제: (입력창에서 구체 주제를 적어 주세요)'

  return [
    template.promptSeed,
    '',
    `[템플릿: ${template.titleKo} · ${template.title}]`,
    topicLine,
    `스타일: ${styleHint}`,
    `비율: ${ratioLabel}`,
    `가이드: ${guideHint}`,
    imageHint,
    `슬라이드 수: ${template.slideCount}장 권장`,
    '',
    'Canvas HTML로 슬라이드 덱 전체를 한 번에 출력해 주세요.',
  ].join('\n')
}
