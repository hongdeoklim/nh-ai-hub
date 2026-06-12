import type { AiModelRow } from '../../types/ai-models'
import { AI_MODEL_PROVIDER_LABELS } from '../../types/ai-models'

function mediaCostBadgeClass(costInfo: string): string {
  const level = costInfo.trim()
  if (level === '저렴' || level === '초저가') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
  }
  if (level === '높음' || level === '프리미엄') {
    return 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
  }
  return 'bg-stone-200/90 text-stone-700 dark:bg-stone-700/80 dark:text-stone-200'
}

export type MediaEngineBentoPanelProps = {
  engines: readonly AiModelRow[]
  selectedModelId: string
  loading?: boolean
  disabled?: boolean
  onSelect: (apiId: string) => void
  className?: string
}

export function MediaEngineBentoPanel({
  engines,
  selectedModelId,
  loading = false,
  disabled = false,
  onSelect,
  className = '',
}: MediaEngineBentoPanelProps) {
  const safeEngines = Array.isArray(engines) ? engines : []

  if (loading) {
    return (
      <div
        className={`rounded-xl border border-stone-200/90 bg-white p-3 shadow-lg dark:border-stone-700 dark:bg-stone-900 ${className}`}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[0, 1].map((slot) => (
            <div
              key={slot}
              className="h-24 animate-pulse rounded-lg bg-stone-100 dark:bg-stone-800/80"
            />
          ))}
        </div>
      </div>
    )
  }

  if (safeEngines.length === 0) {
    return (
      <div
        className={`rounded-xl border border-stone-200/90 bg-white px-3 py-4 text-center text-[12px] text-stone-500 shadow-lg dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 ${className}`}
      >
        사용 가능한 미디어 엔진이 없습니다.
      </div>
    )
  }

  return (
    <div
      className={`rounded-xl border border-stone-200/90 bg-white p-2 shadow-lg dark:border-stone-700 dark:bg-stone-900 ${className}`}
      role="listbox"
      aria-label="미디어 엔진 선택"
    >
      <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        엔진 선택
      </p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {safeEngines?.map((engine) => {
          const cost = engine?.cost_info?.trim() || '보통'
          const guide =
            engine?.description?.trim() ||
            engine?.hint?.trim() ||
            '안내 준비 중'
          const selected = engine?.api_id === selectedModelId
          return (
            <button
              key={engine?.api_id ?? engine?.id}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={disabled}
              onClick={() => engine?.api_id && onSelect(engine.api_id)}
              className={`flex min-h-[5.5rem] flex-col gap-1 rounded-lg border px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
                selected
                  ? 'border-violet-400/80 bg-violet-50/90 ring-1 ring-violet-400/40 dark:border-violet-600/70 dark:bg-violet-950/35 dark:ring-violet-500/30'
                  : 'border-stone-200/80 bg-stone-50/50 hover:border-stone-300 hover:bg-stone-100/80 dark:border-stone-700 dark:bg-stone-800/40 dark:hover:border-stone-600 dark:hover:bg-stone-800/70'
              }`}
            >
              <span className="flex min-w-0 items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-semibold text-stone-900 dark:text-stone-50">
                    {engine?.display_name ?? '미디어 엔진'}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-stone-500 dark:text-stone-400">
                    {engine?.provider
                      ? AI_MODEL_PROVIDER_LABELS[engine.provider]
                      : '—'}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none ${mediaCostBadgeClass(cost)}`}
                >
                  {cost}
                </span>
              </span>
              <span className="line-clamp-2 text-[10px] leading-snug text-stone-600 dark:text-stone-400">
                {guide}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function mediaEngineLabel(
  engines: readonly AiModelRow[] | null | undefined,
  selectedModelId: string,
): string {
  const safeEngines = Array.isArray(engines) ? engines : []
  const match = safeEngines.find((engine) => engine?.api_id === selectedModelId)
  return match?.display_name ?? selectedModelId
}
