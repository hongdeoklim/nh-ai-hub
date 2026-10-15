type RouteLoadingFallbackProps = {
  label?: string
}

export function RouteLoadingFallback({
  label = '화면을 불러오는 중…',
}: RouteLoadingFallbackProps) {
  return (
    <div
      className="flex min-h-[min(60vh,384px)] w-full flex-col items-center justify-center gap-[16px] px-[24px] py-[48px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="relative h-[40px] w-[40px]">
        <span className="absolute inset-0 rounded-full border-2 border-surface-3" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-brand border-r-brand/60" />
      </div>

      <div className="flex w-full max-w-[320px] flex-col gap-[8px]">
        <div className="h-[6px] overflow-hidden rounded-full bg-surface-3">
          <div className="h-full w-2/5 animate-pulse rounded-full bg-gradient-to-r from-brand/70 via-brand to-accent/80" />
        </div>
        <p className="text-center text-sm font-medium text-fg-muted">
          {label}
        </p>
      </div>
    </div>
  )
}
