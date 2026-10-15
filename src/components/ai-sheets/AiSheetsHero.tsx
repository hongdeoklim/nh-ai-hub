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
          className="flex gap-3.5 rounded-xl border border-border/90 bg-surface/80 px-4 py-3 shadow-sm transition hover:border-orange-200 hover:shadow-md"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand md:text-[13px]">
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold leading-snug text-fg md:text-[14px]">
              {line.title}
            </span>
            <span className="mt-0.5 block text-[12px] leading-snug text-fg-subtle md:text-[13px]">
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
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand md:text-[11px]">
          <span aria-hidden>✦</span> NH-AX-HUB · AI Sheets
        </span>
        <h1 className="mt-3 text-[22px] font-bold leading-tight tracking-tight text-fg md:text-[26px]">
          스프레드시트와 대화하세요
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted md:text-[14px]">
          Google Sheets를 연결하거나 파일을 올리면, 데이터를 검색·분석·보강해 드립니다.
        </p>
        <FeatureLinesList compact />
      </header>
    )
  }

  return (
    <header className="sheets-agent-hero mb-6 text-center md:mb-8">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand md:text-[11px]">
        <span aria-hidden>✦</span> NH-AX-HUB · AI Sheets
      </span>
      <h1 className="mt-3 text-[28px] font-bold leading-tight tracking-tight text-fg md:text-[34px]">
        스프레드시트와 대화하세요
      </h1>
      <p className="mx-auto mt-2 max-w-2xl text-[13px] leading-relaxed text-fg-muted md:text-[15px]">
        Google Sheets를 연결하거나 파일을 올리면, 데이터를 검색·분석·보강해 드립니다.
      </p>

      <FeatureLinesList />
    </header>
  )
}
