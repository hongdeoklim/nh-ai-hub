import { describe, expect, it } from 'vitest'

import { tokenRemainingPct, tokenToneClass } from '../token-budget'

describe('token-budget', () => {
  it('한도가 0 이하이면 잔량 0%', () => {
    expect(tokenRemainingPct(0, 0)).toBe(0)
    expect(tokenRemainingPct(10, -5)).toBe(0)
  })

  it('사용량에 따라 0~100 사이로 반올림·클램프한다', () => {
    expect(tokenRemainingPct(0, 1000)).toBe(100)
    expect(tokenRemainingPct(250, 1000)).toBe(75)
    expect(tokenRemainingPct(1200, 1000)).toBe(0)
    expect(tokenRemainingPct(333, 1000)).toBe(67)
  })

  it('잔량 구간별 색 토큰', () => {
    expect(tokenToneClass(10)).toBe('bg-danger')
    expect(tokenToneClass(15)).toBe('bg-danger')
    expect(tokenToneClass(16)).toBe('bg-warning')
    expect(tokenToneClass(35)).toBe('bg-warning')
    expect(tokenToneClass(36)).toBe('bg-brand')
    expect(tokenToneClass(100)).toBe('bg-brand')
  })
})
