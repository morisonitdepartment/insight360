import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { addDays, format } from 'date-fns'
import { AlertOctagon, AlertTriangle, Bell, CheckCircle2, Circle, ClipboardList, Download, ExternalLink, FileText, Info, MessageSquare, Repeat, RotateCcw, Send, Wrench } from 'lucide-react'
import type { AnswerValue, Comment, Evidence, Finding, Priority, Severity, User } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import { addComment, createCorrectiveAction, logExport, updateFinding, type NewCapaInput } from '@/services/actions'
import { isOpenFinding, isScored } from '@/services/derive'
import { CATEGORY_KEYS, CATEGORY_LABELS } from '@/utils/scoring'
import { KpiCard } from '@/components/ui/KpiCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge, SeverityBadge, StatusBadge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { Avatar, DescriptionList, Divider } from '@/components/ui/Misc'
import { EvidenceCard, EvidencePreviewModal } from '@/components/ui/EvidenceThumb'
import { FilterBar, applyFilters, matchesSearch, type FilterDef } from '@/components/ui/FilterBar'
import { exportCsv } from '@/utils/export'
import { SEVERITY_ORDER, fmtDate, fmtDateTime, truncate } from '@/utils/format'
import { cn } from '@/utils/cn'

// ───────────────────────────── Local helpers ─────────────────────────────

const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Low']
const STATUSES: Finding['status'][] = ['Open', 'In Progress', 'Resolved', 'Closed', 'Verified']
const VISIT_TYPES = ['Main Audit 1', 'Follow-up 1', 'Main Audit 2', 'Follow-up 2']
const RESOLVED_STATUSES: Finding['status'][] = ['Resolved', 'Closed', 'Verified']

type FindingRow = Finding & {
  outletName: string
  outletCode: string
  segment: string
  visitCode: string
  visitType: string
  capaCode: string | null
  alertCode: string | null
}

type CapaDraft = Omit<NewCapaInput, 'findingId'>

function fmtAnswer(value: AnswerValue, na: boolean): string {
  if (na) return 'N/A'
  if (value === null || value === undefined || value === '') return 'Not answered'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function targetDaysFor(severity: Severity): number {
  return severity === 'Critical' ? 7 : severity === 'High' ? 14 : 30
}

function defaultCapaDraft(f: Finding, owners: User[], now: Date): CapaDraft {
  const preferred = owners.find((u) => u.role === 'ops_manager' && (u.outletIds.length === 0 || u.outletIds.includes(f.outletId))) ?? owners[0]
  return {
    title: f.title,
    description: f.description,
    rootCause: '',
    immediateAction: '',
    correctiveAction: '',
    preventiveAction: '',
    ownerId: preferred?.id ?? '',
    priority: f.severity as Priority,
    targetDate: format(addDays(now, targetDaysFor(f.severity)), 'yyyy-MM-dd'),
  }
}

/** Shared CAPA form fields (also used by the "create from finding" modal). */
function CapaFormFields({ value, onChange, owners }: { value: CapaDraft; onChange: (patch: Partial<CapaDraft>) => void; owners: User[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Title" required className="sm:col-span-2" htmlFor="capa-title">
        <Input id="capa-title" value={value.title} onChange={(e) => onChange({ title: e.target.value })} required />
      </Field>
      <Field label="Description" className="sm:col-span-2" htmlFor="capa-desc">
        <Textarea id="capa-desc" value={value.description} onChange={(e) => onChange({ description: e.target.value })} />
      </Field>
      <Field label="Root cause" className="sm:col-span-2" htmlFor="capa-root" hint="What underlying condition allowed this finding to occur?">
        <Textarea id="capa-root" value={value.rootCause} onChange={(e) => onChange({ rootCause: e.target.value })} className="min-h-[64px]" />
      </Field>
      <Field label="Immediate action" htmlFor="capa-imm">
        <Textarea id="capa-imm" value={value.immediateAction} onChange={(e) => onChange({ immediateAction: e.target.value })} className="min-h-[64px]" />
      </Field>
      <Field label="Corrective action" htmlFor="capa-corr">
        <Textarea id="capa-corr" value={value.correctiveAction} onChange={(e) => onChange({ correctiveAction: e.target.value })} className="min-h-[64px]" />
      </Field>
      <Field label="Preventive action" className="sm:col-span-2" htmlFor="capa-prev">
        <Textarea id="capa-prev" value={value.preventiveAction} onChange={(e) => onChange({ preventiveAction: e.target.value })} className="min-h-[64px]" />
      </Field>
      <Field label="Owner" required htmlFor="capa-owner">
        <Select id="capa-owner" value={value.ownerId} onChange={(e) => onChange({ ownerId: e.target.value })} required>
          <option value="">Select owner…</option>
          {owners.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} · {u.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Priority" htmlFor="capa-priority">
        <Select id="capa-priority" value={value.priority} onChange={(e) => onChange({ priority: e.target.value as Priority })}>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Target date" required htmlFor="capa-target">
        <Input id="capa-target" type="date" value={value.targetDate} onChange={(e) => onChange({ targetDate: e.target.value })} required />
      </Field>
    </div>
  )
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
          <label htmlFor="finding-comment" className="sr-only">
            Add a comment
          </label>
          <Textarea id="finding-comment" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment for the team…" className="min-h-[64px]" />
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

export default function FindingsPage() {
  useDocumentTitle('Findings & Issues')
  const { can, role, user } = useAuth()
  const { data, dispatch, scopedOutletIds, scopedVisits } = useData()
  const now = useNow()
  const [searchParams, setSearchParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    if (searchParams.get('repeated') === '1') init.repeated = 'yes'
    const sev = searchParams.get('severity')
    if (sev && (SEVERITIES as string[]).includes(sev)) init.severity = sev
    return init
  })
  const [preview, setPreview] = useState<Evidence | null>(null)
  const [capaOpen, setCapaOpen] = useState(false)
  const [capaDraft, setCapaDraft] = useState<CapaDraft | null>(null)
  const [busy, setBusy] = useState(false)

  const selectedId = searchParams.get('finding')
  const openFinding = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (id) next.set('finding', id)
          else next.delete('finding')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  // Lookups
  const outletById = useMemo(() => new Map(data.outlets.map((o) => [o.id, o])), [data.outlets])
  const visitById = useMemo(() => new Map(data.visits.map((v) => [v.id, v])), [data.visits])
  const capaById = useMemo(() => new Map(data.correctiveActions.map((c) => [c.id, c])), [data.correctiveActions])
  const alertById = useMemo(() => new Map(data.alerts.map((a) => [a.id, a])), [data.alerts])
  const questionById = useMemo(() => new Map(data.questions.map((q) => [q.id, q])), [data.questions])

  const owners = useMemo(() => {
    const eligible = data.users.filter((u) => u.role === 'ops_manager' || u.role === 'client_admin')
    const active = eligible.filter((u) => u.status === 'active')
    return active.length ? active : eligible
  }, [data.users])

  const scopedFindings = useMemo<FindingRow[]>(
    () =>
      data.findings
        .filter((f) => scopedOutletIds.has(f.outletId))
        .map((f) => {
          const outlet = outletById.get(f.outletId)
          const visit = visitById.get(f.visitId)
          return {
            ...f,
            outletName: outlet?.name ?? 'Unknown outlet',
            outletCode: outlet?.code ?? '',
            segment: outlet?.segment ?? '',
            visitCode: visit?.code ?? '—',
            visitType: visit?.type ?? '',
            capaCode: f.correctiveActionId ? (capaById.get(f.correctiveActionId)?.code ?? null) : null,
            alertCode: f.alertId ? (alertById.get(f.alertId)?.code ?? null) : null,
          }
        }),
    [data.findings, scopedOutletIds, outletById, visitById, capaById, alertById],
  )

  // KPI strip
  const kpis = useMemo(() => {
    const open = scopedFindings.filter(isOpenFinding)
    const cycleTwo = scopedVisits.some((v) => (v.type === 'Main Audit 2' || v.type === 'Follow-up 2') && isScored(v))
    const cycleTypes = cycleTwo ? ['Main Audit 2', 'Follow-up 2'] : ['Main Audit 1', 'Follow-up 1']
    return {
      critical: open.filter((f) => f.severity === 'Critical').length,
      high: open.filter((f) => f.severity === 'High').length,
      medium: open.filter((f) => f.severity === 'Medium').length,
      low: open.filter((f) => f.severity === 'Low').length,
      repeated: scopedFindings.filter((f) => f.repeated).length,
      resolved: scopedFindings.filter((f) => RESOLVED_STATUSES.includes(f.status) && cycleTypes.includes(f.visitType)).length,
      cycleLabel: cycleTwo ? 'Cycle 2' : 'Cycle 1',
    }
  }, [scopedFindings, scopedVisits])

  // Filters
  const filterDefs = useMemo<FilterDef[]>(() => {
    const outlets = [...new Map(scopedFindings.map((f) => [f.outletId, f.outletName])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
    return [
      { key: 'severity', label: 'Severity', options: SEVERITIES.map((s) => ({ value: s, label: s })), allLabel: 'All severities' },
      { key: 'status', label: 'Status', options: STATUSES.map((s) => ({ value: s, label: s })), allLabel: 'All statuses' },
      { key: 'category', label: 'Category', options: CATEGORY_KEYS.map((k) => ({ value: k, label: CATEGORY_LABELS[k] })), allLabel: 'All categories' },
      { key: 'outlet', label: 'Outlet', options: outlets.map(([id, name]) => ({ value: id, label: name })), allLabel: 'All outlets' },
      { key: 'segment', label: 'Segment', options: [{ value: 'F&B', label: 'F&B' }, { value: 'Entertainment', label: 'Entertainment' }], allLabel: 'All segments' },
      { key: 'repeated', label: 'Repeated', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], allLabel: 'Repeated: any' },
      { key: 'visitType', label: 'Visit type', options: VISIT_TYPES.map((t) => ({ value: t, label: t })), allLabel: 'All visit types' },
    ]
  }, [scopedFindings])

  const rows = useMemo(() => {
    const filtered = applyFilters(scopedFindings, filters, {
      severity: (f) => f.severity,
      status: (f) => f.status,
      category: (f) => f.category,
      outlet: (f) => f.outletId,
      segment: (f) => f.segment,
      repeated: (f) => (f.repeated ? 'yes' : 'no'),
      visitType: (f) => f.visitType,
    })
    return matchesSearch(filtered, search, (f) => [f.title, f.code, f.outletName, f.outletCode, f.description])
  }, [scopedFindings, filters, search])

  const resetFilters = () => {
    setFilters({})
    setSearch('')
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('repeated')
        next.delete('severity')
        return next
      },
      { replace: true },
    )
  }

  // Selected finding + related records
  const selected = useMemo(() => (selectedId ? (scopedFindings.find((f) => f.id === selectedId) ?? null) : null), [selectedId, scopedFindings])
  const selectedVisit = selected ? visitById.get(selected.visitId) : undefined
  const selectedQuestion = selected?.questionId ? questionById.get(selected.questionId) : undefined
  const selectedAnswer = useMemo(() => (selected?.questionId ? data.answers.find((a) => a.visitId === selected.visitId && a.questionId === selected.questionId) : undefined), [selected, data.answers])
  const selectedEvidence = useMemo(() => {
    if (!selected) return []
    const linked = new Set(selectedAnswer?.evidenceIds ?? [])
    return data.evidence.filter((e) => linked.has(e.id) || (e.visitId === selected.visitId && !!selected.questionId && e.questionId === selected.questionId))
  }, [selected, selectedAnswer, data.evidence])
  const selectedCapa = selected?.correctiveActionId ? capaById.get(selected.correctiveActionId) : undefined
  const selectedAlert = selected?.alertId ? alertById.get(selected.alertId) : undefined
  const selectedComments = useMemo(() => (selected ? data.comments.filter((c) => c.entityType === 'finding' && c.entityId === selected.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : []), [selected, data.comments])

  const canManageActions = can('actions.manage')
  const canComment = can('findings.comment')
  const canResolve = canComment && (role === 'super_admin' || role === 'client_admin' || role === 'ops_manager')

  // Actions
  const setStatus = async (f: Finding, status: Finding['status']) => {
    setBusy(true)
    try {
      await dispatch((d, ctx) => updateFinding(d, ctx, f.id, { status }))
      toast.success(`${f.code} marked ${status.toLowerCase()}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update finding')
    } finally {
      setBusy(false)
    }
  }

  const openCapaModal = (f: Finding) => {
    setCapaDraft(defaultCapaDraft(f, owners, now))
    setCapaOpen(true)
  }

  const submitCapa = async (e: FormEvent) => {
    e.preventDefault()
    if (!selected || !capaDraft) return
    if (!capaDraft.title.trim() || !capaDraft.ownerId || !capaDraft.targetDate) {
      toast.error('Title, owner and target date are required')
      return
    }
    setBusy(true)
    try {
      await dispatch((d, ctx) => createCorrectiveAction(d, ctx, { ...capaDraft, findingId: selected.id }))
      toast.success('Corrective action created and assigned')
      setCapaOpen(false)
      setCapaDraft(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create corrective action')
    } finally {
      setBusy(false)
    }
  }

  const addFindingComment = async (text: string) => {
    if (!selected) return
    try {
      await dispatch((d, ctx) => addComment(d, ctx, 'finding', selected.id, text))
      toast.success('Comment posted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not post comment')
    }
  }

  const doExport = async () => {
    const csvRows = rows.map((f) => ({
      Code: f.code,
      Title: f.title,
      Description: f.description,
      Outlet: f.outletName,
      'Outlet code': f.outletCode,
      Segment: f.segment,
      Category: CATEGORY_LABELS[f.category],
      Severity: f.severity,
      Status: f.status,
      Visit: f.visitCode,
      'Visit type': f.visitType,
      Created: f.createdAt,
      Repeated: f.repeated ? 'Yes' : 'No',
      'Corrective action': f.capaCode ?? '',
      Alert: f.alertCode ?? '',
    }))
    exportCsv(csvRows, `insight360-findings-${format(now, 'yyyyMMdd')}`)
    try {
      await dispatch((d, ctx) => logExport(d, ctx, 'Findings', 'CSV'))
    } catch {
      /* export already delivered */
    }
    toast.success(`Exported ${rows.length} findings`)
  }

  // Table columns
  const columns = useMemo<Column<FindingRow>[]>(
    () => [
      { key: 'code', header: 'Code', width: '110px', render: (f) => <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-100">{f.code}</span> },
      {
        key: 'title',
        header: 'Finding',
        render: (f) => (
          <div className="min-w-[220px] max-w-[360px]">
            <p className="font-medium text-slate-800 dark:text-slate-100 leading-snug">{f.title}</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 leading-snug">{truncate(f.description, 90)}</p>
          </div>
        ),
      },
      {
        key: 'outletName',
        header: 'Outlet',
        render: (f) => (
          <div className="min-w-[140px]">
            <p className="text-slate-800 dark:text-slate-100">{f.outletName}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {f.outletCode} · {f.segment}
            </p>
          </div>
        ),
      },
      { key: 'category', header: 'Category', render: (f) => <span className="text-xs">{CATEGORY_LABELS[f.category]}</span>, sortValue: (f) => CATEGORY_LABELS[f.category] },
      { key: 'severity', header: 'Severity', render: (f) => <SeverityBadge severity={f.severity} />, sortValue: (f) => SEVERITY_ORDER[f.severity] },
      { key: 'status', header: 'Status', render: (f) => <StatusBadge status={f.status} /> },
      {
        key: 'visitCode',
        header: 'Visit',
        render: (f) => (
          <div className="min-w-[110px]">
            <Link to={`/operations/visits/${f.visitId}`} className="link font-mono text-xs" onClick={(e) => e.stopPropagation()}>
              {f.visitCode}
            </Link>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{f.visitType}</p>
          </div>
        ),
      },
      { key: 'createdAt', header: 'Created', render: (f) => <span className="whitespace-nowrap text-xs tabular-nums">{fmtDate(f.createdAt)}</span> },
      {
        key: 'repeated',
        header: 'Repeated',
        sortValue: (f) => (f.repeated ? 1 : 0),
        render: (f) =>
          f.repeated ? (
            <Badge tone="amber" icon={Repeat}>
              Repeated
            </Badge>
          ) : (
            <span className="text-slate-400">—</span>
          ),
      },
      {
        key: 'capaCode',
        header: 'Corrective action',
        render: (f) =>
          f.correctiveActionId && f.capaCode ? (
            <Link to={`/quality/corrective-actions?action=${f.correctiveActionId}`} className="link font-mono text-xs" onClick={(e) => e.stopPropagation()}>
              {f.capaCode}
            </Link>
          ) : (
            <span className="text-slate-400">—</span>
          ),
      },
      {
        key: 'alertCode',
        header: 'Alert',
        render: (f) =>
          f.alertId && f.alertCode ? (
            <Link to={`/quality/alerts?alert=${f.alertId}`} className="link font-mono text-xs" onClick={(e) => e.stopPropagation()}>
              {f.alertCode}
            </Link>
          ) : (
            <span className="text-slate-400">—</span>
          ),
      },
    ],
    [],
  )

  const drawerFooter = selected ? (
    <>
      {canManageActions && !selected.correctiveActionId && (
        <button type="button" className="btn-accent btn-sm" onClick={() => openCapaModal(selected)} disabled={busy}>
          <Wrench className="h-3.5 w-3.5" aria-hidden /> Create corrective action
        </button>
      )}
      {canResolve && isOpenFinding(selected) && (
        <button type="button" className="btn-primary btn-sm" onClick={() => void setStatus(selected, 'Resolved')} disabled={busy}>
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Mark resolved
        </button>
      )}
      {canResolve && RESOLVED_STATUSES.includes(selected.status) && (
        <button type="button" className="btn-secondary btn-sm" onClick={() => void setStatus(selected, 'Open')} disabled={busy}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reopen
        </button>
      )}
      <button type="button" className="btn-ghost btn-sm" onClick={() => openFinding(null)}>
        Close
      </button>
    </>
  ) : undefined

  return (
    <div className="space-y-5">
      <PageHeader
        title="Findings & Issues"
        subtitle="Every non-conformance raised during assessments, with severity, ownership and linked corrective actions."
        actions={
          <button type="button" className="btn-secondary" onClick={() => void doExport()} disabled={!rows.length}>
            <Download className="h-4 w-4" aria-hidden /> Export CSV
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard compact label="Open critical" value={kpis.critical} icon={AlertOctagon} tone="critical" sub="Immediate intervention" onClick={() => setFilters({ severity: 'Critical', status: 'Open' })} />
        <KpiCard compact label="Open high" value={kpis.high} icon={AlertTriangle} tone="warn" sub="Priority follow-up" onClick={() => setFilters({ severity: 'High', status: 'Open' })} />
        <KpiCard compact label="Open medium" value={kpis.medium} icon={Info} tone="accent" sub="Scheduled remediation" onClick={() => setFilters({ severity: 'Medium', status: 'Open' })} />
        <KpiCard compact label="Open low" value={kpis.low} icon={Circle} tone="default" sub="Monitor" onClick={() => setFilters({ severity: 'Low', status: 'Open' })} />
        <KpiCard compact label="Repeated findings" value={kpis.repeated} icon={Repeat} tone="warn" sub="Across consecutive audits" onClick={() => setFilters({ repeated: 'yes' })} />
        <KpiCard compact label="Resolved / closed" value={kpis.resolved} icon={CheckCircle2} tone="good" sub={`${kpis.cycleLabel} to date`} />
      </div>

      <FilterBar search={search} onSearch={setSearch} searchPlaceholder="Search title, code or outlet…" filters={filterDefs} values={filters} onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={resetFilters} resultCount={rows.length} />

      <Card>
        <DataTable columns={columns} rows={rows} rowKey={(f) => f.id} onRowClick={(f) => openFinding(f.id)} selectedKey={selectedId} initialSort={{ key: 'createdAt', dir: 'desc' }} pageSize={15} caption="Findings and issues" emptyTitle="No findings match" emptyMessage="Adjust the filters or clear the search to see more findings." />
      </Card>

      <Drawer open={!!selected} onClose={() => openFinding(null)} width="xl" title={selected ? `${selected.code} · ${selected.title}` : 'Finding detail'} subtitle={selected ? `${selected.outletName} · raised ${fmtDate(selected.createdAt)}` : undefined} footer={drawerFooter}>
        {selected && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={selected.severity} size="md" />
              <StatusBadge status={selected.status} size="md" />
              {selected.repeated && (
                <Badge tone="amber" icon={Repeat} size="md">
                  Repeated finding
                </Badge>
              )}
              <Badge tone="navy" size="md">
                {CATEGORY_LABELS[selected.category]}
              </Badge>
            </div>

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
                  label: 'Visit',
                  value: (
                    <span className="inline-flex flex-wrap items-center gap-x-2">
                      <Link to={`/operations/visits/${selected.visitId}`} className="link font-mono text-xs">
                        {selected.visitCode}
                      </Link>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{selected.visitType}</span>
                    </span>
                  ),
                },
                { label: 'Visit date', value: fmtDate(selectedVisit?.visitDate ?? selectedVisit?.scheduledDate) },
                {
                  label: 'Visit report',
                  value: (
                    <Link to={`/reports/visits/${selected.visitId}`} className="link inline-flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" aria-hidden /> Open report
                    </Link>
                  ),
                },
              ]}
            />

            <Divider />

            <section>
              <h3 className="section-title mb-2">Assessment question</h3>
              {selectedQuestion ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-navy-800 dark:bg-navy-800/60">
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    {selectedQuestion.code}
                    {selectedQuestion.critical && (
                      <Badge tone="red" size="xs" className="ml-2">
                        Critical question
                      </Badge>
                    )}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">{selectedQuestion.text}</p>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Recorded answer</dt>
                      <dd className={cn('mt-0.5 text-sm font-semibold', selectedAnswer?.score !== null && selectedAnswer?.score !== undefined && selectedAnswer.score < 0.5 ? 'text-red-700 dark:text-red-300' : 'text-slate-800 dark:text-slate-100')}>{selectedAnswer ? fmtAnswer(selectedAnswer.value, selectedAnswer.na) : 'Not answered'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Shopper comment</dt>
                      <dd className="mt-0.5 text-sm text-slate-700 dark:text-slate-200">{selectedAnswer?.comment?.trim() ? selectedAnswer.comment : <span className="text-slate-400">No comment recorded</span>}</dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">This finding was raised at visit level and is not tied to a single question.</p>
              )}
            </section>

            <section>
              <h3 className="section-title mb-2">Evidence ({selectedEvidence.length})</h3>
              {selectedEvidence.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {selectedEvidence.map((ev) => (
                    <EvidenceCard key={ev.id} evidence={ev} onClick={() => setPreview(ev)} meta={`${ev.type} · ${fmtDate(ev.capturedAt)}`} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No evidence linked to this answer.{' '}
                  <Link to={`/evidence?visit=${selected.visitId}`} className="link">
                    Browse visit evidence
                  </Link>
                </p>
              )}
            </section>

            <Divider />

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3 dark:border-navy-800">
                <h3 className="section-title mb-2 flex items-center gap-1.5">
                  <Bell className="h-3.5 w-3.5" aria-hidden /> Related alert
                </h3>
                {selectedAlert ? (
                  <div className="space-y-1.5">
                    <Link to={`/quality/alerts?alert=${selectedAlert.id}`} className="link font-mono text-xs">
                      {selectedAlert.code}
                    </Link>
                    <p className="text-sm text-slate-800 dark:text-slate-100">{selectedAlert.title}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <SeverityBadge severity={selectedAlert.severity} size="xs" />
                      <StatusBadge status={selectedAlert.status} size="xs" />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Escalation due {fmtDateTime(selectedAlert.escalationDue)}</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No alert raised for this finding.</p>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-navy-800">
                <h3 className="section-title mb-2 flex items-center gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5" aria-hidden /> Corrective action
                </h3>
                {selectedCapa ? (
                  <div className="space-y-1.5">
                    <Link to={`/quality/corrective-actions?action=${selectedCapa.id}`} className="link font-mono text-xs">
                      {selectedCapa.code}
                    </Link>
                    <p className="text-sm text-slate-800 dark:text-slate-100">{selectedCapa.title}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <StatusBadge status={selectedCapa.status} size="xs" />
                      <SeverityBadge severity={selectedCapa.priority} size="xs" />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Owner {selectedCapa.ownerName} · target {fmtDate(selectedCapa.targetDate)}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{canManageActions ? 'No corrective action yet — use the button below to raise one.' : 'No corrective action raised yet.'}</p>
                )}
              </div>
            </section>

            <Divider />

            <section>
              <h3 className="section-title mb-3 flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Comments ({selectedComments.length})
              </h3>
              <CommentsThread comments={selectedComments} canComment={canComment && !!user} onAdd={addFindingComment} />
            </section>
          </div>
        )}
      </Drawer>

      <Modal
        open={capaOpen && !!capaDraft}
        onClose={() => setCapaOpen(false)}
        title="Create corrective action"
        description={selected ? `Raised from finding ${selected.code} · ${selected.outletName}` : undefined}
        size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setCapaOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" form="capa-form" className="btn-primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create & assign'}
            </button>
          </>
        }
      >
        {capaDraft && (
          <form id="capa-form" onSubmit={(e) => void submitCapa(e)}>
            <CapaFormFields value={capaDraft} onChange={(patch) => setCapaDraft((d) => (d ? { ...d, ...patch } : d))} owners={owners} />
          </form>
        )}
      </Modal>

      <EvidencePreviewModal evidence={preview} onClose={() => setPreview(null)} context={selected ? { outlet: selected.outletName, visit: `${selected.visitCode} · ${selected.visitType}`, question: selectedQuestion?.text } : undefined} />
    </div>
  )
}
