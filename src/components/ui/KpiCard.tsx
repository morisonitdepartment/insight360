import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'

interface KpiCardProps {
  label: string
  value: ReactNode
  /** Change vs previous period (already in display units) */
  delta?: number | null
  deltaSuffix?: string
  deltaLabel?: string
  /** When true, a negative delta is good (e.g. critical issues) */
  invertDelta?: boolean
  sub?: ReactNode
  icon?: LucideIcon
  tone?: 'default' | 'good' | 'warn' | 'critical' | 'accent'
  onClick?: () => void
  tour?: string
  className?: string
  compact?: boolean
}

const TONE: Record<NonNullable<KpiCardProps['tone']>, string> = {
  default: 'bg-slate-100 text-slate-600 dark:bg-navy-800 dark:text-slate-300',
  good: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  warn: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  critical: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  accent: 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300',
}

export function KpiCard({ label, value, delta, deltaSuffix = ' pts', deltaLabel = 'vs prev.', invertDelta = false, sub, icon: Icon, tone = 'default', onClick, tour, className, compact = false }: KpiCardProps) {
  const hasDelta = delta !== null && delta !== undefined && !Number.isNaN(delta)
  const positive = hasDelta ? (invertDelta ? (delta as number) <= 0 : (delta as number) >= 0) : true
  const neutral = hasDelta && Math.abs(delta as number) < 0.05
  const Wrapper: 'button' | 'div' = onClick ? 'button' : 'div'
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      data-tour={tour}
      className={cn(
        'card text-left flex flex-col justify-between',
        compact ? 'p-4' : 'p-5',
        onClick && 'hover:shadow-card-hover hover:border-teal-300 dark:hover:border-teal-700 transition-shadow cursor-pointer',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">{label}</p>
        {Icon && (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', TONE[tone])}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>
      <div className={cn('mt-2 font-semibold tracking-tight text-slate-900 dark:text-white tabular-nums', compact ? 'text-2xl' : 'text-[28px] leading-none')}>{value}</div>
      <div className="mt-2 flex items-center gap-2 text-xs min-h-[16px]">
        {hasDelta && (
          <span className={cn('inline-flex items-center gap-0.5 font-medium', neutral ? 'text-slate-500' : positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
            {neutral ? <Minus className="h-3 w-3" aria-hidden /> : (delta as number) >= 0 ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ArrowDownRight className="h-3 w-3" aria-hidden />}
            {(delta as number) > 0 ? '+' : ''}
            {(delta as number).toFixed(1)}
            {deltaSuffix}
            <span className="sr-only">{positive ? ' (improvement)' : ' (decline)'}</span>
          </span>
        )}
        {hasDelta && <span className="text-slate-400 dark:text-slate-500 truncate">{deltaLabel}</span>}
        {!hasDelta && sub && <span className="text-slate-500 dark:text-slate-400 truncate">{sub}</span>}
      </div>
    </Wrapper>
  )
}
