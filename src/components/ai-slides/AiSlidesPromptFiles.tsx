import {
  AI_SLIDES_GUIDE_MODES,
  type AiSlidesGuideMode,
  type AiSlidesTemplate,
} from '../../data/ai-slides-catalog'
import { aiSlidesTemplatePromptLabel } from '../../data/ai-slides-catalog'

type AiSlidesPromptFilesProps = {
  template: AiSlidesTemplate
  guideMode: AiSlidesGuideMode
  onRemove: () => void
}

/** Genspark `.prompt-files` — textarea 위 템플릿 칩 + Guide Mode 라벨 */
export function AiSlidesPromptFiles({
  template,
  guideMode,
  onRemove,
}: AiSlidesPromptFilesProps) {
  const label = aiSlidesTemplatePromptLabel(template)
  const guideLabel =
    AI_SLIDES_GUIDE_MODES.find((m) => m.id === guideMode)?.label ?? 'Standard'

  return (
    <div className="prompt-files mb-2 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
      <div className="inline-flex h-10 min-w-0 max-w-full items-center gap-2 rounded-[10px] border border-gray-200 bg-[#F9FAFB] py-1 pl-1 pr-1.5 dark:border-stone-600 dark:bg-stone-800/80">
        <span className="flex h-8 w-11 shrink-0 overflow-hidden rounded-md border border-gray-200/80 bg-white dark:border-stone-600 dark:bg-stone-900">
          {template.thumbnailUrl ? (
            <img
              src={template.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover object-top"
            />
          ) : (
            <span
              className="block h-full w-full"
              style={{
                background: `linear-gradient(135deg, ${template.preview.from}, ${template.preview.to})`,
              }}
            />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug text-[#0D0D0D] dark:text-stone-50">
          {label}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#737373] transition hover:bg-gray-200/80 hover:text-[#0D0D0D] dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-100"
          aria-label={`${label} 제거`}
        >
          ×
        </button>
      </div>
      <span className="shrink-0 text-[13px] font-medium text-[#737373] dark:text-stone-400">
        {guideLabel}
      </span>
    </div>
  )
}
