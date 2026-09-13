import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Dataset, Evidence, Outlet, Visit } from '@/types'
import { getRepository, type DatasetPatch, type EvidenceUploadMeta } from '@/repositories'
import { deriveOutlets } from '@/services/derive'
import type { ActionContext } from '@/services/actions'
import { useAuth } from './AuthContext'
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
  /** Outlets visible to the signed-in user (manager scoping applied) */
  scopedOutlets: Outlet[]
  /** Visits visible to the signed-in user (manager + shopper scoping applied) */
  scopedVisits: Visit[]
  scopedOutletIds: Set<string>
}

const DataContext = createContext<DataContextValue | null>(null)

const DERIVE_TRIGGERS: (keyof Dataset)[] = ['visits', 'findings', 'outlets']

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, scopedOutletIds } = useAuth()
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
    if (!data || !user) return { outlets: [] as Outlet[], visits: [] as Visit[], ids: new Set<string>() }
    const outlets = scopedOutletIds ? data.outlets.filter((o) => scopedOutletIds.includes(o.id)) : data.outlets
    const ids = new Set(outlets.map((o) => o.id))
    let visits = data.visits.filter((v) => ids.has(v.outletId))
    if (user.role === 'shopper') visits = visits.filter((v) => v.shopperId === user.shopperId)
    return { outlets, visits, ids }
  }, [data, user, scopedOutletIds])

  const value = useMemo<DataContextValue>(
    () => ({ data, loading, error, reload, dispatch, uploadEvidence, resetDemo, scopedOutlets: scoped.outlets, scopedVisits: scoped.visits, scopedOutletIds: scoped.ids }),
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
