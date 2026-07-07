import { AI_SHEETS_FEATURE_LINES } from '../../data/ai-sheets-starters'

type AiSheetsHeroProps = {
  compact?: boolean
}

function FeatureLinesList({ compact = false }: { compact?: boolean }) {
  return (
    <ul
      className={`space-y-3 text-left ${compact ? 'mt-4' : 'mx-auto mt-6 max-w-3xl'}`}
    >
      {AI_SHEETS_FEATURE_LINES.map((line, index) => (
        <li
          key={line.id}
          className="flex gap-3.5 rounded-xl border border-stone-200/90 bg-white/80 px-4 py-3 shadow-sm transition hover:border-orange-200 hover:shadow-md dark:border-stone-700 dark:bg-stone-900/70 dark:hover:border-orange-800/60"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[12px]! font-bold text-orange-900 dark:bg-orange-950/60 dark:text-orange-200 md:text-[13px]!">
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-[13px]! font-semibold leading-snug text-stone-900 dark:text-stone-50 md:text-[14px]!">
              {line.title}
            </span>
            <span className="mt-0.5 block text-[12px]! leading-snug text-stone-500 dark:text-stone-400 md:text-[13px]!">
              {line.titleKo}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export function AiSheetsHero({ compact = false }: AiSheetsHeroProps) {
  if (compact) {
    return (
      <header className="sheets-agent-hero mb-5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200/80 bg-orange-50/80 px-3 py-1 text-[10px]! font-semibold uppercase tracking-[0.12em] text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-300 md:text-[11px]!">
          <span aria-hidden>✦</span> NH-AX-HUB · AI Sheets
        </span>
        <h1 className="mt-3 text-[22px]! font-bold leading-tight tracking-tight text-stone-900 dark:text-stone-50 md:text-[26px]!">
          스프레드시트와 대화하세요
        </h1>
        <p className="mt-1.5 text-[13px]! leading-relaxed text-stone-600 dark:text-stone-400 md:text-[14px]!">
          Google Sheets를 연결하거나 파일을 올리면, 데이터를 검색·분석·보강해 드립니다.
        </p>
        <FeatureLinesList compact />
      </header>
    )
  }

  return (
    <header className="sheets-agent-hero mb-6 text-center md:mb-8">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200/80 bg-orange-50/80 px-3 py-1 text-[10px]! font-semibold uppercase tracking-[0.12em] text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-300 md:text-[11px]!">
        <span aria-hidden>✦</span> NH-AX-HUB · AI Sheets
      </span>
      <h1 className="mt-3 text-[28px]! font-bold leading-tight tracking-tight text-stone-900 dark:text-stone-50 md:text-[34px]!">
        스프레드시트와 대화하세요
      </h1>
      <p className="mx-auto mt-2 max-w-2xl text-[13px]! leading-relaxed text-stone-600 dark:text-stone-400 md:text-[15px]!">
        Google Sheets를 연결하거나 파일을 올리면, 데이터를 검색·분석·보강해 드립니다.
      </p>

      <FeatureLinesList />
    </header>
  )
}
