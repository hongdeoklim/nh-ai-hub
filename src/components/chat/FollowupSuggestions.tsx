import { IconCornerDownLeft, IconSparkles } from '../common/icons'

type FollowupSuggestionsProps = {
  items: string[]
  onSelect: (text: string) => void
  disabled?: boolean
  /** gemini 말풍선은 왼쪽 아이콘만큼 들여 쓴다 */
  indent?: boolean
}

/** 마지막 AI 답변 아래의 "이어서 물어보기" 추천 질문 칩 */
export function FollowupSuggestions({
  items,
  onSelect,
  disabled = false,
  indent = false,
}: FollowupSuggestionsProps) {
  if (items.length === 0) return null
  return (
    <nav
      aria-label="이어서 물어보기"
      className={`-mt-1 flex flex-col gap-2 md:-mt-2 ${indent ? 'pl-9 md:pl-10' : ''}`}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-fg-subtle">
        <IconSparkles className="h-3.5 w-3.5 text-brand" />
        이어서 물어보기
      </p>
      <ul className="flex flex-col gap-1.5 md:flex-row md:flex-wrap">
        {items.map((item) => (
          <li key={item} className="min-w-0 md:max-w-full">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(item)}
              className="group flex w-full min-w-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm text-fg transition hover:border-brand/40 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
            >
              <span className="min-w-0 flex-1 md:max-w-[22rem] md:truncate">{item}</span>
              <IconCornerDownLeft className="h-3.5 w-3.5 shrink-0 text-fg-subtle transition group-hover:text-brand" />
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
