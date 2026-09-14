import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Dataset, Evidence, Outlet, Visit } from '@/types'
import { getRepository, type DatasetPatch, type EvidenceUploadMeta } from '@/repositories'
import { deriveOutlets } from '@/services/derive'
import type { ActionContext } from '@/services/actions'
import { useAuth } from './AuthContext'
import { useFilters } from './FilterContext'
import { useNow } from '@/hooks'

export type ActionRecipe = (data: Dataset, ctx: ActionContext) => DatasetPatch

interface DataContextValue {
  data: Dataset | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /** Run a pure action reducer, apply its patch in memory and persist it. */
  dispatch: (recipe: ActionRecipe) => Promise<void>
  uploadEvidence: (file: File | null, meta: EvidenceUploadMeta) => Promise<Evidence>
  resetDemo: () => Promise<void>
  /**
   * Outlets the user may see AND that match the top-bar outlet selector.
   * This is what dashboards, registers and reports should use so the selector
   * actually narrows the whole application.
   */
  scopedOutlets: Outlet[]
  /** Visits matching the same rule (shopper scoping also applied). */
  scopedVisits: Visit[]
  scopedOutletIds: Set<string>
  /**
   * Everything the user is authorised to see, ignoring the outlet selector.
   * Use this for outlet detail pages, comparisons, peer benchmarks, the outlet
   * selector itself and outlet master data — places that must not collapse to a
   * single outlet just because one is selected.
   */
  authorizedOutlets: Outlet[]
  authorizedVisits: Visit[]
  /** True when the selector is narrowing the view to one outlet. */
  isOutletFiltered: boolean
}

const DataContext = createContext<DataContextValue | null>(null)

const DERIVE_TRIGGERS: (keyof Dataset)[] = ['visits', 'findings', 'outlets']

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, scopedOutletIds } = useAuth()
  const { outletScope } = useFilters()
  const now = useNow()
  const repo = getRepository()
  const [data, setData] = useState<Dataset | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const dataRef = useRef<Dataset | null>(null)
  dataRef.current = data

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const ds = await repo.loadDataset()
      setData(ds)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [repo])

  useEffect(() => {
    if (user) void reload()
    else {
      setData(null)
      setLoading(false)
    }
  }, [user, reload])

  const dispatch = useCallback(
    async (recipe: ActionRecipe) => {
      const current = dataRef.current
      if (!current || !user) throw new Error('Data not loaded')
      const patch = recipe(current, { user, now })
      if (!Object.keys(patch).length) return
      let next: Dataset = { ...current, ...patch }
      if (DERIVE_TRIGGERS.some((k) => k in patch)) {
        next = { ...next, outlets: deriveOutlets(next.outlets, next.visits, next.findings, next.thresholds) }
      }
      dataRef.current = next
      setData(next)
      await repo.persist(patch)
    },
    [repo, user, now],
  )

  const uploadEvidence = useCallback((file: File | null, meta: EvidenceUploadMeta) => repo.uploadEvidence(file, meta), [repo])

  const resetDemo = useCallback(async () => {
    await repo.reset()
    await reload()
  }, [repo, reload])

  const scoped = useMemo(() => {
    const empty = { outlets: [] as Outlet[], visits: [] as Visit[], ids: new Set<string>(), authorizedOutlets: [] as Outlet[], authorizedVisits: [] as Visit[], filtered: false }
    if (!data || !user) return empty

    // 1. Authorisation: what this user is entitled to see at all.
    const authorizedOutlets = scopedOutletIds ? data.outlets.filter((o) => scopedOutletIds.includes(o.id)) : data.outlets
    const authorizedIds = new Set(authorizedOutlets.map((o) => o.id))
    let authorizedVisits = data.visits.filter((v) => authorizedIds.has(v.outletId))
    if (user.role === 'shopper') authorizedVisits = authorizedVisits.filter((v) => v.shopperId === user.shopperId)

    // 2. Selection: the top-bar outlet selector narrows it further.
    const selectionValid = outletScope !== 'all' && authorizedIds.has(outletScope)
    const outlets = selectionValid ? authorizedOutlets.filter((o) => o.id === outletScope) : authorizedOutlets
    const ids = new Set(outlets.map((o) => o.id))
    const visits = selectionValid ? authorizedVisits.filter((v) => ids.has(v.outletId)) : authorizedVisits

    return { outlets, visits, ids, authorizedOutlets, authorizedVisits, filtered: selectionValid }
  }, [data, user, scopedOutletIds, outletScope])

  const value = useMemo<DataContextValue>(
    () => ({
      data,
      loading,
      error,
      reload,
      dispatch,
      uploadEvidence,
      resetDemo,
      scopedOutlets: scoped.outlets,
      scopedVisits: scoped.visits,
      scopedOutletIds: scoped.ids,
      authorizedOutlets: scoped.authorizedOutlets,
      authorizedVisits: scoped.authorizedVisits,
      isOutletFiltered: scoped.filtered,
    }),
    [data, loading, error, reload, dispatch, uploadEvidence, resetDemo, scoped],
  )
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue & { data: Dataset } {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  if (!ctx.data) throw new Error('Dataset not loaded')
  return ctx as DataContextValue & { data: Dataset }
}

export function useDataState(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useDataState must be used within DataProvider')
  return ctx
}
