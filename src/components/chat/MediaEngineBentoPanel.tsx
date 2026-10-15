import type { AiModelRow } from '../../types/ai-models'
import { AI_MODEL_PROVIDER_LABELS } from '../../types/ai-models'

function mediaCostBadgeClass(costInfo: string): string {
 const level = costInfo.trim()
 if (level === '저렴' || level === '초저가') {
 return 'bg-success-soft text-success'
  }
 if (level === '높음' || level === '프리미엄') {
 return 'bg-warning-soft text-warning'
  }
 return 'bg-surface-3/90 text-fg-muted'
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
 const safeEngines: readonly AiModelRow[] = Array.isArray(engines)
    ? engines
    : []

 if (loading) {
 return (
      <div
 className={`rounded-xl border border-border/90 bg-surface p-3 shadow-lg ${className}`}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[0, 1].map((slot) => (
            <div
 key={slot}
 className="h-24 animate-pulse rounded-lg bg-surface-2"
            />
          ))}
        </div>
      </div>
    )
  }

 if (safeEngines.length === 0) {
 return (
      <div
 className={`rounded-xl border border-border/90 bg-surface px-3 py-4 text-center text-[12px] text-fg-subtle shadow-lg ${className}`}
      >
 사용 가능한 미디어 엔진이 없습니다.
      </div>
    )
  }

 return (
    <div
 className={`rounded-xl border border-border/90 bg-surface p-2 shadow-lg ${className}`}
 role="listbox"
 aria-label="미디어 엔진 선택"
    >
      <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
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
                  : 'border-border/80 bg-bg/50 hover:border-border-strong hover:bg-surface-2/80'
              }`}
            >
              <span className="flex min-w-0 items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-semibold text-fg">
                    {engine?.display_name ?? '미디어 엔진'}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-fg-subtle">
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
              <span className="line-clamp-2 text-[10px] leading-snug text-fg-muted">
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
 const safeEngines: readonly AiModelRow[] = Array.isArray(engines)
    ? engines
    : []
 const match = safeEngines.find((engine) => engine?.api_id === selectedModelId)
 return match?.display_name ?? selectedModelId
}
