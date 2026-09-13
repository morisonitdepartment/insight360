import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

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

export function FilterProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState<PeriodKey>('12m')
  const [outletScope, setOutletScope] = useState<string>('all')
  const value = useMemo(
    () => ({
      period,
      setPeriod,
      periodMonths: PERIOD_OPTIONS.find((p) => p.key === period)?.months ?? 12,
      outletScope,
      setOutletScope,
    }),
    [period, outletScope],
  )
  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
}

export function useFilters(): FilterContextValue {
  const ctx = useContext(FilterContext)
  if (!ctx) throw new Error('useFilters must be used within FilterProvider')
  return ctx
}
