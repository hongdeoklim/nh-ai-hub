type RouteLoadingFallbackProps = {
  label?: string
}

export function RouteLoadingFallback({
  label = '화면을 불러오는 중…',
}: RouteLoadingFallbackProps) {
  return (
    <div
      className="flex min-h-[min(60vh,24rem)] w-full flex-col items-center justify-center gap-4 px-6 py-12"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="relative h-10 w-10">
        <span className="absolute inset-0 rounded-full border-2 border-stone-200 dark:border-stone-700" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-orange-600 border-r-orange-500/70 dark:border-t-orange-400 dark:border-r-orange-300/60" />
      </div>

      <div className="w-full max-w-xs space-y-2">
        <div className="h-1.5 overflow-hidden rounded-full bg-stone-200/90 dark:bg-stone-800">
          <div className="h-full w-2/5 animate-pulse rounded-full bg-gradient-to-r from-orange-600/70 via-orange-500 to-orange-400/80" />
        </div>
        <p className="text-center text-sm font-medium text-stone-600 dark:text-stone-400">
          {label}
        </p>
      </div>
    </div>
  )
}
