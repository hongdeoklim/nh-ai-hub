import type { ComponentType } from 'react'

import {
  IconBookmark,
  IconBrain,
  IconChat,
  IconClipboardList,
  IconFolder,
  IconHardHat,
  IconLayoutTemplate,
  IconLibrary,
  IconLink,
  IconNotebook,
  IconPalette,
  IconPresentation,
  IconRuler,
  IconSparkles,
  IconStore,
  IconTable,
  IconUsers,
  IconWorkflow,
  IconZap,
  type IconProps,
} from '../components/common/icons'

export type NavIcon = ComponentType<IconProps>

export type NavItem = {
  /** 라우트 경로 */
  to: string
  /** 전체 명칭 (헤더·런처·팔레트) */
  label: string
  /** 짧은 명칭 (레일·탭) */
  short: string
  /** 한 줄 설명 */
  description: string
  icon: NavIcon
  /** 검색용 보조 키워드 */
  keywords?: string[]
  /** 레일/런처에는 노출하지 않고 제목·팔레트에서만 사용 */
  hidden?: boolean
  /** 하위 경로까지 활성 처리 (기본 true) */
  matchPrefix?: boolean
}

export type NavGroupId = 'chat' | 'knowledge' | 'automation' | 'ai-apps' | 'team'

export type NavGroup = {
  id: NavGroupId
  label: string
  short: string
  description: string
  icon: NavIcon
  items: NavItem[]
}

/**
 * 정보 구조(IA) 단일 소스 — 레일·런처·하단 탭·명령 팔레트·헤더 제목이 모두 이 데이터를 사용한다.
 * 라우트 추가 시 App.tsx 와 함께 이 목록을 갱신한다.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'chat',
    label: '채팅',
    short: '채팅',
    description: 'AI와 대화하고 사내 지식을 질의합니다.',
    icon: IconChat,
    items: [
      {
        to: '/',
        label: '채팅',
        short: '채팅',
        description: '개인 AI 채팅 홈',
        icon: IconChat,
        keywords: ['chat', '대화', '홈'],
        matchPrefix: false,
      },
    ],
  },
  {
    id: 'knowledge',
    label: '지식',
    short: '지식',
    description: '사내 문서·학습 현황·개인 노트와 스크랩을 관리합니다.',
    icon: IconBrain,
    items: [
      {
        to: '/reference-room',
        label: '사내 자료실',
        short: '자료실',
        description: '문서·드라이브 폴더를 AI 참조 자료로 등록',
        icon: IconFolder,
        keywords: ['reference', '문서', '드라이브', 'drive'],
      },
      {
        to: '/knowledge-hub',
        label: '지식 허브',
        short: '지식 허브',
        description: '색인(학습) 현황 · 실패 재시도 · 검색 품질 테스트',
        icon: IconBrain,
        keywords: ['knowledge', 'rag', '색인', '임베딩'],
      },
      {
        to: '/notebook',
        label: '노트북 워크스페이스',
        short: '노트북',
        description: '문서를 모아 RAG 기반으로 분석하는 작업 공간',
        icon: IconNotebook,
        keywords: ['notebook', 'rag', '분석'],
      },
      {
        to: '/scrapbook',
        label: '내 스크랩북',
        short: '스크랩북',
        description: '저장한 AI 답변 모아보기',
        icon: IconBookmark,
        keywords: ['scrapbook', '북마크', '저장'],
      },
      {
        to: '/library',
        label: '라이브러리',
        short: '라이브러리',
        description: '지식 파이프라인 · 학습 자산 라이브러리',
        icon: IconLibrary,
        keywords: ['library'],
      },
    ],
  },
  {
    id: 'automation',
    label: '자동화',
    short: '자동화',
    description: '플러그인·MCP·워크플로우·연동과 CAD 에이전트를 한곳에서.',
    icon: IconZap,
    items: [
      {
        to: '/automation-studio',
        label: '자동화 스튜디오',
        short: '자동화',
        description: '플러그인 · MCP · 스킬 · 공공데이터 · 워크플로우 통합 카탈로그',
        icon: IconZap,
        keywords: ['automation', 'plugin', 'mcp', 'skill', 'workflow', '마켓플레이스'],
      },
      {
        to: '/cad-agent',
        label: 'CAD 에이전트',
        short: 'CAD',
        description: '내 PC의 AutoCAD를 원격으로 실행하는 에이전트',
        icon: IconRuler,
        keywords: ['cad', 'autocad', 'dwg', 'dxf'],
      },
      {
        to: '/workflows',
        label: '워크플로우',
        short: '워크플로우',
        description: '워크플로우 상세 관리 (자동화 스튜디오에서 진입)',
        icon: IconWorkflow,
        keywords: ['workflow'],
        hidden: true,
      },
      {
        to: '/marketplace',
        label: '마켓플레이스',
        short: '마켓',
        description: '확장 기능 마켓플레이스 (자동화 스튜디오에서 진입)',
        icon: IconStore,
        keywords: ['marketplace', 'plugin'],
        hidden: true,
      },
      {
        to: '/workspace-tools',
        label: '워크스페이스 연동',
        short: '연동',
        description: 'Google · Microsoft 365 계정 연동',
        icon: IconLink,
        keywords: ['google', 'microsoft', 'integration', '연동'],
        hidden: true,
      },
    ],
  },
  {
    id: 'ai-apps',
    label: 'AI 앱',
    short: 'AI 앱',
    description: '기획·디자인·슬라이드·시트를 AI로 생성합니다.',
    icon: IconSparkles,
    items: [
      {
        to: '/ai-planner',
        label: 'AI Planner',
        short: 'Planner',
        description: '요구사항을 대화로 정리해 기획서(PRD)로',
        icon: IconClipboardList,
        keywords: ['planner', '기획', 'prd'],
      },
      {
        to: '/ai-designer',
        label: 'AI Designer',
        short: 'Designer',
        description: '브랜드 템플릿 기반 비주얼 디자인 생성',
        icon: IconPalette,
        keywords: ['designer', '디자인', '이미지'],
      },
      {
        to: '/ai-slides',
        label: 'AI Slides',
        short: 'Slides',
        description: '발표 자료 자동 구성 · 편집',
        icon: IconPresentation,
        keywords: ['slides', 'ppt', '발표'],
      },
      {
        to: '/ai-sheets',
        label: 'AI Sheets',
        short: 'Sheets',
        description: '스프레드시트 분석 · 수식 · 차트',
        icon: IconTable,
        keywords: ['sheets', 'excel', '엑셀', '시트'],
      },
      {
        to: '/ai-office',
        label: 'AI Office',
        short: 'Office',
        description: '문서 · 시트 · 슬라이드 통합 편집기',
        icon: IconLayoutTemplate,
        keywords: ['office', 'univer'],
        hidden: true,
      },
    ],
  },
  {
    id: 'team',
    label: '팀 · 현장',
    short: '팀',
    description: '팀 공유 채팅과 현장 AI 평가.',
    icon: IconUsers,
    items: [
      {
        to: '/teams',
        label: '팀 · 공유 채팅',
        short: '팀 채팅',
        description: '팀 단위로 대화를 공유하고 함께 작업',
        icon: IconUsers,
        keywords: ['team', '공유', '협업'],
      },
      {
        to: '/site-assessment',
        label: '현장 AI 평가',
        short: '현장평가',
        description: '현장 사진·체크리스트 기반 안전 평가',
        icon: IconHardHat,
        keywords: ['site', '안전', '현장', '평가'],
      },
    ],
  },
]

export const ALL_NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((g) => g.items)

/** 레일·런처에 노출되는 그룹 (채팅은 레일 상단 고정 항목이므로 제외) */
export const LAUNCHER_GROUPS: readonly NavGroup[] = NAV_GROUPS.filter((g) => g.id !== 'chat')

function itemMatches(item: NavItem, pathname: string): boolean {
  if (item.matchPrefix === false) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

/** 현재 경로가 속한 그룹 */
export function findActiveGroup(pathname: string): NavGroup | null {
  if (pathname === '/' || pathname.startsWith('/chat/')) return NAV_GROUPS[0]
  for (const group of NAV_GROUPS) {
    if (group.items.some((item) => itemMatches(item, pathname))) return group
  }
  return null
}

/** 현재 경로의 항목 */
export function findActiveItem(pathname: string): NavItem | null {
  if (pathname === '/' || pathname.startsWith('/chat/')) return NAV_GROUPS[0].items[0]
  for (const item of ALL_NAV_ITEMS) {
    if (itemMatches(item, pathname)) return item
  }
  return null
}

const SPECIAL_TITLES: Array<[RegExp, string]> = [
  [/^\/oauth\/google-integration/, 'Google 연동'],
  [/^\/oauth\/microsoft-integration/, 'Microsoft 연동'],
  [/^\/teams\/[^/]+\/chat\//, '팀 공유 채팅'],
  [/^\/teams\/[^/]+/, '팀 상세'],
]

/** 헤더에 표시할 화면 제목 */
export function resolvePageTitle(pathname: string): string {
  for (const [re, title] of SPECIAL_TITLES) {
    if (re.test(pathname)) return title
  }
  return findActiveItem(pathname)?.label ?? 'NH-AX-HUB'
}

/** 간단한 부분 일치 검색 (명령 팔레트·런처) */
export function searchNavItems(query: string, includeHidden = false): NavItem[] {
  const q = query.trim().toLowerCase()
  const pool = includeHidden ? ALL_NAV_ITEMS : ALL_NAV_ITEMS.filter((i) => !i.hidden)
  if (!q) return [...pool]
  return pool.filter((item) => {
    const hay = [item.label, item.short, item.description, ...(item.keywords ?? [])]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}
