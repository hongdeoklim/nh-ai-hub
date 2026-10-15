import { describe, expect, it } from 'vitest'

import {
  ALL_NAV_ITEMS,
  findActiveGroup,
  findActiveItem,
  LAUNCHER_GROUPS,
  NAV_GROUPS,
  resolvePageTitle,
  searchNavItems,
} from '../app-navigation'

describe('app-navigation (IA 단일 소스)', () => {
  it('라우트 경로는 그룹 전체에서 유일하다', () => {
    const paths = ALL_NAV_ITEMS.map((i) => i.to)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('채팅 경로(/, /chat/:id)는 채팅 그룹·항목으로 해석된다', () => {
    expect(findActiveGroup('/')?.id).toBe('chat')
    expect(findActiveGroup('/chat/abc-123')?.id).toBe('chat')
    expect(findActiveItem('/chat/abc-123')?.to).toBe('/')
    expect(resolvePageTitle('/')).toBe('채팅')
  })

  it('하위 경로도 상위 항목에 매칭되고, matchPrefix=false 항목은 정확히 일치할 때만 매칭된다', () => {
    expect(findActiveItem('/ai-planner/session-1')?.to).toBe('/ai-planner')
    expect(findActiveItem('/teams/t1/chat/c1')?.to).toBe('/teams')
    expect(findActiveItem('/scrapbook-extra')).toBeNull()
  })

  it('특수 경로 제목을 우선 적용한다', () => {
    expect(resolvePageTitle('/teams/t1/chat/c1')).toBe('팀 공유 채팅')
    expect(resolvePageTitle('/teams/t1')).toBe('팀 상세')
    expect(resolvePageTitle('/oauth/google-integration')).toBe('Google 연동')
    expect(resolvePageTitle('/unknown-route')).toBe('NH-AX-HUB')
  })

  it('런처 그룹은 채팅 그룹을 제외한 나머지 전부다', () => {
    expect(LAUNCHER_GROUPS.map((g) => g.id)).toEqual(
      NAV_GROUPS.filter((g) => g.id !== 'chat').map((g) => g.id),
    )
  })

  it('검색은 레이블·설명·키워드를 대소문자 무시로 부분 일치시키고, 숨김 항목은 옵션에 따른다', () => {
    const visible = searchNavItems('cad')
    expect(visible.map((i) => i.to)).toContain('/cad-agent')

    expect(searchNavItems('workflow').map((i) => i.to)).not.toContain('/workflows')
    expect(searchNavItems('workflow', true).map((i) => i.to)).toContain('/workflows')

    expect(searchNavItems('').length).toBe(ALL_NAV_ITEMS.filter((i) => !i.hidden).length)
    expect(searchNavItems('존재하지않는검색어')).toEqual([])
  })
})
