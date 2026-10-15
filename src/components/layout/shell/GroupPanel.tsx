import { NavLink } from 'react-router-dom'

import type { NavGroup } from '../../../lib/app-navigation'

type GroupPanelProps = {
  group: NavGroup
  onNavigate?: () => void
}

/** 보조 패널 — 그룹에 속한 화면 목록 (레이블 + 한 줄 설명) */
export function GroupPanel({ group, onNavigate }: GroupPanelProps) {
  const items = group.items.filter((item) => !item.hidden)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-[16px] pt-[16px]">
        <p className="text-xs leading-relaxed text-fg-muted">{group.description}</p>
      </div>
      <nav aria-label={`${group.label} 메뉴`} className="min-h-0 flex-1 overflow-y-auto px-[8px] pb-[12px] pt-[10px]">
        <ul className="flex flex-col gap-[2px]">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.matchPrefix === false}
                  onClick={() => onNavigate?.()}
                  className={({ isActive }) =>
                    `flex items-start gap-[10px] rounded-[10px] px-[10px] py-[9px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 ${
                      isActive ? 'bg-brand-soft text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`mt-[1px] inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] ${
                          isActive ? 'bg-brand text-brand-fg' : 'bg-surface-2 text-fg-muted'
                        }`}
                        aria-hidden="true"
                      >
                        <Icon className="h-[16px] w-[16px]" />
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-sm leading-snug ${isActive ? 'font-semibold' : 'font-medium'}`}>
                          {item.label}
                        </span>
                        <span className="mt-[2px] block text-[11px]! leading-snug text-fg-subtle">
                          {item.description}
                        </span>
                      </span>
                    </>
                  )}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
