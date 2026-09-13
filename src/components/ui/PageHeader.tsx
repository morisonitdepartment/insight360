import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

export function PageHeader({ title, subtitle, actions, badge, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; badge?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 md:flex-row md:items-end md:justify-between', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="page-title">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0 no-print">{actions}</div>}
    </div>
  )
}
