/** 월간 토큰 예산 — 남은 비율(0~100) */
export function tokenRemainingPct(used: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.max(0, Math.min(100, Math.round(((limit - used) / limit) * 100)))
}

/** 남은 비율에 따른 진행 막대 색 (Tailwind 토큰 유틸) */
export function tokenToneClass(pct: number): string {
  if (pct <= 15) return 'bg-danger'
  if (pct <= 35) return 'bg-warning'
  return 'bg-brand'
}
