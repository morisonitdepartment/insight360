import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { initials, fmtDateTime } from '@/utils/format'
import { scoreBarClass } from './Badge'

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const s = size === 'xs' ? 'h-6 w-6 text-[10px]' : size === 'sm' ? 'h-7 w-7 text-[11px]' : size === 'lg' ? 'h-12 w-12 text-base' : 'h-9 w-9 text-xs'
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-navy-800 text-white font-semibold dark:bg-teal-700', s, className)} aria-hidden>
      {initials(name)}
    </span>
  )
}

export function ProgressBar({ value, max = 100, className, tone, label, showValue = false, size = 'md' }: { value: number | null | undefined; max?: number; className?: string; tone?: 'score' | 'accent' | 'navy' | 'amber' | 'red' | 'green'; label?: string; showValue?: boolean; size?: 'sm' | 'md' }) {
  const v = value ?? 0
  const pct = Math.max(0, Math.min(100, (v / max) * 100))
  const bar = tone === 'score' || !tone ? scoreBarClass(value) : tone === 'accent' ? 'bg-teal-500' : tone === 'navy' ? 'bg-navy-700 dark:bg-navy-400' : tone === 'amber' ? 'bg-amber-500' : tone === 'red' ? 'bg-red-500' : 'bg-emerald-500'
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-navy-800', size === 'sm' ? 'h-1.5' : 'h-2')} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <div className={cn('h-full rounded-full transition-all', bar)} style={{ width: `${pct}%` }} />
      </div>
      {showValue && <span className="text-xs tabular-nums text-slate-600 dark:text-slate-300 w-10 text-right">{value === null || value === undefined ? '—' : `${Math.round(v)}%`}</span>}
    </div>
  )
}

export interface TabItem<T extends string = string> {
  key: T
  label: ReactNode
  count?: number
}

export function Tabs<T extends string>({ tabs, active, onChange, className }: { tabs: TabItem<T>[]; active: T; onChange: (k: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn('flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-navy-800', className)}>
      {tabs.map((t) => (
        <button key={t.key} role="tab" type="button" aria-selected={active === t.key} onClick={() => onChange(t.key)} className={cn('tab flex items-center gap-1.5 whitespace-nowrap', active === t.key && 'tab-active')}>
          {t.label}
          {t.count !== undefined && <span className={cn('rounded-full px-1.5 text-[10px] font-semibold', active === t.key ? 'bg-navy-800 text-white dark:bg-teal-600' : 'bg-slate-100 text-slate-600 dark:bg-navy-800 dark:text-slate-300')}>{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export interface TimelineItem {
  at: string
  by: string
  action: string
  note?: string
}

export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  if (!items.length) return <p className="text-xs text-slate-500">No history recorded.</p>
  return (
    <ol className={cn('relative border-l border-slate-200 dark:border-navy-700 ml-2 space-y-4', className)}>
      {items.map((it, i) => (
        <li key={i} className="ml-4">
          <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-teal-500 ring-4 ring-white dark:ring-navy-900" aria-hidden />
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{it.action}</p>
            <time className="text-[11px] text-slate-500 dark:text-slate-400" dateTime={it.at}>
              {fmtDateTime(it.at)}
            </time>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">by {it.by}</p>
          {it.note && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-navy-800/60 rounded-md px-2.5 py-1.5 border border-slate-100 dark:border-navy-800">{it.note}</p>}
        </li>
      ))}
    </ol>
  )
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-white tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  )
}

export function DescriptionList({ items, columns = 2, className }: { items: { label: ReactNode; value: ReactNode }[]; columns?: 1 | 2 | 3 | 4; className?: string }) {
  const cols = columns === 1 ? 'grid-cols-1' : columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : columns === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'
  return (
    <dl className={cn('grid gap-x-6 gap-y-3', cols, className)}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{it.label}</dt>
          <dd className="mt-0.5 text-sm text-slate-800 dark:text-slate-100 break-words">{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-slate-200 dark:border-navy-800', className)} />
}

/** Automated insight label — clearly marked as rule-based, not AI. */
export function AutomatedLabel() {
  return <span className="inline-flex items-center rounded border border-slate-200 dark:border-navy-700 px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Automated insight</span>
}
