import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AlertTriangle, CalendarClock, CheckCircle2, Sparkles, UserCheck, UserPlus, Users } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import type { Shopper, ShopperProfileType, Visit } from '@/types'
import { assignShopper } from '@/services/actions'
import { isCompleted } from '@/services/derive'
import { PageHeader } from '@/components/ui/PageHeader'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { FilterBar, applyFilters, matchesSearch, type FilterDef } from '@/components/ui/FilterBar'
import { Badge, SegmentBadge, StatusBadge } from '@/components/ui/Badge'
import { Field, Select } from '@/components/ui/Form'
import { Avatar } from '@/components/ui/Misc'
import { fmtDate, fmtPct } from '@/utils/format'
import { cn } from '@/utils/cn'

const PROFILE_TYPES: ShopperProfileType[] = ['Individual', 'Family', 'Tourist', 'Young Adult', 'Professional', 'Parent']

interface Workload {
  shopper: Shopper
  upcoming: number
  completedInProgramme: number
}

export default function AssignmentsPage() {
  useDocumentTitle('Assignments')
  const navigate = useNavigate()
  const now = useNow()
  const today = fmtDate(now, 'yyyy-MM-dd')
  const { can } = useAuth()
  const { data, dispatch, scopedVisits } = useData()
  const outletById = useMemo(() => new Map(data.outlets.map((o) => [o.id, o])), [data.outlets])
  const shopperById = useMemo(() => new Map(data.shoppers.map((s) => [s.id, s])), [data.shoppers])
  const canAssign = can('visits.assign')

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [scenario, setScenario] = useState<'all' | ShopperProfileType>('all')
  const [busyId, setBusyId] = useState<string | null>(null)

  // ── Visits needing attention: Planned (unassigned) or Assigned (upcoming) ──
  const queue = useMemo(() => scopedVisits.filter((v) => v.status === 'Planned' || v.status === 'Assigned').sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)), [scopedVisits])

  const rows = useMemo(() => {
    const list = applyFilters(queue, filters, {
      status: (v) => v.status,
      segment: (v) => outletById.get(v.outletId)?.segment,
      type: (v) => v.type,
    })
    return matchesSearch(list, search, (v) => [v.code, outletById.get(v.outletId)?.name, shopperById.get(v.shopperId ?? '')?.name])
  }, [queue, filters, search, outletById, shopperById])

  const filterDefs: FilterDef[] = [
    { key: 'status', label: 'Status', options: [{ value: 'Planned', label: 'Unassigned (Planned)' }, { value: 'Assigned', label: 'Assigned' }] },
    { key: 'segment', label: 'Segment', options: [{ value: 'F&B', label: 'F&B' }, { value: 'Entertainment', label: 'Entertainment' }] },
    { key: 'type', label: 'Type', options: ['Main Audit 1', 'Follow-up 1', 'Main Audit 2', 'Follow-up 2'].map((t) => ({ value: t, label: t })) },
  ]

  // ── Workload per active shopper ──
  const workload = useMemo<Workload[]>(() => {
    return data.shoppers
      .filter((s) => s.status === 'Active')
      .map((s) => ({
        shopper: s,
        upcoming: data.visits.filter((v) => v.shopperId === s.id && (v.status === 'Assigned' || v.status === 'Planned') && v.scheduledDate >= today).length,
        completedInProgramme: data.visits.filter((v) => v.shopperId === s.id && isCompleted(v)).length,
      }))
      .sort((a, b) => a.upcoming - b.upcoming || b.shopper.avgReportQuality - a.shopper.avgReportQuality)
  }, [data.shoppers, data.visits, today])

  const kpi = useMemo(() => {
    const unassigned = scopedVisits.filter((v) => v.status === 'Planned').length
    const openPlan = scopedVisits.filter((v) => !isCompleted(v)).length
    const covered = scopedVisits.filter((v) => !isCompleted(v) && v.shopperId).length
    const overdue = queue.filter((v) => v.scheduledDate < today).length
    return { unassigned, coverage: openPlan ? (covered / openPlan) * 100 : 100, overdue, activeShoppers: workload.length, available: workload.filter((w) => w.shopper.availability === 'Available').length }
  }, [scopedVisits, queue, today, workload])

  const selected = selectedId ? queue.find((v) => v.id === selectedId) ?? null : null
  const selectedOutlet = selected ? outletById.get(selected.outletId) : undefined

  // Previous shopper at this outlet (to rotate assessors where possible)
  const previousShopperIds = useMemo(() => {
    if (!selected) return new Set<string>()
    return new Set(data.visits.filter((v) => v.outletId === selected.outletId && v.id !== selected.id && v.shopperId).map((v) => v.shopperId as string))
  }, [data.visits, selected])

  const recommendations = useMemo(() => {
    if (!selected || !selectedOutlet) return []
    const segment = selectedOutlet.segment
    return workload
      .filter((w) => w.shopper.assignedCategories.includes(segment))
      .filter((w) => scenario === 'all' || w.shopper.profileType === scenario)
      .map((w) => {
        const reasons: string[] = []
        let score = 0
        if (w.shopper.availability === 'Available') { score += 40; reasons.push('Available') } else if (w.shopper.availability === 'Limited') { score += 15; reasons.push('Limited availability') }
        if (w.shopper.certificationStatus === 'Certified') { score += 30; reasons.push('Certified') }
        if (!previousShopperIds.has(w.shopper.id)) { score += 15; reasons.push('New to this outlet') } else reasons.push('Visited before')
        score += Math.max(0, 10 - w.upcoming * 2)
        score += Math.round(w.shopper.avgReportQuality * 2)
        const eligible = w.shopper.availability !== 'Unavailable' && w.shopper.certificationStatus === 'Certified'
        return { ...w, score, reasons, eligible, isCurrent: selected.shopperId === w.shopper.id }
      })
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score)
  }, [selected, selectedOutlet, workload, scenario, previousShopperIds])

  const assign = async (visit: Visit, shopper: Shopper) => {
    setBusyId(shopper.id)
    try {
      await dispatch((d, ctx) => assignShopper(d, ctx, visit.id, shopper.id))
      toast.success(`${shopper.name} assigned to ${visit.code} · ${outletById.get(visit.outletId)?.name ?? ''}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Assignment failed')
    } finally {
      setBusyId(null)
    }
  }

  const columns: Column<Visit>[] = [
    { key: 'code', header: 'Visit', render: (v) => <span className="font-mono text-xs font-semibold">{v.code}</span> },
    {
      key: 'outlet',
      header: 'Outlet',
      sortValue: (v) => outletById.get(v.outletId)?.name,
      render: (v) => (
        <div className="min-w-[150px]">
          <p className="font-medium text-slate-800 dark:text-slate-100">{outletById.get(v.outletId)?.name}</p>
          <p className="text-[11px] text-slate-500">{outletById.get(v.outletId)?.brand}</p>
        </div>
      ),
    },
    { key: 'segment', header: 'Segment', sortValue: (v) => outletById.get(v.outletId)?.segment, render: (v) => <SegmentBadge segment={outletById.get(v.outletId)?.segment ?? ''} /> },
    { key: 'type', header: 'Type', render: (v) => <span className="whitespace-nowrap">{v.type}</span> },
    {
      key: 'scheduledDate',
      header: 'Scheduled',
      sortValue: (v) => v.scheduledDate,
      render: (v) => (
        <span className={cn('whitespace-nowrap tabular-nums', v.scheduledDate < today && 'font-medium text-red-700 dark:text-red-300')}>
          {fmtDate(v.scheduledDate)}
          {v.scheduledDate < today && <AlertTriangle className="ml-1 inline h-3 w-3" aria-label="Overdue" />}
        </span>
      ),
    },
    { key: 'shopper', header: 'Shopper', sortValue: (v) => shopperById.get(v.shopperId ?? '')?.name ?? '', render: (v) => (v.shopperId ? <span className="whitespace-nowrap">{shopperById.get(v.shopperId)?.name}</span> : <Badge tone="amber" icon={UserPlus} size="xs">Unassigned</Badge>) },
    { key: 'status', header: 'Status', render: (v) => <StatusBadge status={v.status} /> },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Assignments" subtitle={`${kpi.unassigned} visits awaiting a shopper · ${queue.length} in the upcoming queue`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard compact label="Unassigned visits" value={kpi.unassigned} sub="Planned, no shopper" icon={UserPlus} tone={kpi.unassigned ? 'warn' : 'good'} onClick={() => setFilters({ status: 'Planned' })} />
        <KpiCard compact label="Assignment coverage" value={fmtPct(kpi.coverage, 0)} sub="Open visits with a shopper" icon={UserCheck} tone={kpi.coverage >= 90 ? 'good' : 'warn'} />
        <KpiCard compact label="Overdue to schedule" value={kpi.overdue} sub="Scheduled date has passed" icon={CalendarClock} tone={kpi.overdue ? 'critical' : 'default'} />
        <KpiCard compact label="Active shoppers" value={kpi.activeShoppers} sub={`${kpi.available} available now`} icon={Users} tone="accent" onClick={() => navigate('/operations/shoppers')} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        {/* Left: queue */}
        <div className="space-y-3 min-w-0">
          <FilterBar search={search} onSearch={setSearch} searchPlaceholder="Search visit, outlet, shopper…" filters={filterDefs} values={filters} onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={() => { setFilters({}); setSearch('') }} resultCount={rows.length} />
          <Card>
            <CardHeader title="Assignment queue" subtitle="Select a visit to see recommended shoppers" />
            <DataTable columns={columns} rows={rows} rowKey={(v) => v.id} onRowClick={(v) => setSelectedId(v.id)} selectedKey={selectedId} initialSort={{ key: 'scheduledDate', dir: 'asc' }} pageSize={12} dense caption="Visits needing assignment" emptyTitle="Queue is clear" emptyMessage="Every upcoming visit has been assigned." />
          </Card>
        </div>

        {/* Right: workload / recommendations */}
        <div className="space-y-5 min-w-0">
          {selected && selectedOutlet ? (
            <Card>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <Sparkles className="h-4 w-4 text-teal-600 dark:text-teal-300" aria-hidden /> Recommended for {selected.code}
                  </span>
                }
                subtitle={`${selectedOutlet.name} · ${selected.type} · ${fmtDate(selected.scheduledDate)}`}
                actions={
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setSelectedId(null)}>
                    Clear
                  </button>
                }
              />
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Scenario" htmlFor="scenario" hint="Filters shoppers by profile type for the mystery-shopping scenario" className="flex-1 min-w-[180px]">
                    <Select id="scenario" value={scenario} onChange={(e) => setScenario(e.target.value as 'all' | ShopperProfileType)} className="!py-1.5 text-xs">
                      <option value="all">Any profile</option>
                      {PROFILE_TYPES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Link to={`/operations/visits/${selected.id}`} className="btn-secondary btn-sm">
                    Open visit
                  </Link>
                </div>
                {selected.shopperId && (
                  <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                    Currently assigned to <strong>{shopperById.get(selected.shopperId)?.name}</strong>. Choosing another shopper will reassign the visit.
                  </p>
                )}
                {recommendations.length === 0 ? (
                  <p className="text-xs text-slate-500">No active shoppers match {selectedOutlet.segment}{scenario !== 'all' ? ` and the ${scenario} profile` : ''}.</p>
                ) : (
                  <ul className="space-y-2" aria-label="Recommended shoppers">
                    {recommendations.slice(0, 8).map((r, i) => (
                      <li key={r.shopper.id} className={cn('flex items-start gap-3 rounded-lg border p-3', r.isCurrent ? 'border-teal-400 bg-teal-50/50 dark:border-teal-600 dark:bg-teal-500/10' : 'border-slate-200 dark:border-navy-800', !r.eligible && 'opacity-70')}>
                        <Avatar name={r.shopper.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Link to={`/operations/shoppers/${r.shopper.id}`} className="text-sm font-medium text-slate-800 hover:underline dark:text-slate-100">
                              {r.shopper.name}
                            </Link>
                            {i === 0 && r.eligible && !r.isCurrent && <Badge tone="teal" size="xs">Best match</Badge>}
                            {r.isCurrent && <Badge tone="blue" size="xs">Current</Badge>}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {r.shopper.profileType} · {r.upcoming} upcoming · {r.completedInProgramme} completed · quality {r.shopper.avgReportQuality.toFixed(1)}/5
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            <StatusBadge status={r.shopper.availability} size="xs" />
                            <StatusBadge status={r.shopper.certificationStatus} size="xs" />
                            {r.reasons.includes('New to this outlet') ? <Badge tone="green" size="xs">Not previously at outlet</Badge> : <Badge tone="slate" size="xs">Visited before</Badge>}
                          </div>
                        </div>
                        {canAssign && (
                          <button type="button" className="btn-primary btn-sm shrink-0" disabled={busyId !== null || r.isCurrent} onClick={() => void assign(selected, r.shopper)}>
                            {busyId === r.shopper.id ? 'Assigning…' : r.isCurrent ? 'Assigned' : 'Assign'}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader title="Shopper workload" subtitle={`${workload.length} active shoppers · sorted by lightest load`} />
              <CardBody className="space-y-2">
                <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 dark:border-navy-700 dark:text-slate-400">Select a visit in the queue to see recommended shoppers for it.</p>
                <ul className="divide-y divide-slate-100 dark:divide-navy-800" aria-label="Shopper workload">
                  {workload.map((w) => (
                    <li key={w.shopper.id} className="flex items-center gap-3 py-2.5">
                      <Avatar name={w.shopper.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2">
                          <Link to={`/operations/shoppers/${w.shopper.id}`} className="truncate text-sm font-medium text-slate-800 hover:underline dark:text-slate-100">
                            {w.shopper.name}
                          </Link>
                          <span className="text-[11px] text-slate-500">{w.shopper.profileType}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <StatusBadge status={w.shopper.availability} size="xs" />
                          <StatusBadge status={w.shopper.certificationStatus} size="xs" />
                          {w.shopper.assignedCategories.map((c) => (
                            <SegmentBadge key={c} segment={c} size="xs" />
                          ))}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-xs tabular-nums">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{w.upcoming} upcoming</p>
                        <p className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                          <CheckCircle2 className="h-3 w-3" aria-hidden /> {w.shopper.completedVisits} completed
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
