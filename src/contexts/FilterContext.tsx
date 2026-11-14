import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { differenceInCalendarMonths, isValid, parseISO } from 'date-fns'
import { APP_CONFIG } from '@/config/app'

export type PresetPeriod = '1m' | '3m' | '6m' | '12m' | 'ytd'
/** A preset, or 'custom' for the dates chosen in the period selector. */
export type PeriodKey = PresetPeriod | 'custom'

export const PERIOD_OPTIONS: { key: PresetPeriod; label: string; months: number }[] = [
  { key: '1m', label: 'Last month', months: 1 },
  { key: '3m', label: 'Last 3 months', months: 3 },
  { key: '6m', label: 'Last 6 months', months: 6 },
  { key: '12m', label: 'Last 12 months', months: 12 },
  { key: 'ytd', label: 'Programme to date', months: 12 },
]

/** A custom reporting window, both ends inclusive, as `yyyy-MM-dd`. */
export interface DateRange {
  from: string
  to: string
}

interface FilterContextValue {
  period: PeriodKey
  setPeriod: (p: PresetPeriod) => void
  /** Months the trend charts cover. For a custom range, the months it spans. */
  periodMonths: number
  /**
   * The custom window when `period` is 'custom', else null. While it is set, the
   * reporting pages (dashboards, analytics, reports, exports) see only the visits,
   * findings and actions inside it; the presets only set the trend charts' span.
   */
  customRange: DateRange | null
  setCustomRange: (r: DateRange) => void
  /**
   * 'all', an outlet id, `brand:<brandId>` for every branch of a company, or
   * `tag:<tag>` for every branch carrying a tag (its own or its company's).
   */
  outletScope: string
  setOutletScope: (id: string) => void
}

const FilterContext = createContext<FilterContextValue | null>(null)

const PERIOD_KEY = `${APP_CONFIG.storagePrefix}.filter.period`
const RANGE_KEY = `${APP_CONFIG.storagePrefix}.filter.range`
const OUTLET_KEY = `${APP_CONFIG.storagePrefix}.filter.outlet`

function readStored(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage disabled or full — the selection simply will not survive a reload */
  }
}

function readRange(): DateRange | null {
  try {
    const r = JSON.parse(readStored(RANGE_KEY, 'null')) as DateRange | null
    return r && isValid(parseISO(r.from)) && isValid(parseISO(r.to)) && r.from <= r.to ? r : null
  } catch {
    return null
  }
}

export function FilterProvider({ children }: { children: ReactNode }) {
  // Persisted so the chosen outlet and period survive a page refresh.
  const [range, setRange] = useState<DateRange | null>(readRange)
  const [period, setPeriodState] = useState<PeriodKey>(() => {
    const stored = readStored(PERIOD_KEY, '12m')
    if (stored === 'custom') return readRange() ? 'custom' : '12m'
    return PERIOD_OPTIONS.some((p) => p.key === stored) ? (stored as PeriodKey) : '12m'
  })
  const [outletScope, setOutletScopeState] = useState<string>(() => readStored(OUTLET_KEY, 'all'))

  const setPeriod = useCallback((p: PresetPeriod) => {
    setPeriodState(p)
    writeStored(PERIOD_KEY, p)
  }, [])
  const setCustomRange = useCallback((r: DateRange) => {
    const ordered = r.from <= r.to ? r : { from: r.to, to: r.from }
    setRange(ordered)
    setPeriodState('custom')
    writeStored(RANGE_KEY, JSON.stringify(ordered))
    writeStored(PERIOD_KEY, 'custom')
  }, [])
  const setOutletScope = useCallback((id: string) => {
    setOutletScopeState(id)
    writeStored(OUTLET_KEY, id)
  }, [])

  const value = useMemo(() => {
    const customRange = period === 'custom' ? range : null
    const periodMonths = customRange
      ? Math.max(1, differenceInCalendarMonths(parseISO(customRange.to), parseISO(customRange.from)) + 1)
      : (PERIOD_OPTIONS.find((p) => p.key === period)?.months ?? 12)
    return { period, setPeriod, periodMonths, customRange, setCustomRange, outletScope, setOutletScope }
  }, [period, range, outletScope, setPeriod, setCustomRange, setOutletScope])
  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
}

export function useFilters(): FilterContextValue {
  const ctx = useContext(FilterContext)
  if (!ctx) throw new Error('useFilters must be used within FilterProvider')
  return ctx
}

/** The date a visit belongs to for reporting: when it happened, else when it is booked. */
export function visitReportDate(v: { visitDate: string | null; scheduledDate: string }): string {
  return (v.visitDate ?? v.scheduledDate).slice(0, 10)
}

export function inRange(date: string | null | undefined, r: DateRange): boolean {
  if (!date) return false
  const d = date.slice(0, 10)
  return d >= r.from && d <= r.to
}
