import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Dataset, Evidence, Outlet, Visit } from '@/types'
import { getRepository, type DatasetPatch, type EvidenceUploadMeta } from '@/repositories'
import { deriveOutlets } from '@/services/derive'
import { removeVisit, type ActionContext } from '@/services/actions'
import { useAuth } from './AuthContext'
import { inRange, useFilters, visitReportDate, type DateRange } from './FilterContext'
import { outletsForScope } from '@/services/groups'
import { useNow } from '@/hooks'
import { isDemoMode } from '@/config/app'
import { prepareUpload } from '@/utils/prepareUpload'
import { setLogoSources } from '@/utils/logos'
import { readPhotoStamp } from '@/utils/photoStamp'

export type ActionRecipe = (data: Dataset, ctx: ActionContext) => DatasetPatch

interface DataContextValue {
  data: Dataset | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /** Run a pure action reducer, apply its patch in memory and persist it. */
  dispatch: (recipe: ActionRecipe) => Promise<void>
  uploadEvidence: (file: File | null, meta: EvidenceUploadMeta) => Promise<Evidence>
  /** Delete the stored file, then drop the row via a removeEvidence patch. */
  deleteEvidenceFile: (id: string) => Promise<void>
  /** Super Admin: delete a visit on the server, then drop it and its records locally. */
  deleteVisit: (id: string) => Promise<void>
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
  /** True when the selector is narrowing the view (one outlet, a company or a tag). */
  isOutletFiltered: boolean
  /**
   * The same view limited to the custom reporting window, when one is set in the
   * period selector: visits, findings, alerts and actions inside it, and each
   * outlet's score recomputed from that window alone. Equal to the main view
   * otherwise. Read it through `useReportData()`.
   */
  report: ScopedView | null
}

interface ScopedView {
  data: Dataset
  outlets: Outlet[]
  visits: Visit[]
  ids: Set<string>
  authorizedOutlets: Outlet[]
  authorizedVisits: Visit[]
  filtered: boolean
}

/** Keep only what happened inside the window, and re-derive outlet scores from it. */
export function withinRange(d: Dataset, r: DateRange): Dataset {
  const visits = d.visits.filter((v) => inRange(visitReportDate(v), r))
  const findings = d.findings.filter((f) => inRange(f.createdAt, r))
  return {
    ...d,
    visits,
    findings,
    alerts: d.alerts.filter((a) => inRange(a.createdAt, r)),
    correctiveActions: d.correctiveActions.filter((a) => inRange(a.createdAt, r)),
    answers: d.answers.filter((a) => visits.some((v) => v.id === a.visitId)),
    evidence: d.evidence.filter((e) => inRange(e.capturedAt, r)),
    outlets: deriveOutlets(d.outlets, visits, findings, d.thresholds),
  }
}

export const DataContext = createContext<DataContextValue | null>(null)

const DERIVE_TRIGGERS: (keyof Dataset)[] = ['visits', 'findings', 'outlets']

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, scopedOutletIds } = useAuth()
  const { outletScope, customRange } = useFilters()
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
      // Set at once, not on the next render: an action dispatched right after
      // reload() (a new account's details) must see the reloaded data.
      dataRef.current = ds
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

  // The PDF builders run outside React; give them the current uploaded logos.
  useEffect(() => {
    if (data) setLogoSources(data.organization.logo, data.brands)
  }, [data])

  const dispatch = useCallback(
    async (recipe: ActionRecipe) => {
      const current = dataRef.current
      if (!current || !user) throw new Error('Data not loaded')
      // Live: the moment of the action itself. `useNow` only ticks once a minute
      // and a phone that slept stops the tick, so actions taken on waking were
      // stamped up to hours in the past. The demo keeps its fixed storyline date.
      const patch = recipe(current, { user, now: isDemoMode() ? now : new Date() })
      if (!Object.keys(patch).length) return
      let next: Dataset = { ...current, ...patch }
      if (DERIVE_TRIGGERS.some((k) => k in patch)) {
        next = { ...next, outlets: deriveOutlets(next.outlets, next.visits, next.findings, next.thresholds) }
      }
      dataRef.current = next
      setData(next)
      await repo.persist(patch, current)
    },
    [repo, user, now],
  )

  // Every upload passes through prepareUpload: phone photos are shrunk and
  // converted to JPEG, and a file with no type gets one from its extension.
  const uploadEvidence = useCallback(
    async (file: File | null, meta: EvidenceUploadMeta) => {
      // Read the camera's date, time and GPS first: shrinking the photo strips them.
      const stamp = await readPhotoStamp(file)
      return repo.uploadEvidence(file ? await prepareUpload(file) : null, { ...meta, stamp })
    },
    [repo],
  )
  const deleteEvidenceFile = useCallback((id: string) => repo.deleteEvidence(id), [repo])
  const deleteVisit = useCallback(
    async (id: string) => {
      if (user?.role !== 'super_admin') throw new Error('Only a Super Admin can delete visits.')
      await repo.deleteVisit(id)
      await dispatch((d, ctx) => removeVisit(d, ctx, id))
    },
    [repo, user, dispatch],
  )

  const resetDemo = useCallback(async () => {
    await repo.reset()
    await reload()
  }, [repo, reload])

  const scopeOf = useCallback(
    (ds: Dataset | null): ScopedView | null => {
      if (!ds || !user) return null
      // 1. Authorisation: what this user is entitled to see at all.
      const authorizedOutlets = scopedOutletIds ? ds.outlets.filter((o) => scopedOutletIds.includes(o.id)) : ds.outlets
      const authorizedIds = new Set(authorizedOutlets.map((o) => o.id))
      let authorizedVisits = ds.visits.filter((v) => authorizedIds.has(v.outletId))
      if (user.role === 'shopper') authorizedVisits = authorizedVisits.filter((v) => v.shopperId === user.shopperId)

      // 2. Selection: the top-bar selector narrows it further — one outlet, a
      //    company's branches or a tag's branches.
      const picked = outletsForScope(outletScope, authorizedOutlets, ds.brands)
      const outlets = picked ?? authorizedOutlets
      const ids = new Set(outlets.map((o) => o.id))
      const visits = picked ? authorizedVisits.filter((v) => ids.has(v.outletId)) : authorizedVisits
      return { data: ds, outlets, visits, ids, authorizedOutlets, authorizedVisits, filtered: !!picked }
    },
    [user, scopedOutletIds, outletScope],
  )

  const scoped = useMemo(
    () => scopeOf(data) ?? { data: data as Dataset, outlets: [] as Outlet[], visits: [] as Visit[], ids: new Set<string>(), authorizedOutlets: [] as Outlet[], authorizedVisits: [] as Visit[], filtered: false },
    [scopeOf, data],
  )
  const report = useMemo(() => (data && customRange ? scopeOf(withinRange(data, customRange)) : scoped), [scopeOf, data, customRange, scoped])

  const value = useMemo<DataContextValue>(
    () => ({
      data,
      loading,
      error,
      reload,
      dispatch,
      uploadEvidence,
      deleteEvidenceFile,
      deleteVisit,
      resetDemo,
      scopedOutlets: scoped.outlets,
      scopedVisits: scoped.visits,
      scopedOutletIds: scoped.ids,
      authorizedOutlets: scoped.authorizedOutlets,
      authorizedVisits: scoped.authorizedVisits,
      isOutletFiltered: scoped.filtered,
      report,
    }),
    [data, loading, error, reload, dispatch, uploadEvidence, deleteEvidenceFile, deleteVisit, resetDemo, scoped, report],
  )
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue & { data: Dataset } {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  if (!ctx.data) throw new Error('Dataset not loaded')
  return ctx as DataContextValue & { data: Dataset }
}

/**
 * `useData()` for reporting pages: when a custom date range is chosen in the
 * period selector, `data` and the scoped lists cover that window only (outlet
 * scores recomputed from it). Writes still go through `dispatch` to the full
 * dataset. Operational pages (Visits, Calendar, Assignments) keep `useData()` so
 * a past date range never hides the visits still to be done.
 */
export function useReportData(): DataContextValue & { data: Dataset } {
  const ctx = useData()
  const r = ctx.report
  if (!r || r.data === ctx.data) return ctx
  return {
    ...ctx,
    data: r.data,
    scopedOutlets: r.outlets,
    scopedVisits: r.visits,
    scopedOutletIds: r.ids,
    authorizedOutlets: r.authorizedOutlets,
    authorizedVisits: r.authorizedVisits,
    isOutletFiltered: r.filtered,
  }
}

export function useDataState(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useDataState must be used within DataProvider')
  return ctx
}
