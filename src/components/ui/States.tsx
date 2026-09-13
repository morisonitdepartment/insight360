import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, Loader2, type LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'

export function EmptyState({ title = 'Nothing here yet', message, icon: Icon = Inbox, action, className }: { title?: string; message?: string; icon?: LucideIcon; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center px-6 py-12', className)} role="status">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-navy-800 dark:text-slate-500">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {message && <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function LoadingState({ label = 'Loading…', className, full = false }: { label?: string; className?: string; full?: boolean }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400', full ? 'min-h-[60vh]' : 'py-12', className)} role="status" aria-live="polite">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center" role="alert">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      {message && <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">{message}</p>}
      {onRetry && (
        <button type="button" className="btn-secondary mt-4" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/70 dark:bg-navy-800', className)} aria-hidden />
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-80" />
    </div>
  )
}
