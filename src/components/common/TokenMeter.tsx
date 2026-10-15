import { tokenRemainingPct, tokenToneClass } from '../../lib/token-budget'

type TokenMeterProps = {
  used: number
  limit: number
  /** 프로필 미로딩 */
  loading?: boolean
  className?: string
}

/** 월간 토큰 잔량 — 라벨 + 진행 막대 + 수치 */
export function TokenMeter({ used, limit, loading = false, className = '' }: TokenMeterProps) {
  const pct = tokenRemainingPct(used, limit)
  return (
    <div className={className}>
      <div className="flex items-center justify-between text-xs font-medium text-fg-muted">
        <span>월간 토큰 잔량</span>
        <span className={`tabular-nums ${pct <= 15 ? 'text-danger' : pct <= 35 ? 'text-warning' : 'text-fg'}`}>
          {loading ? '—' : `${pct}%`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={loading ? undefined : pct}
        aria-label="남은 토큰 비율"
        className="mt-[6px] h-[6px] w-full overflow-hidden rounded-full bg-surface-3"
      >
        {!loading ? (
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${tokenToneClass(pct)}`}
            style={{ width: `${pct}%` }}
          />
        ) : null}
      </div>
      <p className="mt-[4px] text-[11px]! tabular-nums text-fg-subtle">
        {loading ? '프로필 불러오는 중' : `${used.toLocaleString()} / ${limit.toLocaleString()} 사용`}
      </p>
    </div>
  )
}
