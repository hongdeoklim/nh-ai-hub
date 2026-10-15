import type { ReactNode } from 'react'

import type { NavIcon } from '../../lib/app-navigation'

type PageHeaderProps = {
  /** 상단 작은 라벨 (예: 지식 · 자료실) */
  eyebrow?: string
  title: string
  description?: string
  icon?: NavIcon
  /** 우측 액션 버튼 영역 */
  actions?: ReactNode
  className?: string
}

/**
 * 페이지 공용 헤더 — 모든 화면이 동일한 제목·설명·액션 배치를 갖도록 한다.
 * 페이지 루트 컨테이너(`mx-auto w-full max-w-[1200px] px-[16px] md:px-[24px]`) 안에서 사용한다.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <header
      className={`flex flex-col gap-[12px] md:flex-row md:items-end md:justify-between ${className}`}
    >
      <div className="flex min-w-0 items-start gap-[12px]">
        {Icon ? (
          <span
            className="mt-[2px] inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[12px] bg-brand-soft text-brand"
            aria-hidden="true"
          >
            <Icon className="h-[22px] w-[22px]" />
          </span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[11px]! font-semibold uppercase tracking-[0.12em] text-brand">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="truncate text-[20px]! font-semibold tracking-tight text-fg md:text-[24px]!">
            {title}
          </h1>
          {description ? (
            <p className="mt-[4px] max-w-[720px] text-sm leading-relaxed text-fg-muted">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-[8px]">{actions}</div>
      ) : null}
    </header>
  )
}
