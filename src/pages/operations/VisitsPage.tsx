import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Download, Eye, FileText, MoreHorizontal, PlayCircle, Plus, ThumbsUp, Timer, UserPlus, Users, XCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import type { JourneyType, Shopper, Visit, VisitType } from '@/types'
import { approveVisit, assignShopper, createVisit, logExport, rejectVisit, startReview, startVisit, type NewVisitInput } from '@/services/actions'
import { slaStats } from '@/services/analytics'
import { isAwaitingApproval, isCompleted, isInProgress } from '@/services/derive'
import { PageHeader } from '@/components/ui/PageHeader'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { FilterBar, applyFilters, matchesSearch, type FilterDef } from '@/components/ui/FilterBar'
import { RiskBadge, ScoreBadge, SegmentBadge, StatusBadge } from '@/components/ui/Badge'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { exportCsv } from '@/utils/export'
import { fmtDate, fmtDateTime, fmtPct } from '@/utils/format'
import { cn } from '@/utils/cn'

const VISIT_STATUSES: Visit['status'][] = ['Planned', 'Assigned', 'In Progress', 'Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Closed']
const VISIT_TYPES: VisitType[] = ['Main Audit 1', 'Follow-up 1', 'Main Audit 2', 'Follow-up 2']
const RISKS = ['Excellent', 'Good', 'Needs Improvement', 'Critical']
const JOURNEYS: JourneyType[] = ['In-store / Dine-in', 'Social Media Interaction', 'Takeaway', 'Delivery', 'Entertainment Ticketing', 'Reception', 'Guest Onboarding', 'Safety Briefing', 'Digital Interaction']

function scoreBand(score: number | null): string {
  if (score === null) return 'none'
  if (score >= 90) return '90'
  if (score >= 80) return '80'
  if (score >= 70) return '70'
  return 'lt70'
}

// ───────────────────────────── Row action menu (portal so the table overflow never clips it) ─────────────────────────────

interface MenuItem {
  label: string
  icon: ReactNode
  onSelect: () => void
  tone?: 'default' | 'danger'
}

function RowMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const width = 208
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width))
    const top = r.bottom + 4 + window.scrollY
    setPos({ top, left })
  }, [])

  useEffect(() => {
    if (!open) return
    place()
    const close = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', key)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', key)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, place])

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [open])

  if (!items.length) return <span className="text-xs text-slate-400">—</span>

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn-ghost btn-sm !px-1.5"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open &&
        createPortal(
          <div ref={menuRef} role="menu" aria-label={label} style={{ top: pos.top, left: pos.left, width: 208 }} className="absolute z-[95] card shadow-panel p-1 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  it.onSelect()
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors',
                  it.tone === 'danger' ? 'text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-navy-800',
                )}
              >
                {it.icon}
                {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}

// ───────────────────────────── Page ─────────────────────────────

export default function VisitsPage() {
  useDocumentTitle('Visits')
  const navigate = useNavigate()
  const now = useNow()
  const { role, can } = useAuth()
  const { data, dispatch, scopedOutlets, scopedVisits } = useData()
  const [params, setParams] = useSearchParams()

  const isShopper = role === 'shopper'
  const outletById = useMemo(() => new Map(data.outlets.map((o) => [o.id, o])), [data.outlets])
  const shopperById = useMemo(() => new Map(data.shoppers.map((s) => [s.id, s])), [data.shoppers])
  const scenarioById = useMemo(() => new Map(data.scenarios.map((s) => [s.id, s])), [data.scenarios])

  // ── Filters ──
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    const s = params.get('status')
    if (s) init.status = s
    const o = params.get('outlet')
    if (o) init.outlet = o
    return init
  })
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => {
    const s = params.get('status')
    if (s && filters.status !== s) setFilters((f) => ({ ...f, status: s }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const setFilter = (k: string, v: string) => {
    setFilters((f) => ({ ...f, [k]: v }))
    if (k === 'status') {
      const next = new URLSearchParams(params)
      if (v && v !== 'all') next.set('status', v)
      else next.delete('status')
      setParams(next, { replace: true })
    }
  }

  const shoppersInScope = useMemo(() => {
    const ids = new Set(scopedVisits.map((v) => v.shopperId).filter(Boolean))
    return data.shoppers.filter((s) => ids.has(s.id)).sort((a, b) => a.name.localeCompare(b.name))
  }, [scopedVisits, data.shoppers])

  const filterDefs: FilterDef[] = useMemo(() => {
    const defs: FilterDef[] = [
      { key: 'outlet', label: 'Outlet', options: scopedOutlets.map((o) => ({ value: o.id, label: o.name })) },
      { key: 'segment', label: 'Category', options: [{ value: 'F&B', label: 'F&B' }, { value: 'Entertainment', label: 'Entertainment' }] },
      { key: 'type', label: 'Visit type', options: VISIT_TYPES.map((t) => ({ value: t, label: t })) },
    ]
    if (!isShopper) defs.push({ key: 'shopper', label: 'Shopper', options: [{ value: 'unassigned', label: 'Unassigned' }, ...shoppersInScope.map((s) => ({ value: s.id, label: s.name }))] })
    defs.push(
      { key: 'scenario', label: 'Scenario', allLabel: 'All scenarios', options: data.scenarios.map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` })) },
      { key: 'status', label: 'Status', options: VISIT_STATUSES.map((s) => ({ value: s, label: s })) },
      { key: 'risk', label: 'Risk', options: RISKS.map((r) => ({ value: r, label: r })) },
      {
        key: 'band',
        label: 'Score band',
        allLabel: 'All scores',
        options: [
          { value: '90', label: '≥ 90 Excellent' },
          { value: '80', label: '80–89 Good' },
          { value: '70', label: '70–79 Needs improvement' },
          { value: 'lt70', label: '< 70 Critical' },
        ],
      },
    )
    return defs
  }, [scopedOutlets, shoppersInScope, isShopper, data.scenarios])

  const rows = useMemo(() => {
    let list = applyFilters(scopedVisits, filters, {
      outlet: (v) => v.outletId,
      segment: (v) => outletById.get(v.outletId)?.segment,
      type: (v) => v.type,
      shopper: (v) => v.shopperId ?? 'unassigned',
      scenario: (v) => v.scenarioId,
      status: (v) => v.status,
      risk: (v) => v.risk,
      band: (v) => scoreBand(v.score),
    })
    if (from) list = list.filter((v) => v.scheduledDate >= from)
    if (to) list = list.filter((v) => v.scheduledDate <= to)
    list = matchesSearch(list, search, (v) => [v.code, outletById.get(v.outletId)?.name, outletById.get(v.outletId)?.code, shopperById.get(v.shopperId ?? '')?.name])
    return [...list].sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate))
  }, [scopedVisits, filters, from, to, search, outletById, shopperById])

  // ── KPIs ──
  const kpi = useMemo(() => {
    const completed = scopedVisits.filter(isCompleted).length
    const inProgress = scopedVisits.filter(isInProgress).length
    const awaiting = scopedVisits.filter(isAwaitingApproval).length
    const scheduled = scopedVisits.filter((v) => v.status === 'Assigned').length
    const unassigned = scopedVisits.filter((v) => v.status === 'Planned').length
    const sla = slaStats(scopedVisits, now)
    return { completed, inProgress, awaiting, scheduled, unassigned, sla }
  }, [scopedVisits, now])

  // ── Dialog state ──
  const [createOpen, setCreateOpen] = useState(false)
  const [assignFor, setAssignFor] = useState<Visit | null>(null)
  const [decision, setDecision] = useState<{ visit: Visit; kind: 'approve' | 'reject' } | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (label: string, recipe: Parameters<typeof dispatch>[0], after?: () => void) => {
    setBusy(true)
    try {
      await dispatch(recipe)
      toast.success(label)
      after?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const onStartVisit = (v: Visit) => run(`${v.code} started`, (d, ctx) => startVisit(d, ctx, v.id), () => navigate(`/operations/visits/${v.id}/audit`))
  const onStartReview = (v: Visit) => run(`Review started for ${v.code}`, (d, ctx) => startReview(d, ctx, v.id))

  const submitDecision = async () => {
    if (!decision) return
    const { visit, kind } = decision
    if (kind === 'reject' && !comment.trim()) {
      toast.error('A reason is required to reject a report.')
      return
    }
    await run(kind === 'approve' ? `${visit.code} approved` : `${visit.code} returned to shopper`, (d, ctx) => (kind === 'approve' ? approveVisit(d, ctx, visit.id, comment.trim()) : rejectVisit(d, ctx, visit.id, comment.trim())), () => {
      setDecision(null)
      setComment('')
    })
  }

  const doExport = () => {
    const out = rows.map((v) => {
      const o = outletById.get(v.outletId)
      return {
        'Visit ID': v.code,
        Outlet: o?.name ?? '',
        'Outlet Code': o?.code ?? '',
        Category: o?.segment ?? '',
        'Visit Type': v.type,
        Journey: v.journey,
        Scenario: scenarioById.get(v.scenarioId ?? '')?.name ?? '',
        Shopper: shopperById.get(v.shopperId ?? '')?.name ?? 'Unassigned',
        'Scheduled Date': v.scheduledDate,
        'Visit Date': v.visitDate ?? '',
        'Submission Deadline': v.submissionDeadline ?? '',
        'Submitted At': v.submittedAt ?? '',
        SLA: v.slaStatus,
        Status: v.status,
        Score: v.score ?? '',
        Risk: v.risk ?? '',
        'Report Status': v.reportStatus,
      }
    })
    if (!out.length) {
      toast.error('Nothing to export for the current filters.')
      return
    }
    exportCsv(out, `insight360-visits-${fmtDate(now, 'yyyyMMdd')}`)
    void dispatch((d, ctx) => logExport(d, ctx, `Visits (${out.length} rows)`, 'CSV')).then(() => toast.success(`Exported ${out.length} visits to CSV`))
  }

  // ── Row actions ──
  const menuFor = (v: Visit): MenuItem[] => {
    const items: MenuItem[] = []
    const open = !isCompleted(v) && v.status !== 'Submitted' && v.status !== 'Under Review'
    if (can('visits.assign') && open) items.push({ label: v.shopperId ? 'Reassign shopper' : 'Assign shopper', icon: <UserPlus className="h-3.5 w-3.5" aria-hidden />, onSelect: () => setAssignFor(v) })
    if (can('visits.review') && v.status === 'Submitted') items.push({ label: 'Start review', icon: <Eye className="h-3.5 w-3.5" aria-hidden />, onSelect: () => void onStartReview(v) })
    if (can('visits.review') && isAwaitingApproval(v)) {
      items.push({ label: 'Approve report', icon: <ThumbsUp className="h-3.5 w-3.5" aria-hidden />, onSelect: () => { setComment(''); setDecision({ visit: v, kind: 'approve' }) } })
      items.push({ label: 'Reject report', icon: <XCircle className="h-3.5 w-3.5" aria-hidden />, tone: 'danger', onSelect: () => { setComment(''); setDecision({ visit: v, kind: 'reject' }) } })
    }
    if (v.score !== null && (can('reports.visit') || can('visits.conduct'))) items.push({ label: 'Download report', icon: <FileText className="h-3.5 w-3.5" aria-hidden />, onSelect: () => navigate(`/reports/visits/${v.id}`) })
    items.push({ label: 'Open visit', icon: <ClipboardList className="h-3.5 w-3.5" aria-hidden />, onSelect: () => navigate(`/operations/visits/${v.id}`) })
    return items
  }

  const shopperAction = (v: Visit): ReactNode => {
    if (v.status === 'Assigned') {
      return (
        <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={(e) => { e.stopPropagation(); void onStartVisit(v) }}>
          <PlayCircle className="h-3.5 w-3.5" aria-hidden /> Start visit
        </button>
      )
    }
    if (v.status === 'In Progress' || v.status === 'Draft' || v.status === 'Rejected') {
      return (
        <button type="button" className="btn-accent btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/operations/visits/${v.id}/audit`) }}>
          <ClipboardList className="h-3.5 w-3.5" aria-hidden /> Continue assessment
        </button>
      )
    }
    if (v.score !== null) {
      return (
        <button type="button" className="btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/reports/visits/${v.id}`) }}>
          <FileText className="h-3.5 w-3.5" aria-hidden /> View report
        </button>
      )
    }
    return <span className="text-xs text-slate-400">Awaiting schedule</span>
  }

  const columns: Column<Visit>[] = useMemo(
    () => [
      { key: 'code', header: 'Visit ID', render: (v) => <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">{v.code}</span> },
      {
        key: 'outlet',
        header: 'Outlet',
        sortValue: (v) => outletById.get(v.outletId)?.name,
        render: (v) => {
          const o = outletById.get(v.outletId)
          return (
            <div className="min-w-[160px]">
              <p className="font-medium text-slate-800 dark:text-slate-100">{o?.name ?? '—'}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{o?.code} · {o?.brand}</p>
            </div>
          )
        },
      },
      { key: 'type', header: 'Visit type', render: (v) => <span className="whitespace-nowrap">{v.type}</span> },
      {
        key: 'scenario',
        header: 'Scenario',
        sortValue: (v) => scenarioById.get(v.scenarioId ?? '')?.code ?? '',
        render: (v) => {
          const s = scenarioById.get(v.scenarioId ?? '')
          return s ? (
            <span className="whitespace-nowrap font-mono text-xs text-slate-700 dark:text-slate-200" title={`${s.name} · ${s.type}`}>
              {s.code}
            </span>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )
        },
      },
      { key: 'segment', header: 'Category', sortValue: (v) => outletById.get(v.outletId)?.segment, render: (v) => <SegmentBadge segment={outletById.get(v.outletId)?.segment ?? ''} /> },
      { key: 'shopper', header: 'Assigned shopper', sortValue: (v) => shopperById.get(v.shopperId ?? '')?.name ?? '', render: (v) => (v.shopperId ? <span className="whitespace-nowrap">{shopperById.get(v.shopperId)?.name}</span> : <span className="text-xs italic text-slate-400">Unassigned</span>) },
      { key: 'scheduledDate', header: 'Scheduled', sortValue: (v) => v.scheduledDate, render: (v) => <span className="whitespace-nowrap tabular-nums">{fmtDate(v.scheduledDate)}</span> },
      { key: 'visitDate', header: 'Visit date', sortValue: (v) => v.visitDate, render: (v) => <span className="whitespace-nowrap tabular-nums">{fmtDate(v.visitDate)}</span> },
      {
        key: 'deadline',
        header: 'Submission deadline',
        sortValue: (v) => v.submissionDeadline,
        render: (v) => (
          <div className="flex flex-col gap-1 min-w-[150px]">
            <span className="whitespace-nowrap tabular-nums text-xs">{v.submissionDeadline ? fmtDateTime(v.submissionDeadline) : '—'}</span>
            <StatusBadge status={v.slaStatus} size="xs" />
          </div>
        ),
      },
      { key: 'status', header: 'Status', sortValue: (v) => VISIT_STATUSES.indexOf(v.status), render: (v) => <StatusBadge status={v.status} /> },
      { key: 'score', header: 'Score', align: 'right', sortValue: (v) => v.score, render: (v) => <ScoreBadge score={v.score} /> },
      { key: 'risk', header: 'Risk', sortValue: (v) => v.risk, render: (v) => <RiskBadge risk={v.risk} /> },
      { key: 'reportStatus', header: 'Report', render: (v) => <StatusBadge status={v.reportStatus} size="xs" /> },
      {
        key: 'actions',
        header: <span className="sr-only">Actions</span>,
        sortable: false,
        align: 'right',
        className: 'no-print',
        render: (v) => (isShopper ? shopperAction(v) : <RowMenu items={menuFor(v)} label={`Actions for ${v.code}`} />),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [outletById, shopperById, scenarioById, isShopper, busy, can],
  )

  const subtitle = isShopper
    ? `${kpi.completed} of ${scopedVisits.length} of your visits completed · ${scopedVisits.filter((v) => v.status === 'Assigned').length} scheduled`
    : `${kpi.completed} of ${scopedVisits.length} completed · ${kpi.awaiting} awaiting approval · ${kpi.unassigned} unassigned`

  return (
    <div className="space-y-5">
      <PageHeader
        title="Visits"
        subtitle={subtitle}
        actions={
          <>
            {can('reports.export') && (
              <button type="button" className="btn-secondary" onClick={doExport}>
                <Download className="h-4 w-4" aria-hidden /> Export CSV
              </button>
            )}
            {can('visits.create') && (
              <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden /> New visit
              </button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard compact label="Completed" value={kpi.completed} sub={`of ${scopedVisits.length}`} icon={CheckCircle2} tone="good" onClick={() => setFilter('status', 'Approved')} />
        <KpiCard compact label="In progress" value={kpi.inProgress} sub="Draft or active" icon={PlayCircle} tone="accent" onClick={() => setFilter('status', 'In Progress')} />
        <KpiCard compact label="Awaiting approval" value={kpi.awaiting} sub="Submitted / under review" icon={Eye} tone={kpi.awaiting ? 'warn' : 'default'} onClick={() => setFilter('status', 'Submitted')} />
        <KpiCard compact label="Scheduled" value={kpi.scheduled} sub="Assigned, not started" icon={CalendarClock} onClick={() => setFilter('status', 'Assigned')} />
        <KpiCard compact label="Unassigned" value={kpi.unassigned} sub="Need a shopper" icon={Users} tone={kpi.unassigned ? 'warn' : 'default'} onClick={() => setFilter('status', 'Planned')} />
        <KpiCard compact label="SLA compliance" value={fmtPct(kpi.sla.compliancePct, 0)} sub={`${kpi.sla.late} breached · ${kpi.sla.atRisk} at risk`} icon={Timer} tone={kpi.sla.late ? 'critical' : 'good'} />
      </div>

      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search visit code, outlet…"
        filters={filterDefs}
        values={filters}
        onChange={setFilter}
        onReset={() => {
          setFilters({})
          setSearch('')
          setFrom('')
          setTo('')
          const next = new URLSearchParams(params)
          next.delete('status')
          setParams(next, { replace: true })
        }}
        resultCount={rows.length}
      >
        <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="whitespace-nowrap">From</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="!w-auto !py-1.5 text-xs" aria-label="Scheduled from" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="whitespace-nowrap">To</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="!w-auto !py-1.5 text-xs" aria-label="Scheduled to" />
        </label>
      </FilterBar>

      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(v) => v.id}
          onRowClick={(v) => navigate(`/operations/visits/${v.id}`)}
          initialSort={{ key: 'scheduledDate', dir: 'desc' }}
          caption="Mystery-shopping visits"
          emptyTitle="No visits match"
          emptyMessage="Adjust the filters or the date range to see more visits."
        />
      </Card>

      {can('visits.create') && <NewVisitModal open={createOpen} onClose={() => setCreateOpen(false)} />}

      {assignFor && (
        <AssignShopperModal
          visit={assignFor}
          shoppers={data.shoppers}
          segment={outletById.get(assignFor.outletId)?.segment ?? 'F&B'}
          busy={busy}
          onClose={() => setAssignFor(null)}
          onAssign={(shopperId) => {
            const s = shopperById.get(shopperId)
            void run(`${s?.name ?? 'Shopper'} assigned to ${assignFor.code}`, (d, ctx) => assignShopper(d, ctx, assignFor.id, shopperId), () => setAssignFor(null))
          }}
        />
      )}

      <ConfirmDialog
        open={!!decision}
        title={decision?.kind === 'approve' ? `Approve ${decision.visit.code}` : `Reject ${decision?.visit.code ?? ''}`}
        tone={decision?.kind === 'reject' ? 'danger' : 'default'}
        confirmLabel={decision?.kind === 'approve' ? 'Approve report' : 'Reject & return'}
        busy={busy}
        onCancel={() => {
          setDecision(null)
          setComment('')
        }}
        onConfirm={submitDecision}
        message={
          <div className="space-y-3">
            <p>
              {decision?.kind === 'approve'
                ? `Approving publishes the report (score ${decision.visit.score?.toFixed(1) ?? '—'}%) and updates the outlet rating.`
                : 'The report will be returned to the shopper for revision. A reason is required.'}
            </p>
            <Field label={decision?.kind === 'approve' ? 'Reviewer comment (optional)' : 'Reason for rejection'} htmlFor="decision-comment" required={decision?.kind === 'reject'}>
              <Textarea id="decision-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={decision?.kind === 'approve' ? 'Evidence complete, scoring consistent…' : 'Missing evidence for section 3, timing not recorded…'} />
            </Field>
          </div>
        }
      />
    </div>
  )
}

// ───────────────────────────── New visit modal ─────────────────────────────

function NewVisitModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, dispatch, scopedOutlets } = useData()
  const now = useNow()
  const [outletId, setOutletId] = useState('')
  const [type, setType] = useState<VisitType>('Main Audit 1')
  const [journey, setJourney] = useState<JourneyType>('In-store / Dine-in')
  const [templateId, setTemplateId] = useState('')
  const [scheduled, setScheduled] = useState(fmtDate(now, 'yyyy-MM-dd'))
  const [shopperId, setShopperId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const outlet = data.outlets.find((o) => o.id === outletId)
  const isFollow = type.startsWith('Follow')
  const templates = useMemo(() => data.templates.filter((t) => t.status === 'Active' && (isFollow ? t.isFollowUp : !t.isFollowUp) && (!outlet || t.segment === 'Both' || t.segment === outlet.segment)), [data.templates, isFollow, outlet])

  // Auto-suggest template from outlet segment + visit type
  useEffect(() => {
    if (!outlet) return
    const suggested = templates.find((t) => t.segment === outlet.segment) ?? templates[0]
    if (suggested) {
      setTemplateId(suggested.id)
      setJourney(suggested.isFollowUp ? (outlet.segment === 'Entertainment' ? 'Entertainment Ticketing' : 'In-store / Dine-in') : suggested.journey)
    }
  }, [outlet, templates])

  const eligibleShoppers = useMemo(() => data.shoppers.filter((s) => s.status === 'Active' && (!outlet || s.assignedCategories.includes(outlet.segment))).sort((a, b) => a.name.localeCompare(b.name)), [data.shoppers, outlet])

  const reset = () => {
    setOutletId('')
    setType('Main Audit 1')
    setTemplateId('')
    setShopperId('')
    setScheduled(fmtDate(now, 'yyyy-MM-dd'))
    setError(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!outletId || !templateId || !scheduled) {
      setError('Outlet, template and scheduled date are required.')
      return
    }
    const input: NewVisitInput = { outletId, type, journey, templateId, scheduledDate: scheduled, shopperId: shopperId || null }
    setBusy(true)
    try {
      await dispatch((d, ctx) => createVisit(d, ctx, input))
      toast.success(`${type} scheduled for ${outlet?.name ?? 'outlet'} on ${fmtDate(scheduled)}`)
      reset()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create visit')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule a new visit"
      description="Creates a planned visit. Assigning a shopper now moves it straight to Assigned."
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="new-visit-form" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Create visit'}
          </button>
        </>
      }
    >
      <form id="new-visit-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Outlet" htmlFor="nv-outlet" required className="sm:col-span-2">
          <Select id="nv-outlet" value={outletId} onChange={(e) => setOutletId(e.target.value)} invalid={!!error && !outletId}>
            <option value="">Select an outlet…</option>
            {scopedOutlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} · {o.segment} · {o.code}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Visit type" htmlFor="nv-type" required>
          <Select id="nv-type" value={type} onChange={(e) => setType(e.target.value as VisitType)}>
            {VISIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Journey" htmlFor="nv-journey" required>
          <Select id="nv-journey" value={journey} onChange={(e) => setJourney(e.target.value as JourneyType)}>
            {JOURNEYS.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Audit template" htmlFor="nv-template" required hint={outlet ? `Suggested from ${outlet.segment} · ${outlet.subcategory}` : 'Select an outlet to auto-suggest'} className="sm:col-span-2">
          <Select id="nv-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)} invalid={!!error && !templateId}>
            <option value="">Select a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · v{t.version} · {t.questionCount} questions
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Scheduled date" htmlFor="nv-date" required>
          <Input id="nv-date" type="date" value={scheduled} onChange={(e) => setScheduled(e.target.value)} invalid={!!error && !scheduled} />
        </Field>
        <Field label="Shopper (optional)" htmlFor="nv-shopper" hint={outlet ? `${eligibleShoppers.length} eligible for ${outlet.segment}` : undefined}>
          <Select id="nv-shopper" value={shopperId} onChange={(e) => setShopperId(e.target.value)}>
            <option value="">Leave unassigned</option>
            {eligibleShoppers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.availability} · {s.certificationStatus}
              </option>
            ))}
          </Select>
        </Field>
        {error && (
          <p role="alert" className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

// ───────────────────────────── Assign shopper modal ─────────────────────────────

function AssignShopperModal({ visit, shoppers, segment, busy, onClose, onAssign }: { visit: Visit; shoppers: Shopper[]; segment: 'F&B' | 'Entertainment'; busy: boolean; onClose: () => void; onAssign: (shopperId: string) => void }) {
  const [shopperId, setShopperId] = useState(visit.shopperId ?? '')
  const eligible = useMemo(() => shoppers.filter((s) => s.status === 'Active' && s.assignedCategories.includes(segment)).sort((a, b) => (a.availability === 'Available' ? -1 : 1) - (b.availability === 'Available' ? -1 : 1) || a.name.localeCompare(b.name)), [shoppers, segment])
  const chosen = shoppers.find((s) => s.id === shopperId)
  return (
    <Modal
      open
      onClose={onClose}
      title={`${visit.shopperId ? 'Reassign' : 'Assign'} shopper · ${visit.code}`}
      description={`Only active shoppers eligible for ${segment} are listed.`}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={busy || !shopperId || shopperId === visit.shopperId} onClick={() => onAssign(shopperId)}>
            {busy ? 'Assigning…' : 'Assign'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Shopper" htmlFor="assign-shopper" required>
          <Select id="assign-shopper" value={shopperId} onChange={(e) => setShopperId(e.target.value)}>
            <option value="">Select a shopper…</option>
            {eligible.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.availability} · {s.certificationStatus}
              </option>
            ))}
          </Select>
        </Field>
        {chosen && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-navy-800 dark:bg-navy-800/50">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={chosen.availability} size="xs" />
              <StatusBadge status={chosen.certificationStatus} size="xs" />
              <span className="text-slate-500 dark:text-slate-400">{chosen.profileType} · {chosen.experienceYears} yrs · {chosen.completedVisits} visits</span>
            </div>
            {chosen.availability === 'Unavailable' && (
              <p className="mt-2 flex items-center gap-1 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> This shopper is currently unavailable.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
