import { useCallback, useEffect, useRef, useState } from 'react'

type CitationTooltipProps = {
  marker: string
  title: string
  snippet?: string
  variant?: 'default' | 'claude' | 'gemini'
}

export function CitationTooltip({
  marker,
  title,
  snippet,
  variant = 'claude',
}: CitationTooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<'top' | 'bottom'>('top')

  const updatePlacement = useCallback(() => {
    const anchor = anchorRef.current
    const popover = popoverRef.current
    if (!anchor || !popover) return

    const anchorRect = anchor.getBoundingClientRect()
    const popoverHeight = popover.offsetHeight || 120
    const spaceAbove = anchorRect.top
    const spaceBelow = window.innerHeight - anchorRect.bottom

    if (spaceAbove < popoverHeight + 12 && spaceBelow > spaceAbove) {
      setPlacement('bottom')
    } else {
      setPlacement('top')
    }
  }, [])

  useEffect(() => {
    updatePlacement()
    window.addEventListener('resize', updatePlacement)
    window.addEventListener('scroll', updatePlacement, true)
    return () => {
      window.removeEventListener('resize', updatePlacement)
      window.removeEventListener('scroll', updatePlacement, true)
    }
  }, [updatePlacement, title, snippet])

  const badgeClass =
    variant === 'claude'
      ? 'border-blue-300/90 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100 dark:hover:bg-blue-950/70'
      : 'border-sky-300/90 bg-sky-50 text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100'

  const popoverPositionClass =
    placement === 'top'
      ? 'bottom-full mb-2 origin-bottom'
      : 'top-full mt-2 origin-top'

  return (
    <span
      ref={anchorRef}
      className="group/cite relative mx-0.5 inline-flex align-baseline"
      onMouseEnter={updatePlacement}
      onFocus={updatePlacement}
    >
      <button
        type="button"
        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-none transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${badgeClass}`}
        aria-label={`출처: ${title}`}
      >
        {marker}
      </button>

      <div
        ref={popoverRef}
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 w-max max-w-[min(20rem,calc(100vw-2.5rem))] -translate-x-1/2 rounded-xl border border-stone-200/90 bg-white px-3 py-2.5 text-left opacity-0 shadow-lg transition-opacity duration-200 group-hover/cite:pointer-events-auto group-hover/cite:opacity-100 group-focus-within/cite:pointer-events-auto group-focus-within/cite:opacity-100 dark:border-stone-700 dark:bg-stone-900 ${popoverPositionClass}`}
      >
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-base leading-none" aria-hidden="true">
            📄
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
              사내 문서 출처
            </p>
            <p className="mt-0.5 text-sm font-bold leading-snug text-stone-900 dark:text-stone-50">
              {title}
            </p>
            {snippet ? (
              <p className="mt-1.5 text-xs leading-relaxed text-stone-600 dark:text-stone-300">
                {snippet}
              </p>
            ) : (
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                사내 DB에서 검색된 참고 사례입니다.
              </p>
            )}
          </div>
        </div>
      </div>
    </span>
  )
}
