import type { ReactNode } from 'react'

import { adminPageDesc, adminPageTitle } from './admin-ui'

type AdminPageHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
}

export function AdminPageHeader({ title, description, actions }: AdminPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h1 className={adminPageTitle}>{title}</h1>
        {description ? <p className={adminPageDesc}>{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}
