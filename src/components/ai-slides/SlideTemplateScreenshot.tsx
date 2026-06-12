import type { AiSlidesTemplate } from '../../data/ai-slides-catalog'

type SlideTemplateScreenshotProps = {
  template: AiSlidesTemplate
  className?: string
  fillParent?: boolean
}

/** Genspark template-screenshot 대체 — 실제 슬라이드 레이아웃 미리보기 */
export function SlideTemplateScreenshot({
  template,
  className = '',
  fillParent = false,
}: SlideTemplateScreenshotProps) {
  const { preview, titleKo, style } = template
  const isDark = template.theme === 'dark'

  return (
    <div
      className={`relative w-full overflow-hidden ${
        fillParent ? 'h-full' : 'aspect-[16/10]'
      } ${className}`}
      style={{
        background: `linear-gradient(145deg, ${preview.from} 0%, ${preview.to} 100%)`,
      }}
    >
      <div
        className={`absolute inset-3 flex flex-col overflow-hidden rounded-md border shadow-md ${
          isDark
            ? 'border-stone-600/80 bg-stone-900/95'
            : 'border-white/80 bg-white/95'
        }`}
      >
        <div
          className="h-1.5 shrink-0"
          style={{ backgroundColor: preview.accent }}
        />
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <p
            className={`text-[13px] font-bold leading-tight ${
              isDark ? 'text-stone-100' : 'text-stone-900'
            }`}
          >
            {titleKo}
          </p>
          <p
            className={`mt-0.5 text-[13px] uppercase tracking-wide ${
              isDark ? 'text-stone-400' : 'text-stone-500'
            }`}
          >
            {style} · slide 01
          </p>
          <ul className={`mt-2 space-y-1 ${isDark ? 'text-stone-300' : 'text-stone-600'}`}>
            {[0.85, 0.7, 0.55].map((w) => (
              <li key={w} className="flex items-center gap-1.5">
                <span
                  className="h-1 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: preview.accent }}
                />
                <span
                  className={`h-1.5 rounded ${isDark ? 'bg-stone-600' : 'bg-stone-200'}`}
                  style={{ width: `${w * 100}%` }}
                />
              </li>
            ))}
          </ul>
          <div className="mt-auto flex gap-2 pt-2">
            <div
              className={`h-10 flex-1 rounded ${isDark ? 'bg-stone-800' : 'bg-stone-100'}`}
              style={{
                background: `linear-gradient(135deg, ${preview.accent}22, ${preview.accent}08)`,
              }}
            />
            <div
              className={`h-10 w-1/3 rounded ${isDark ? 'bg-stone-800' : 'bg-stone-100'}`}
            />
          </div>
        </div>
      </div>
      {template.isNew ? (
        <span className="absolute right-2 top-2 rounded-full bg-orange-600 px-2 py-0.5 text-[13px] font-semibold text-white shadow">
          NEW
        </span>
      ) : null}
    </div>
  )
}
