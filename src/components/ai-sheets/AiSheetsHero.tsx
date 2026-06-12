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
          className="flex gap-3.5 rounded-xl border border-stone-200/90 bg-white/80 px-4 py-3.5 shadow-sm dark:border-stone-700 dark:bg-stone-900/70"
        >
          <span className="flex h-[33.6px] w-[33.6px] shrink-0 items-center justify-center rounded-full bg-orange-100 text-[15.6px] font-semibold text-orange-900 dark:bg-orange-950/60 dark:text-orange-200">
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-[15.6px] font-medium leading-snug text-stone-900 dark:text-stone-50">
              {line.title}
            </span>
            <span className="mt-0.5 block text-[15.6px] leading-snug text-stone-500 dark:text-stone-400">
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
        <p className="font-semibold uppercase tracking-wider text-orange-800 dark:text-orange-300">
          NH-AX-HUB
        </p>
        <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-tight text-stone-900 dark:text-stone-50">
          Unleash the Power of AI Sheets
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-stone-600 dark:text-stone-400">
          스프레드시트와 대화하듯 데이터를 검색·분석·보강하세요.
        </p>
        <FeatureLinesList compact />
      </header>
    )
  }

  return (
    <header className="sheets-agent-hero mb-6 text-center md:mb-8">
      <p className="font-semibold uppercase tracking-wider text-orange-800 dark:text-orange-300">
        NH-AX-HUB
      </p>
      <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-stone-900 dark:text-stone-50 md:text-[34px]">
        Unleash the Power of AI Sheets
      </h1>
      <p className="mx-auto mt-2 max-w-2xl text-[13px] leading-relaxed text-stone-600 dark:text-stone-400">
        스프레드시트와 대화하듯 데이터를 검색·분석·보강하세요.
      </p>

      <FeatureLinesList />
    </header>
  )
}
