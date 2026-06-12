export type AiDesignerCategoryId =
  | 'chat'
  | 'poster'
  | 'flyer'
  | 'product'
  | 'menu'
  | 'coupon'
  | 'sns'
  | 'wallpaper'
  | 'card'
  | 'calligraphy'
  | 'comic'
  | 'meme'
  | 'character'
  | 'logo'
  | 'sticker'
  | 'interior'
  | 'tshirt'

export const AI_DESIGNER_IMAGE_BASE =
  'https://cdn1.genspark.ai/user-upload-image/ai_designer_homepage_assets/v2'

export type AiDesignerCategory = {
  id: AiDesignerCategoryId
  label: string
  emoji: string
  gradient: string
  promptSeed: string
  thumbnailUrl: string
  aspectRatio?: '1:1' | '3:4' | '4:3' | '9:16' | '16:9'
}

export const AI_DESIGNER_CATEGORIES: AiDesignerCategory[] = [
  {
    id: 'chat',
    label: '대화',
    emoji: '💬',
    gradient: 'from-violet-100 to-indigo-200',
    promptSeed: '사내 AI와 대화하며 디자인 아이디어를 구체화해 주세요.',
    thumbnailUrl: `${AI_DESIGNER_IMAGE_BASE}/poster.png`,
  },
  {
    id: 'poster',
    label: '포스터',
    emoji: '📋',
    gradient: 'from-rose-100 to-orange-200',
    promptSeed:
      '여행사 사내 행사용 세로 포스터. 제목·일시·장소·CTA가 있는 깔끔한 레이아웃, 9:16.',
    aspectRatio: '9:16',
    thumbnailUrl: `${AI_DESIGNER_IMAGE_BASE}/poster.png`,
  },
  {
    id: 'flyer',
    label: '전단지',
    emoji: '📄',
    gradient: 'from-amber-100 to-yellow-200',
    promptSeed:
      'A4 전단지. 상단 헤드라인, 3개 혜택 불릿, 하단 연락처. 인쇄용 고대비.',
    aspectRatio: '3:4',
    thumbnailUrl: `${AI_DESIGNER_IMAGE_BASE}/flyer.png`,
  },
  {
    id: 'product',
    label: '제품',
    emoji: '📦',
    gradient: 'from-sky-100 to-cyan-200',
    promptSeed:
      '여행 패키지 상품 카드용 제품 이미지. 밝은 배경, 프리미엄 느낌.',
    aspectRatio: '1:1',
    thumbnailUrl: `${AI_DESIGNER_IMAGE_BASE}/poroduct_display.png`,
  },
  {
    id: 'menu',
    label: '메뉴',
    emoji: '🍽️',
    gradient: 'from-lime-100 to-green-200',
    promptSeed: '레스토랑 메뉴판 디자인. 카테고리·가격·설명이 읽기 쉬운 2단 레이아웃.',
    aspectRatio: '3:4',
    thumbnailUrl: `${AI_DESIGNER_IMAGE_BASE}/menu.png`,
  },
  {
    id: 'coupon',
    label: '쿠폰',
    emoji: '🎟️',
    gradient: 'from-pink-100 to-fuchsia-200',
    promptSeed: '할인 쿠폰 카드. 할인율, 유효기간, 사용 조건, QR 영역.',
    aspectRatio: '16:9',
    thumbnailUrl: `${AI_DESIGNER_IMAGE_BASE}/coupon.png`,
  },
  {
    id: 'sns',
    label: 'SNS',
    emoji: '📱',
    gradient: 'from-purple-100 to-violet-200',
    promptSeed: '인스타그램 피드용 1:1 SNS 카드. 짧은 카피와 브랜드 컬러.',
    aspectRatio: '1:1',
    thumbnailUrl: `${AI_DESIGNER_IMAGE_BASE}/social_media.png`,
  },
  {
    id: 'wallpaper',
    label: '배경화면',
    emoji: '🖼️',
    gradient: 'from-teal-100 to-emerald-200',
    promptSeed: '데스크톱·모바일 배경화면. 은은한 여행지 무드, 텍스트 없음.',
    aspectRatio: '16:9',
    thumbnailUrl: `${AI_DESIGNER_IMAGE_BASE}/mobile_wallpaper.png`,
  },
  {
    id: 'card',
    label: '카드 및 초대장',
    emoji: '💌',
    gradient: 'from-rose-50 to-pink-200',
    promptSeed: '행사 초대장. 우아한 타이포, 날짜·장소·RSVP.',
    aspectRatio: '3:4',
    thumbnailUrl: `${AI_DESIGNER_IMAGE_BASE}/card_invite.png`,
  },
  {
    id: 'calligraphy',
    label: '캘리그라피',
    emoji: '✒️',
    gradient: 'from-stone-100 to-amber-100',
    promptSeed: '손글씨 캘리그라피 스타일 짧은 문구. 미니멀 배경.',
    aspectRatio: '1:1',
    thumbnailUrl: `${AI_DESIGNER_IMAGE_BASE}/signature.png`,
  },
  {
    id: 'comic',
    label: '코믹',
    emoji: '💭',
    gradient: 'from-blue-100 to-indigo-200',
    promptSeed: '4컷 웹툰 스타일. 사내 안전·서비스 상황을 유쾌하게.',
    aspectRatio: '1:1',
    thumbnailUrl: `${AI_DESIGNER_IMAGE_BASE}/comic2.png`,
  },
  {
    id: 'meme',
    label: '짤',
    emoji: '😄',
    gradient: 'from-yellow-100 to-orange-200',
    promptSeed: '밈·짤 이미지. 짧은 한국어 캡션, 유머러스한 표정.',
    aspectRatio: '1:1',
    thumbnailUrl: `${AI_DESIGNER_IMAGE_BASE}/meme.png`,
  },
  {
    id: 'character',
    label: '캐릭터',
    emoji: '🧸',
    gradient: 'from-cyan-100 to-blue-200',
    promptSeed: '친근한 마스코트 캐릭터. 여행사 브랜드 가이드에 맞는 2D 일러스트.',
    aspectRatio: '1:1',
    thumbnailUrl: `${AI_DESIGNER_IMAGE_BASE}/character_design.png`,
  },
  {
    id: 'logo',
    label: '로고',
    emoji: '✨',
    gradient: 'from-slate-100 to-zinc-200',
    promptSeed: '미니멀 로고 시안. 심볼+워드마크, 단색 배경.',
    aspectRatio: '1:1',
    thumbnailUrl: `${AI_DESIGNER_IMAGE_BASE}/logo.png`,
  },
  {
    id: 'sticker',
    label: '스티커',
    emoji: '🏷️',
    gradient: 'from-green-100 to-lime-200',
    promptSeed: '카카오톡 스티커 스타일. 투명 배경, 굵은 윤곽선.',
    aspectRatio: '1:1',
    thumbnailUrl: `${AI_DESIGNER_IMAGE_BASE}/sticker.png`,
  },
  {
    id: 'interior',
    label: '인테리어',
    emoji: '🛋️',
    gradient: 'from-orange-100 to-amber-200',
    promptSeed: '여행사 매장·라운지 인테리어 시안. 밝고 개방적인 공간.',
    aspectRatio: '16:9',
    thumbnailUrl: `${AI_DESIGNER_IMAGE_BASE}/home_design.png`,
  },
  {
    id: 'tshirt',
    label: '티셔츠',
    emoji: '👕',
    gradient: 'from-indigo-100 to-purple-200',
    promptSeed: '직원용 티셔츠 그래픽. 가슴 로고·등판 슬로건.',
    aspectRatio: '1:1',
    thumbnailUrl: `${AI_DESIGNER_IMAGE_BASE}/t_shirt.png`,
  },
]

export function getDesignerCategory(id: AiDesignerCategoryId): AiDesignerCategory {
  return (
    AI_DESIGNER_CATEGORIES.find((c) => c.id === id) ?? AI_DESIGNER_CATEGORIES[0]
  )
}

export function buildDesignerPrompt(
  categoryId: AiDesignerCategoryId,
  userText: string,
): string {
  const category = getDesignerCategory(categoryId)
  const detail = userText.trim()
  if (categoryId === 'chat') return detail
  const ratio = category.aspectRatio ? ` 비율 ${category.aspectRatio}.` : ''
  if (!detail) return `${category.promptSeed}${ratio}`
  return `[${category.label}] ${detail}. ${category.promptSeed}${ratio}`
}
