import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { differenceInMinutes, format } from 'date-fns'
import { AlertOctagon, AlertTriangle, BellRing, CheckCircle2, Clock, Download, ExternalLink, Eye, FileText, Lock, MessageSquare, RotateCcw, Send, Settings2, ThumbsUp, Timer, Wrench } from 'lucide-react'
import type { Alert, AlertStatus, Comment, Severity } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import { addComment, assignAlertOwner, logExport, updateAlert } from '@/services/actions'
import { KpiCard } from '@/components/ui/KpiCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, SeverityBadge, StatusBadge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ConfirmDialog, Drawer } from '@/components/ui/Modal'
import { Field, Select, Textarea } from '@/components/ui/Form'
import { Avatar, DescriptionList, Divider, ProgressBar, Tabs, Timeline } from '@/components/ui/Misc'
import { FilterBar, applyFilters, matchesSearch, type FilterDef } from '@/components/ui/FilterBar'
import { exportCsv } from '@/utils/export'
import { SEVERITY_ORDER, fmtDateTime, fmtPct, toDate, truncate } from '@/utils/format'
import { cn } from '@/utils/cn'

// ───────────────────────────── Local helpers ─────────────────────────────

const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Low']
const STATUSES: AlertStatus[] = ['New', 'Acknowledged', 'Investigating', 'Action Required', 'Resolved', 'Closed']
const OPEN_STATUSES: AlertStatus[] = ['New', 'Acknowledged', 'Investigating', 'Action Required']
const isOpenAlert = (a: Alert) => OPEN_STATUSES.includes(a.status)

type TabKey = 'all' | 'open' | 'closed'

type AlertRow = Alert & {
  outletName: string
  outletCode: string
  visitCode: string | null
  findingTitle: string | null
  findingCode: string | null
  findingCapaId: string | null
  ownerName: string | null
  minutesToDue: number
}

function humanDuration(minutes: number): string {
  const m = Math.abs(Math.round(minutes))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`
  const d = Math.floor(h / 24)
  const hh = h % 24
  return hh ? `${d}d ${hh}h` : `${d}d`
}

/** Escalation clock state for one alert relative to "now". */
function clockFor(a: Alert, now: Date) {
  const created = toDate(a.createdAt)
  const due = toDate(a.escalationDue)
  const settled = a.status === 'Resolved' || a.status === 'Closed'
  const minutesToDue = due ? differenceInMinutes(due, now) : 0
  const total = created && due ? Math.max(1, differenceInMinutes(due, created)) : 1
  const elapsed = created ? differenceInMinutes(settled && a.resolvedAt ? (toDate(a.resolvedAt) ?? now) : now, created) : 0
  const pct = Math.max(0, Math.min(100, (elapsed / total) * 100))
  const overdue = !settled && minutesToDue < 0
  const tone: 'green' | 'red' | 'amber' | 'accent' = settled ? 'green' : overdue ? 'red' : pct >= 70 ? 'amber' : 'accent'
  const label = settled ? (a.status === 'Closed' ? 'Closed' : 'Resolved') : overdue ? `Overdue by ${humanDuration(minutesToDue)}` : `${humanDuration(minutesToDue)} remaining`
  return { minutesToDue, pct, overdue, settled, tone, label }
}

function CommentsThread({ comments, canComment, onAdd }: { comments: Comment[]; canComment: boolean; onAdd: (text: string) => Promise<void> }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    try {
      await onAdd(text.trim())
      setText('')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3">
      {comments.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Avatar name={c.userName} size="sm" />
              <div className="min-w-0 flex-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-navy-800 dark:bg-navy-800/60">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{c.userName}</p>
                  <time className="text-[11px] text-slate-500 dark:text-slate-400" dateTime={c.createdAt}>
                    {fmtDateTime(c.createdAt)}
                  </time>
                </div>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {canComment && (
        <form onSubmit={submit} className="space-y-2">
          <label htmlFor="alert-comment" className="sr-only">
            Add a comment
          </label>
          <Textarea id="alert-comment" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an update for the escalation team…" className="min-h-[64px]" />
          <div className="flex justify-end">
            <button type="submit" className="btn-primary btn-sm" disabled={busy || !text.trim()}>
              <Send className="h-3.5 w-3.5" aria-hidden /> {busy ? 'Posting…' : 'Post comment'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ───────────────────────────── Page ─────────────────────────────

export default function AlertsPage() {
  useDocumentTitle('Alerts & Escalations')
  const { can } = useAuth()
  const { data, dispatch, scopedOutletIds } = useData()
  const now = useNow()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [tab, setTab] = useState<TabKey>('all')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [resolveNote, setResolveNote] = useState('')

  const selectedId = searchParams.get('alert')
  const openAlert = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (id) next.set('alert', id)
          else next.delete('alert')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const canManage = can('alerts.manage')
  const canComment = canManage || can('findings.comment')
  const canManageActions = can('actions.manage')

  // Lookups
  const outletById = useMemo(() => new Map(data.outlets.map((o) => [o.id, o])), [data.outlets])
  const visitById = useMemo(() => new Map(data.visits.map((v) => [v.id, v])), [data.visits])
  const findingById = useMemo(() => new Map(data.findings.map((f) => [f.id, f])), [data.findings])
  const userById = useMemo(() => new Map(data.users.map((u) => [u.id, u])), [data.users])
  const ownerOptions = useMemo(() => {
    const eligible = data.users.filter((u) => u.role === 'ops_manager' || u.role === 'client_admin' || u.role === 'super_admin')
    return eligible.filter((u) => u.status === 'active').length ? eligible.filter((u) => u.status === 'active') : eligible
  }, [data.users])

  const scopedAlerts = useMemo<AlertRow[]>(
    () =>
      data.alerts
        .filter((a) => scopedOutletIds.has(a.outletId))
        .map((a) => {
          const outlet = outletById.get(a.outletId)
          const visit = a.visitId ? visitById.get(a.visitId) : undefined
          const finding = a.findingId ? findingById.get(a.findingId) : undefined
          const due = toDate(a.escalationDue)
          return {
            ...a,
            outletName: outlet?.name ?? 'Unknown outlet',
            outletCode: outlet?.code ?? '',
            visitCode: visit?.code ?? null,
            findingTitle: finding?.title ?? null,
            findingCode: finding?.code ?? null,
            findingCapaId: finding?.correctiveActionId ?? null,
            ownerName: a.ownerId ? (userById.get(a.ownerId)?.name ?? null) : null,
            minutesToDue: due ? differenceInMinutes(due, now) : 0,
          }
        }),
    [data.alerts, scopedOutletIds, outletById, visitById, findingById, userById, now],
  )

  // KPIs
  const kpis = useMemo(() => {
    const open = scopedAlerts.filter(isOpenAlert)
    const acknowledged = scopedAlerts.filter((a) => a.acknowledgedAt)
    const withinTarget = acknowledged.filter((a) => (a.acknowledgedAt ?? '') <= a.escalationDue).length
    const month = format(now, 'yyyy-MM')
    return {
      newCount: scopedAlerts.filter((a) => a.status === 'New').length,
      criticalOpen: open.filter((a) => a.severity === 'Critical').length,
      escalationOverdue: open.filter((a) => a.escalationDue < format(now, "yyyy-MM-dd'T'HH:mm:ss")).length,
      ackPct: acknowledged.length ? (withinTarget / acknowledged.length) * 100 : null,
      ackCount: acknowledged.length,
      resolvedThisMonth: scopedAlerts.filter((a) => a.resolvedAt?.startsWith(month)).length,
    }
  }, [scopedAlerts, now])

  const tabbed = useMemo(() => (tab === 'open' ? scopedAlerts.filter(isOpenAlert) : tab === 'closed' ? scopedAlerts.filter((a) => !isOpenAlert(a)) : scopedAlerts), [scopedAlerts, tab])

  const filterDefs = useMemo<FilterDef[]>(() => {
    const outlets = [...new Map(scopedAlerts.map((a) => [a.outletId, a.outletName])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
    const types = [...new Set(scopedAlerts.map((a) => a.type))].sort()
    const owners = [...new Map(scopedAlerts.filter((a) => a.ownerId && a.ownerName).map((a) => [a.ownerId as string, a.ownerName as string])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
    return [
      { key: 'severity', label: 'Severity', options: SEVERITIES.map((s) => ({ value: s, label: s })), allLabel: 'All severities' },
      { key: 'type', label: 'Type', options: types.map((t) => ({ value: t, label: t })), allLabel: 'All types' },
      { key: 'status', label: 'Status', options: STATUSES.map((s) => ({ value: s, label: s })), allLabel: 'All statuses' },
      { key: 'outlet', label: 'Outlet', options: outlets.map(([id, name]) => ({ value: id, label: name })), allLabel: 'All outlets' },
      { key: 'owner', label: 'Owner', options: [{ value: '__none', label: 'Unassigned' }, ...owners.map(([id, name]) => ({ value: id, label: name }))], allLabel: 'All owners' },
    ]
  }, [scopedAlerts])

  const rows = useMemo(() => {
    const filtered = applyFilters(tabbed, filters, {
      severity: (a) => a.severity,
      type: (a) => a.type,
      status: (a) => a.status,
      outlet: (a) => a.outletId,
      owner: (a) => a.ownerId ?? '__none',
    })
    return matchesSearch(filtered, search, (a) => [a.code, a.title, a.description, a.outletName, a.outletCode, a.type, a.visitCode, a.findingCode])
  }, [tabbed, filters, search])

  // Selected
  const selected = useMemo(() => (selectedId ? (scopedAlerts.find((a) => a.id === selectedId) ?? null) : null), [selectedId, scopedAlerts])
  const selectedClock = selected ? clockFor(selected, now) : null
  const selectedComments = useMemo(() => (selected ? data.comments.filter((c) => c.entityType === 'alert' && c.entityId === selected.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : []), [selected, data.comments])

  const rules = useMemo(() => data.notificationRules.filter((r) => r.severity === 'Critical' || r.severity === 'High'), [data.notificationRules])

  // Mutations
  const run = async (label: string, recipe: Parameters<typeof dispatch>[0]) => {
    setBusy(true)
    try {
      await dispatch(recipe)
      toast.success(label)
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
      return false
    } finally {
      setBusy(false)
    }
  }

  const transition = (a: Alert, status: AlertStatus, note: string) => run(`${a.code} → ${status}`, (d, ctx) => updateAlert(d, ctx, a.id, status, note))

  const submitResolve = async () => {
    if (!selected) return
    const ok = await run(`${selected.code} resolved`, (d, ctx) => updateAlert(d, ctx, selected.id, 'Resolved', resolveNote.trim() || 'Resolved'))
    if (ok) {
      setResolveOpen(false)
      setResolveNote('')
    }
  }

  const changeOwner = async (ownerId: string) => {
    if (!selected || !ownerId) return
    await run(`Owner set to ${userById.get(ownerId)?.name ?? 'user'}`, (d, ctx) => assignAlertOwner(d, ctx, selected.id, ownerId))
  }

  const addAlertComment = async (text: string) => {
    if (!selected) return
    try {
      await dispatch((d, ctx) => addComment(d, ctx, 'alert', selected.id, text))
      toast.success('Comment posted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not post comment')
    }
  }

  const doExport = async () => {
    exportCsv(
      rows.map((a) => ({
        'Alert ID': a.code,
        Severity: a.severity,
        Type: a.type,
        Title: a.title,
        Outlet: a.outletName,
        Visit: a.visitCode ?? '',
        Finding: a.findingCode ?? '',
        Created: a.createdAt,
        'Escalation due': a.escalationDue,
        Owner: a.ownerName ?? '',
        Status: a.status,
        Acknowledged: a.acknowledgedAt ?? '',
        Resolved: a.resolvedAt ?? '',
      })),
      `insight360-alerts-${format(now, 'yyyyMMdd')}`,
    )
    try {
      await dispatch((d, ctx) => logExport(d, ctx, 'Alerts', 'CSV'))
    } catch {
      /* export already delivered */
    }
    toast.success(`Exported ${rows.length} alerts`)
  }

  const columns = useMemo<Column<AlertRow>[]>(
    () => [
      { key: 'code', header: 'Alert ID', width: '110px', render: (a) => <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-100">{a.code}</span> },
      { key: 'severity', header: 'Severity', render: (a) => <SeverityBadge severity={a.severity} />, sortValue: (a) => SEVERITY_ORDER[a.severity] },
      { key: 'type', header: 'Type', render: (a) => <Badge tone="navy">{a.type}</Badge> },
      {
        key: 'outletName',
        header: 'Outlet',
        render: (a) => (
          <div className="min-w-[130px]">
            <p className="text-slate-800 dark:text-slate-100">{a.outletName}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{a.outletCode}</p>
          </div>
        ),
      },
      {
        key: 'visitCode',
        header: 'Visit',
        render: (a) =>
          a.visitId && a.visitCode ? (
            <Link to={`/operations/visits/${a.visitId}`} className="link font-mono text-xs" onClick={(e) => e.stopPropagation()}>
              {a.visitCode}
            </Link>
          ) : (
            <span className="text-slate-400">—</span>
          ),
      },
      { key: 'findingTitle', header: 'Finding', render: (a) => <span className="block max-w-[240px] text-xs text-slate-700 dark:text-slate-200">{a.findingTitle ? truncate(a.findingTitle, 60) : truncate(a.title, 60)}</span> },
      { key: 'createdAt', header: 'Created', render: (a) => <span className="whitespace-nowrap text-xs tabular-nums">{fmtDateTime(a.createdAt)}</span> },
      {
        key: 'escalationDue',
        header: 'Escalation due',
        render: (a) => {
          const c = clockFor(a, now)
          return (
            <div className="whitespace-nowrap">
              <p className="text-xs tabular-nums">{fmtDateTime(a.escalationDue)}</p>
              <p className={cn('inline-flex items-center gap-1 text-[11px] font-medium', c.settled ? 'text-emerald-700 dark:text-emerald-300' : c.overdue ? 'text-red-700 dark:text-red-300' : c.tone === 'amber' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400')}>
                {c.settled ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : c.overdue ? <AlertTriangle className="h-3 w-3" aria-hidden /> : <Timer className="h-3 w-3" aria-hidden />}
                {c.label}
              </p>
            </div>
          )
        },
      },
      {
        key: 'ownerName',
        header: 'Assigned owner',
        render: (a) =>
          a.ownerName ? (
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <Avatar name={a.ownerName} size="xs" />
              <span className="text-xs">{a.ownerName}</span>
            </span>
          ) : (
            <Badge tone="amber" icon={AlertTriangle}>
              Unassigned
            </Badge>
          ),
      },
      { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
      { key: 'acknowledgedAt', header: 'Acknowledged', render: (a) => <span className="whitespace-nowrap text-xs tabular-nums">{a.acknowledgedAt ? fmtDateTime(a.acknowledgedAt) : '—'}</span> },
      { key: 'resolvedAt', header: 'Resolved', render: (a) => <span className="whitespace-nowrap text-xs tabular-nums">{a.resolvedAt ? fmtDateTime(a.resolvedAt) : '—'}</span> },
    ],
    [now],
  )

  const footer = selected ? (
    <>
      {canManageActions && selected.findingId && !selected.findingCapaId && (
        <button type="button" className="btn-accent btn-sm" onClick={() => navigate(`/quality/findings?finding=${selected.findingId}`)}>
          <Wrench className="h-3.5 w-3.5" aria-hidden /> Create corrective action
        </button>
      )}
      {canManage && selected.status === 'New' && (
        <button type="button" className="btn-primary btn-sm" onClick={() => void transition(selected, 'Acknowledged', 'Alert acknowledged')} disabled={busy}>
          <ThumbsUp className="h-3.5 w-3.5" aria-hidden /> Acknowledge
        </button>
      )}
      {canManage && (selected.status === 'New' || selected.status === 'Acknowledged') && (
        <button type="button" className="btn-secondary btn-sm" onClick={() => void transition(selected, 'Investigating', 'Investigation started')} disabled={busy}>
          <Eye className="h-3.5 w-3.5" aria-hidden /> Start investigation
        </button>
      )}
      {canManage && (selected.status === 'Acknowledged' || selected.status === 'Investigating') && (
        <button type="button" className="btn-secondary btn-sm" onClick={() => void transition(selected, 'Action Required', 'Corrective action required')} disabled={busy}>
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Require action
        </button>
      )}
      {canManage && isOpenAlert(selected) && (
        <button type="button" className="btn-primary btn-sm" onClick={() => setResolveOpen(true)} disabled={busy}>
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Resolve
        </button>
      )}
      {canManage && selected.status === 'Resolved' && (
        <button type="button" className="btn-secondary btn-sm" onClick={() => void transition(selected, 'Closed', 'Alert closed')} disabled={busy}>
          <Lock className="h-3.5 w-3.5" aria-hidden /> Close
        </button>
      )}
      {canManage && (selected.status === 'Resolved' || selected.status === 'Closed') && (
        <button type="button" className="btn-secondary btn-sm" onClick={() => void transition(selected, 'Investigating', 'Alert reopened')} disabled={busy}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reopen
        </button>
      )}
      <button type="button" className="btn-ghost btn-sm" onClick={() => openAlert(null)}>
        Close
      </button>
    </>
  ) : undefined

  return (
    <div className="space-y-5">
      <PageHeader
        title="Alerts & Escalations"
        subtitle="Critical findings require immediate alerts · escalation target 12–24 hours"
        actions={
          <button type="button" className="btn-secondary" onClick={() => void doExport()} disabled={!rows.length}>
            <Download className="h-4 w-4" aria-hidden /> Export CSV
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard compact label="New (unacknowledged)" value={kpis.newCount} icon={BellRing} tone={kpis.newCount ? 'critical' : 'default'} sub="Awaiting acknowledgement" onClick={() => { setTab('open'); setFilters({ status: 'New' }) }} />
        <KpiCard compact label="Critical open" value={kpis.criticalOpen} icon={AlertOctagon} tone="critical" sub="Severity critical" onClick={() => { setTab('open'); setFilters({ severity: 'Critical' }) }} />
        <KpiCard compact label="Escalation overdue" value={kpis.escalationOverdue} icon={AlertTriangle} tone={kpis.escalationOverdue ? 'critical' : 'good'} sub="Past escalation due" onClick={() => setTab('open')} />
        <KpiCard compact label="Acknowledged in target" value={fmtPct(kpis.ackPct, 0)} icon={Clock} tone={kpis.ackPct !== null && kpis.ackPct >= 90 ? 'good' : 'warn'} sub={`${kpis.ackCount} acknowledged`} />
        <KpiCard compact label="Resolved this month" value={kpis.resolvedThisMonth} icon={CheckCircle2} tone="good" sub={format(now, 'MMMM yyyy')} onClick={() => setTab('closed')} />
      </div>

      <Card>
        <div className="px-4 pt-2">
          <Tabs<TabKey>
            tabs={[
              { key: 'all', label: 'All', count: scopedAlerts.length },
              { key: 'open', label: 'Open', count: scopedAlerts.filter(isOpenAlert).length },
              { key: 'closed', label: 'Resolved / Closed', count: scopedAlerts.filter((a) => !isOpenAlert(a)).length },
            ]}
            active={tab}
            onChange={setTab}
          />
        </div>
        <div className="p-3">
          <FilterBar search={search} onSearch={setSearch} searchPlaceholder="Search alert, outlet, visit or finding…" filters={filterDefs} values={filters} onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={() => { setFilters({}); setSearch('') }} resultCount={rows.length} className="!shadow-none !border-0 !p-0" />
        </div>
        <DataTable columns={columns} rows={rows} rowKey={(a) => a.id} onRowClick={(a) => openAlert(a.id)} selectedKey={selectedId} initialSort={{ key: 'createdAt', dir: 'desc' }} pageSize={15} caption="Alerts and escalations" emptyTitle="No alerts match" emptyMessage="Adjust the filters or switch tabs." />
      </Card>

      <Card>
        <CardHeader
          title="Alert rules"
          subtitle="Critical and high severity rules that raise alerts automatically"
          actions={
            can('admin.notifications') ? (
              <Link to="/admin/notifications" className="btn-ghost btn-sm">
                <Settings2 className="h-3.5 w-3.5" aria-hidden /> Configure
              </Link>
            ) : undefined
          }
        />
        <CardBody>
          {rules.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-navy-800">
              {rules.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{r.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Trigger: {r.trigger} · Channels: {r.channel.join(', ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SeverityBadge severity={r.severity === 'Info' ? 'Low' : r.severity} size="xs" />
                    <Badge tone="slate" icon={Timer} size="xs">
                      {r.escalationHours !== null ? `Escalate after ${r.escalationHours}h` : 'No escalation'}
                    </Badge>
                    <Badge tone={r.enabled ? 'green' : 'slate'} icon={r.enabled ? CheckCircle2 : Lock} size="xs">
                      {r.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">No critical or high severity rules configured.</p>
          )}
        </CardBody>
      </Card>

      <Drawer open={!!selected} onClose={() => openAlert(null)} width="xl" tour="alert-detail" title={selected ? `${selected.code} · ${selected.title}` : 'Alert detail'} subtitle={selected ? `${selected.outletName} · ${selected.type}` : undefined} footer={footer}>
        {selected && selectedClock && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={selected.severity} size="md" />
              <StatusBadge status={selected.status} size="md" />
              <Badge tone="navy" size="md">
                {selected.type}
              </Badge>
            </div>

            <section className={cn('rounded-xl border p-4', selectedClock.tone === 'red' ? 'border-red-200 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10' : selectedClock.tone === 'amber' ? 'border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10' : selectedClock.tone === 'green' ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10' : 'border-slate-200 bg-slate-50 dark:border-navy-800 dark:bg-navy-800/60')} aria-label="Escalation clock">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="section-title flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5" aria-hidden /> Escalation clock
                </h3>
                <span className={cn('inline-flex items-center gap-1 text-sm font-semibold', selectedClock.tone === 'red' ? 'text-red-700 dark:text-red-300' : selectedClock.tone === 'amber' ? 'text-amber-700 dark:text-amber-300' : selectedClock.tone === 'green' ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-800 dark:text-slate-100')}>
                  {selectedClock.settled ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : selectedClock.overdue ? <AlertTriangle className="h-4 w-4" aria-hidden /> : <Clock className="h-4 w-4" aria-hidden />}
                  {selectedClock.label}
                </span>
              </div>
              <ProgressBar value={selectedClock.pct} tone={selectedClock.tone} label="Escalation window elapsed" className="mt-3" size="md" />
              <DescriptionList
                columns={2}
                className="mt-4"
                items={[
                  { label: 'Created', value: fmtDateTime(selected.createdAt) },
                  { label: 'Escalation due', value: fmtDateTime(selected.escalationDue) },
                  { label: 'Acknowledged at', value: selected.acknowledgedAt ? fmtDateTime(selected.acknowledgedAt) : <span className="text-amber-700 dark:text-amber-300">Not yet acknowledged</span> },
                  { label: 'Resolved at', value: selected.resolvedAt ? fmtDateTime(selected.resolvedAt) : '—' },
                ]}
              />
            </section>

            <section>
              <h3 className="section-title mb-2">Description</h3>
              <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{selected.description}</p>
            </section>

            <DescriptionList
              columns={2}
              items={[
                {
                  label: 'Outlet',
                  value: (
                    <Link to={`/performance/outlets/${selected.outletId}`} className="link inline-flex items-center gap-1">
                      {selected.outletName} <ExternalLink className="h-3 w-3" aria-hidden />
                    </Link>
                  ),
                },
                {
                  label: 'Visit report',
                  value: selected.visitId ? (
                    <Link to={`/reports/visits/${selected.visitId}`} className="link inline-flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" aria-hidden /> {selected.visitCode ?? 'Open report'}
                    </Link>
                  ) : (
                    '—'
                  ),
                },
                {
                  label: 'Finding',
                  value: selected.findingId ? (
                    <Link to={`/quality/findings?finding=${selected.findingId}`} className="link">
                      <span className="font-mono text-xs">{selected.findingCode}</span> · {truncate(selected.findingTitle ?? '', 60)}
                    </Link>
                  ) : (
                    '—'
                  ),
                },
                {
                  label: 'Corrective action',
                  value: selected.findingCapaId ? (
                    <Link to={`/quality/corrective-actions?action=${selected.findingCapaId}`} className="link inline-flex items-center gap-1">
                      <Wrench className="h-3.5 w-3.5" aria-hidden /> {data.correctiveActions.find((c) => c.id === selected.findingCapaId)?.code ?? 'Open action'}
                    </Link>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">None raised</span>
                  ),
                },
              ]}
            />

            <Divider />

            <section>
              <h3 className="section-title mb-2">Owner</h3>
              {canManage ? (
                <Field label="Assigned owner" htmlFor="alert-owner" hint="Owner receives escalation notifications for this alert.">
                  <Select id="alert-owner" value={selected.ownerId ?? ''} onChange={(e) => void changeOwner(e.target.value)} disabled={busy}>
                    <option value="">Unassigned</option>
                    {ownerOptions.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {u.title}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : selected.ownerName ? (
                <span className="inline-flex items-center gap-2 text-sm">
                  <Avatar name={selected.ownerName} size="sm" /> {selected.ownerName}
                </span>
              ) : (
                <Badge tone="amber" icon={AlertTriangle}>
                  Unassigned
                </Badge>
              )}
            </section>

            <Divider />

            <section>
              <h3 className="section-title mb-3">History</h3>
              <Timeline items={selected.history} />
            </section>

            <Divider />

            <section>
              <h3 className="section-title mb-3 flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Comments ({selectedComments.length})
              </h3>
              <CommentsThread comments={selectedComments} canComment={canComment} onAdd={addAlertComment} />
            </section>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={resolveOpen}
        title="Resolve alert"
        confirmLabel="Resolve"
        busy={busy}
        onCancel={() => setResolveOpen(false)}
        onConfirm={submitResolve}
        message={
          <div className="space-y-3">
            <p>
              Resolving <span className="font-mono text-xs">{selected?.code}</span> records the resolution time and marks the linked finding as resolved.
            </p>
            <Field label="Resolution note" htmlFor="resolve-note">
              <Textarea id="resolve-note" value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} placeholder="What was done to resolve the issue?" />
            </Field>
          </div>
        }
      />
    </div>
  )
}
