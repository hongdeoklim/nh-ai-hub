import { useId, useState } from 'react'

const SHEETS_MODE_FEATURES = [
  '정보 자동 수집',
  '수식 자동 생성',
  '템플릿 자동 구축',
] as const

type AiSheetsModeAccordionProps = {
  defaultOpen?: boolean
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-pink-900 transition-transform duration-200 dark:text-pink-200 ${
        open ? 'rotate-180' : ''
      }`}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function AiSheetsModeAccordion({
  defaultOpen = true,
}: AiSheetsModeAccordionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()

  return (
    <div className="ai-sheets-mode-accordion rounded-tl-xl rounded-tr-xl border border-[#DEC6C5] dark:border-pink-900/40">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex h-[36px] w-full cursor-pointer items-center justify-between rounded-tl-xl rounded-tr-xl bg-[#F6ECEC] px-3 pb-[7px] text-left text-sm font-bold leading-tight text-pink-950 dark:bg-pink-950/30 dark:text-pink-100"
      >
        <span className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-white/70 text-[11px] text-pink-900 dark:bg-pink-950/50 dark:text-pink-100">
            ▦
          </span>
          AI 시트 모드
        </span>
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <div
          id={panelId}
          className="flex flex-col gap-2.5 bg-[#FFFBFB] px-3 pb-6 pt-4 dark:bg-[#333333]"
        >
          <p className="text-[13px] font-semibold leading-snug text-pink-950 dark:text-pink-100">
            자동으로 작동하는 Excel — 필요한 것만 설명하세요
          </p>
          <p className="text-[12px] leading-relaxed text-pink-900/85 dark:text-pink-100/85">
            {SHEETS_MODE_FEATURES.join(', ')}
          </p>
          <p className="text-[12px] leading-relaxed text-stone-600 dark:text-stone-400">
            원시 데이터에서 인사이트까지 몇 초 만에
          </p>
        </div>
      ) : null}
    </div>
  )
}
