import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { APP_CONFIG } from '@/config/app'

export type PeriodKey = '1m' | '3m' | '6m' | '12m' | 'ytd'

export const PERIOD_OPTIONS: { key: PeriodKey; label: string; months: number }[] = [
  { key: '1m', label: 'Last month', months: 1 },
  { key: '3m', label: 'Last 3 months', months: 3 },
  { key: '6m', label: 'Last 6 months', months: 6 },
  { key: '12m', label: 'Last 12 months', months: 12 },
  { key: 'ytd', label: 'Programme to date', months: 12 },
]

interface FilterContextValue {
  period: PeriodKey
  setPeriod: (p: PeriodKey) => void
  periodMonths: number
  /** 'all' or an outlet id */
  outletScope: string
  setOutletScope: (id: string) => void
}

const FilterContext = createContext<FilterContextValue | null>(null)

const PERIOD_KEY = `${APP_CONFIG.storagePrefix}.filter.period`
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

export function FilterProvider({ children }: { children: ReactNode }) {
  // Persisted so the chosen outlet and period survive a page refresh.
  const [period, setPeriodState] = useState<PeriodKey>(() => {
    const stored = readStored(PERIOD_KEY, '12m')
    return PERIOD_OPTIONS.some((p) => p.key === stored) ? (stored as PeriodKey) : '12m'
  })
  const [outletScope, setOutletScopeState] = useState<string>(() => readStored(OUTLET_KEY, 'all'))

  const setPeriod = useCallback((p: PeriodKey) => {
    setPeriodState(p)
    writeStored(PERIOD_KEY, p)
  }, [])
  const setOutletScope = useCallback((id: string) => {
    setOutletScopeState(id)
    writeStored(OUTLET_KEY, id)
  }, [])
  const value = useMemo(
    () => ({
      period,
      setPeriod,
      periodMonths: PERIOD_OPTIONS.find((p) => p.key === period)?.months ?? 12,
      outletScope,
      setOutletScope,
    }),
    [period, outletScope, setPeriod, setOutletScope],
  )
  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
}

export function useFilters(): FilterContextValue {
  const ctx = useContext(FilterContext)
  if (!ctx) throw new Error('useFilters must be used within FilterProvider')
  return ctx
}
