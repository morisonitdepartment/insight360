import type { ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Select, Input } from './Form'

export interface FilterOption {
  value: string
  label: string
}

export interface FilterDef {
  key: string
  label: string
  options: FilterOption[]
  /** Optional placeholder label for the "all" option */
  allLabel?: string
}

interface FilterBarProps {
  search?: string
  onSearch?: (v: string) => void
  searchPlaceholder?: string
  filters?: FilterDef[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
  onReset?: () => void
  children?: ReactNode
  className?: string
  resultCount?: number
}

export function FilterBar({ search, onSearch, searchPlaceholder = 'Search…', filters = [], values, onChange, onReset, children, className, resultCount }: FilterBarProps) {
  const activeCount = Object.values(values).filter((v) => v && v !== 'all').length + (search ? 1 : 0)
  return (
    <div className={cn('card p-3 flex flex-col gap-3 no-print', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {onSearch && (
          <div className="relative min-w-[200px] flex-1 sm:flex-none sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input value={search ?? ''} onChange={(e) => onSearch(e.target.value)} placeholder={searchPlaceholder} className="pl-8" aria-label="Search" />
          </div>
        )}
        {filters.map((f) => (
          <label key={f.key} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="sr-only sm:not-sr-only whitespace-nowrap">{f.label}</span>
            <Select value={values[f.key] ?? 'all'} onChange={(e) => onChange(f.key, e.target.value)} className="!w-auto min-w-[120px] !py-1.5 text-xs" aria-label={f.label}>
              <option value="all">{f.allLabel ?? `All ${f.label.toLowerCase()}`}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
        ))}
        {children}
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {resultCount !== undefined && <span className="tabular-nums whitespace-nowrap">{resultCount.toLocaleString()} results</span>}
          {onReset && activeCount > 0 && (
            <button type="button" className="btn-ghost btn-sm" onClick={onReset}>
              <X className="h-3.5 w-3.5" /> Clear ({activeCount})
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Small hook-like helper to manage filter values in page state */
export function applyFilters<T>(rows: T[], values: Record<string, string>, accessors: Record<string, (row: T) => string | null | undefined>): T[] {
  return rows.filter((r) => Object.entries(values).every(([k, v]) => !v || v === 'all' || !accessors[k] || String(accessors[k](r) ?? '') === v))
}

export function matchesSearch<T>(rows: T[], search: string, fields: (row: T) => Array<string | number | null | undefined>): T[] {
  const q = search.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((r) => fields(r).some((f) => f !== null && f !== undefined && String(f).toLowerCase().includes(q)))
}
