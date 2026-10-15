import type { ReactNode } from 'react'

import type { NavIcon } from '../../lib/app-navigation'

type EmptyStateProps = {
  icon?: NavIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

/** 목록이 비었을 때 공용 안내 블록 */
export function EmptyState({ icon: Icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[16px] border border-dashed border-border-strong bg-surface px-[20px] py-[36px] text-center ${className}`}
    >
      {Icon ? (
        <span
          className="mb-[12px] inline-flex h-[44px] w-[44px] items-center justify-center rounded-[14px] bg-surface-2 text-fg-muted"
          aria-hidden="true"
        >
          <Icon className="h-[22px] w-[22px]" />
        </span>
      ) : null}
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description ? (
        <p className="mt-[4px] max-w-[360px] text-xs leading-relaxed text-fg-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-[14px]">{action}</div> : null}
    </div>
  )
}
