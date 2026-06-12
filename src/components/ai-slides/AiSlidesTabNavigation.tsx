import type { ReactNode } from 'react'

export type AiSlidesTabId = 'explore' | 'my-templates'

type AiSlidesTabNavigationProps = {
  value: AiSlidesTabId
  onChange: (tab: AiSlidesTabId) => void
  myTemplatesCount?: number
}

const TABS: { id: AiSlidesTabId; label: string }[] = [
  { id: 'explore', label: 'Explore' },
  { id: 'my-templates', label: 'My Templates' },
]

/** Genspark slides-template-selector `.tab-navigation` 스타일 */
export function AiSlidesTabNavigation({
  value,
  onChange,
  myTemplatesCount = 0,
}: AiSlidesTabNavigationProps) {
  return (
    <div
      className="tab-navigation mb-4 flex h-10 w-full items-end gap-8 border-b border-[#E5E5E5] dark:border-stone-700"
      role="tablist"
      aria-label="템플릿 탐색"
    >
      {TABS.map((tab) => {
        const active = value === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`ai-slides-tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`ai-slides-tabpanel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={[
              '-mb-px inline-flex h-10 shrink-0 items-center border-b-2 pb-0 pt-0',
              'text-[16px] font-normal leading-[1.5] transition-colors duration-150',
              'outline-none focus-visible:ring-2 focus-visible:ring-orange-500/25 focus-visible:ring-offset-2',
              active
                ? 'border-[#0D0D0D] text-[#0D0D0D] dark:border-stone-100 dark:text-stone-50'
                : 'border-transparent text-[#737373] hover:text-[#0D0D0D] dark:text-stone-400 dark:hover:text-stone-200',
            ].join(' ')}
          >
            {tab.label}
            {tab.id === 'my-templates' && myTemplatesCount > 0 ? (
              <span
                className={`ml-1.5 text-[14px] tabular-nums ${
                  active ? 'text-[#525252] dark:text-stone-400' : 'text-[#A3A3A3]'
                }`}
              >
                {myTemplatesCount}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export function AiSlidesTabPanel({
  tabId,
  activeTab,
  children,
}: {
  tabId: AiSlidesTabId
  activeTab: AiSlidesTabId
  children: ReactNode
}) {
  if (activeTab !== tabId) return null
  return (
    <div
      id={`ai-slides-tabpanel-${tabId}`}
      role="tabpanel"
      aria-labelledby={`ai-slides-tab-${tabId}`}
      className="tab-content"
    >
      {children}
    </div>
  )
}
