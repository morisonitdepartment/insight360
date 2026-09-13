import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

export function Card({ children, className, padded = false, tour }: { children: ReactNode; className?: string; padded?: boolean; tour?: string }) {
  return (
    <section className={cn('card', padded && 'p-5', className)} data-tour={tour}>
      {children}
    </section>
  )
}

export function CardHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn('card-header', className)}>
      <div className="min-w-0">
        <h3 className="card-title">{title}</h3>
        {subtitle && <p className="card-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card-body', className)}>{children}</div>
}
