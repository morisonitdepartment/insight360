import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { addDays, differenceInCalendarDays, format } from 'date-fns'
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Clock, Download, ExternalLink, Eye, FileText, Hourglass, ImagePlus, Lock, MessageSquare, Paperclip, Pencil, Play, Plus, RotateCcw, Send, ShieldCheck, UserPlus, X } from 'lucide-react'
import type { CapaStatus, Comment, CorrectiveAction, Evidence, EvidenceType, Finding, Priority, User } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import { addComment, addEvidence, createCorrectiveAction, logExport, updateCorrectiveAction, type NewCapaInput } from '@/services/actions'
import { capaStats } from '@/services/analytics'
import { isOpenFinding } from '@/services/derive'
import { CATEGORY_KEYS, CATEGORY_LABELS } from '@/utils/scoring'
import { KpiCard } from '@/components/ui/KpiCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, SeverityBadge, StatusBadge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ConfirmDialog, Drawer, Modal } from '@/components/ui/Modal'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { Avatar, DescriptionList, Divider, Timeline } from '@/components/ui/Misc'
import { EvidenceCard, EvidencePreviewModal } from '@/components/ui/EvidenceThumb'
import { FilterBar, applyFilters, matchesSearch, type FilterDef } from '@/components/ui/FilterBar'
import { CHART_COLORS, DonutChart } from '@/components/charts'
import { exportCsv } from '@/utils/export'
import { SEVERITY_ORDER, fmtDate, fmtDateTime, fmtPct, truncate } from '@/utils/format'
import { cn } from '@/utils/cn'

// ───────────────────────────── Local helpers ─────────────────────────────

const STATUSES: CapaStatus[] = ['Open', 'Assigned', 'In Progress', 'Awaiting Evidence', 'Awaiting Verification', 'Closed', 'Overdue']
const PRIORITIES: Priority[] = ['Critical', 'High', 'Medium', 'Low']
const EVIDENCE_TYPES: EvidenceType[] = ['Photo', 'Video', 'Receipt', 'Screenshot', 'Document']

const STATUS_COLORS: Record<CapaStatus, string> = {
  Open: CHART_COLORS.navyLight,
  Assigned: CHART_COLORS.blue,
  'In Progress': CHART_COLORS.teal,
  'Awaiting Evidence': CHART_COLORS.amber,
  'Awaiting Verification': CHART_COLORS.violet,
  Closed: CHART_COLORS.green,
  Overdue: CHART_COLORS.red,
}

type CapaRow = CorrectiveAction & {
  outletName: string
  outletCode: string
  findingCode: string
  findingTitle: string
  dueBucket: 'overdue' | 'due7' | 'later' | ''
  daysToTarget: number | null
}

type CapaDraft = Omit<NewCapaInput, 'findingId'>

function targetDaysFor(priority: Priority): number {
  return priority === 'Critical' ? 7 : priority === 'High' ? 14 : 30
}

function defaultDraft(f: Finding | null, owners: User[], now: Date): CapaDraft {
  const preferred = f ? (owners.find((u) => u.role === 'ops_manager' && (u.outletIds.length === 0 || u.outletIds.includes(f.outletId))) ?? owners[0]) : owners[0]
  const priority = (f?.severity ?? 'Medium') as Priority
  return {
    title: f?.title ?? '',
    description: f?.description ?? '',
    rootCause: '',
    immediateAction: '',
    correctiveAction: '',
    preventiveAction: '',
    ownerId: preferred?.id ?? '',
    priority,
    targetDate: format(addDays(now, targetDaysFor(priority)), 'yyyy-MM-dd'),
  }
}

function dueCaption(row: Pick<CapaRow, 'status' | 'daysToTarget'>): { text: string; tone: 'critical' | 'warn' | 'muted' | 'good' } {
  if (row.status === 'Closed') return { text: 'Closed', tone: 'good' }
  const d = row.daysToTarget
  if (d === null) return { text: '', tone: 'muted' }
  if (d < 0) return { text: `Overdue by ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'}`, tone: 'critical' }
  if (d === 0) return { text: 'Due today', tone: 'warn' }
  if (d <= 7) return { text: `Due in ${d} day${d === 1 ? '' : 's'}`, tone: 'warn' }
  return { text: `Due in ${d} days`, tone: 'muted' }
}

function CapaFormFields({ value, onChange, owners }: { value: CapaDraft; onChange: (patch: Partial<CapaDraft>) => void; owners: User[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Title" required className="sm:col-span-2" htmlFor="ncapa-title">
        <Input id="ncapa-title" value={value.title} onChange={(e) => onChange({ title: e.target.value })} required />
      </Field>
      <Field label="Description" className="sm:col-span-2" htmlFor="ncapa-desc">
        <Textarea id="ncapa-desc" value={value.description} onChange={(e) => onChange({ description: e.target.value })} />
      </Field>
      <Field label="Root cause" className="sm:col-span-2" htmlFor="ncapa-root">
        <Textarea id="ncapa-root" value={value.rootCause} onChange={(e) => onChange({ rootCause: e.target.value })} className="min-h-[64px]" />
      </Field>
      <Field label="Immediate action" htmlFor="ncapa-imm">
        <Textarea id="ncapa-imm" value={value.immediateAction} onChange={(e) => onChange({ immediateAction: e.target.value })} className="min-h-[64px]" />
      </Field>
      <Field label="Corrective action" htmlFor="ncapa-corr">
        <Textarea id="ncapa-corr" value={value.correctiveAction} onChange={(e) => onChange({ correctiveAction: e.target.value })} className="min-h-[64px]" />
      </Field>
      <Field label="Preventive action" className="sm:col-span-2" htmlFor="ncapa-prev">
        <Textarea id="ncapa-prev" value={value.preventiveAction} onChange={(e) => onChange({ preventiveAction: e.target.value })} className="min-h-[64px]" />
      </Field>
      <Field label="Owner" required htmlFor="ncapa-owner">
        <Select id="ncapa-owner" value={value.ownerId} onChange={(e) => onChange({ ownerId: e.target.value })} required>
          <option value="">Select owner…</option>
          {owners.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} · {u.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Priority" htmlFor="ncapa-priority">
        <Select id="ncapa-priority" value={value.priority} onChange={(e) => onChange({ priority: e.target.value as Priority })}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Target date" required htmlFor="ncapa-target">
        <Input id="ncapa-target" type="date" value={value.targetDate} onChange={(e) => onChange({ targetDate: e.target.value })} required />
      </Field>
    </div>
  )
}

/** Labelled narrative block with inline editing. */
function EditableBlock({ label, value, canEdit, busy, onSave }: { label: string; value: string; canEdit: boolean; busy: boolean; onSave: (text: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const start = () => {
    setDraft(value)
    setEditing(true)
  }
  const save = async () => {
    await onSave(draft.trim())
    setEditing(false)
  }
  return (
    <div className="rounded-lg border border-slate-200 dark:border-navy-800 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="section-title">{label}</h4>
        {canEdit && !editing && (
          <button type="button" className="btn-ghost btn-sm" onClick={start} aria-label={`Edit ${label.toLowerCase()}`}>
            <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={label} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <p className={cn('mt-1.5 text-sm leading-relaxed', value ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500 italic')}>{value || 'Not documented yet.'}</p>
      )}
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
          <label htmlFor="capa-comment" className="sr-only">
            Add a comment
          </label>
          <Textarea id="capa-comment" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a progress note or question…" className="min-h-[64px]" />
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

export default function CorrectiveActionsPage() {
  useDocumentTitle('Corrective Actions')
  const { can, user } = useAuth()
  const { data, dispatch, uploadEvidence, scopedOutletIds } = useData()
  const now = useNow()
  const [searchParams, setSearchParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Evidence | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignOwner, setAssignOwner] = useState('')
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [verifyNote, setVerifyNote] = useState('')
  const [attachOpen, setAttachOpen] = useState(false)
  const [attach, setAttach] = useState<{ type: EvidenceType; title: string; description: string }>({ type: 'Photo', title: '', description: '' })
  const [newOpen, setNewOpen] = useState(false)
  const [newFindingId, setNewFindingId] = useState('')
  const [newDraft, setNewDraft] = useState<CapaDraft | null>(null)

  const selectedId = searchParams.get('action')
  const openAction = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (id) next.set('action', id)
          else next.delete('action')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const canManage = can('actions.manage')
  const canComment = can('findings.comment') || canManage

  // Lookups
  const outletById = useMemo(() => new Map(data.outlets.map((o) => [o.id, o])), [data.outlets])
  const findingById = useMemo(() => new Map(data.findings.map((f) => [f.id, f])), [data.findings])
  const userById = useMemo(() => new Map(data.users.map((u) => [u.id, u])), [data.users])
  const evidenceById = useMemo(() => new Map(data.evidence.map((e) => [e.id, e])), [data.evidence])
  const owners = useMemo(() => {
    const eligible = data.users.filter((u) => u.role === 'ops_manager' || u.role === 'client_admin')
    const active = eligible.filter((u) => u.status === 'active')
    return active.length ? active : eligible
  }, [data.users])

  const scopedActions = useMemo<CapaRow[]>(
    () =>
      data.correctiveActions
        .filter((a) => scopedOutletIds.has(a.outletId))
        .map((a) => {
          const outlet = outletById.get(a.outletId)
          const finding = findingById.get(a.findingId)
          const days = a.targetDate ? differenceInCalendarDays(new Date(a.targetDate), now) : null
          const dueBucket: CapaRow['dueBucket'] = a.status === 'Closed' || days === null ? '' : days < 0 || a.status === 'Overdue' ? 'overdue' : days <= 7 ? 'due7' : 'later'
          return {
            ...a,
            outletName: outlet?.name ?? 'Unknown outlet',
            outletCode: outlet?.code ?? '',
            findingCode: finding?.code ?? '—',
            findingTitle: finding?.title ?? a.title,
            dueBucket,
            daysToTarget: days,
          }
        }),
    [data.correctiveActions, scopedOutletIds, outletById, findingById, now],
  )

  const stats = useMemo(() => capaStats(scopedActions, now), [scopedActions, now])
  const donutSegments = useMemo(
    () =>
      STATUSES.map((s) => ({ label: s, value: scopedActions.filter((a) => a.status === s).length, color: STATUS_COLORS[s] })).filter((s) => s.value > 0),
    [scopedActions],
  )

  const filterDefs = useMemo<FilterDef[]>(() => {
    const outlets = [...new Map(scopedActions.map((a) => [a.outletId, a.outletName])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
    const ownerList = [...new Map(scopedActions.filter((a) => a.ownerId).map((a) => [a.ownerId as string, a.ownerName])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
    return [
      { key: 'status', label: 'Status', options: STATUSES.map((s) => ({ value: s, label: s })), allLabel: 'All statuses' },
      { key: 'priority', label: 'Priority', options: PRIORITIES.map((p) => ({ value: p, label: p })), allLabel: 'All priorities' },
      { key: 'outlet', label: 'Outlet', options: outlets.map(([id, name]) => ({ value: id, label: name })), allLabel: 'All outlets' },
      { key: 'owner', label: 'Owner', options: ownerList.map(([id, name]) => ({ value: id, label: name })), allLabel: 'All owners' },
      { key: 'category', label: 'Category', options: CATEGORY_KEYS.map((k) => ({ value: k, label: CATEGORY_LABELS[k] })), allLabel: 'All categories' },
      { key: 'due', label: 'Due', options: [{ value: 'overdue', label: 'Overdue' }, { value: 'due7', label: 'Due in 7 days' }, { value: 'later', label: 'Later' }], allLabel: 'Any due date' },
    ]
  }, [scopedActions])

  const rows = useMemo(() => {
    const filtered = applyFilters(scopedActions, filters, {
      status: (a) => a.status,
      priority: (a) => a.priority,
      outlet: (a) => a.outletId,
      owner: (a) => a.ownerId,
      category: (a) => a.category,
      due: (a) => a.dueBucket,
    })
    return matchesSearch(filtered, search, (a) => [a.code, a.title, a.outletName, a.findingCode, a.findingTitle, a.ownerName])
  }, [scopedActions, filters, search])

  // Selected
  const selected = useMemo(() => (selectedId ? (scopedActions.find((a) => a.id === selectedId) ?? null) : null), [selectedId, scopedActions])
  const selectedFinding = selected ? findingById.get(selected.findingId) : undefined
  const selectedEvidence = useMemo(() => (selected ? selected.evidenceIds.map((id) => evidenceById.get(id)).filter((e): e is Evidence => !!e) : []), [selected, evidenceById])
  const selectedComments = useMemo(() => (selected ? data.comments.filter((c) => c.entityType === 'corrective_action' && c.entityId === selected.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : []), [selected, data.comments])
  const reviewerName = selected?.reviewerId ? (userById.get(selected.reviewerId)?.name ?? '—') : '—'

  const openFindingsWithoutCapa = useMemo(() => data.findings.filter((f) => scopedOutletIds.has(f.outletId) && isOpenFinding(f) && !f.correctiveActionId).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.createdAt.localeCompare(a.createdAt)), [data.findings, scopedOutletIds])

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

  const transition = (a: CorrectiveAction, status: CapaStatus, note: string) => run(`${a.code} → ${status}`, (d, ctx) => updateCorrectiveAction(d, ctx, a.id, { status }, note))

  const saveField = (a: CorrectiveAction, key: keyof Pick<CorrectiveAction, 'description' | 'rootCause' | 'immediateAction' | 'correctiveAction' | 'preventiveAction'>, label: string) => async (text: string) => {
    await run(`${label} updated`, (d, ctx) => updateCorrectiveAction(d, ctx, a.id, { [key]: text }, `${label} updated`))
  }

  const submitAssign = async () => {
    if (!selected || !assignOwner) return
    const owner = userById.get(assignOwner)
    const ok = await run(`Assigned to ${owner?.name ?? 'owner'}`, (d, ctx) => updateCorrectiveAction(d, ctx, selected.id, { ownerId: assignOwner, status: selected.status === 'Open' ? 'Assigned' : selected.status }, `Assigned to ${owner?.name ?? 'owner'}`))
    if (ok) setAssignOpen(false)
  }

  const submitVerify = async () => {
    if (!selected) return
    const ok = await run(`${selected.code} verified and closed`, (d, ctx) => updateCorrectiveAction(d, ctx, selected.id, { status: 'Closed', verificationNote: verifyNote.trim() || 'Verified and closed.' }, verifyNote.trim() || 'Verified and closed.'))
    if (ok) {
      setVerifyOpen(false)
      setVerifyNote('')
    }
  }

  const submitAttach = async (e: FormEvent) => {
    e.preventDefault()
    if (!selected || !selectedFinding || !user) return
    if (!attach.title.trim()) {
      toast.error('Give the evidence a title')
      return
    }
    setBusy(true)
    try {
      const ev = await uploadEvidence(null, {
        visitId: selectedFinding.visitId,
        outletId: selected.outletId,
        category: selected.category,
        questionId: selectedFinding.questionId,
        type: attach.type,
        title: attach.title.trim(),
        description: attach.description.trim() || `Closure evidence for ${selected.code}`,
        uploadedBy: user.name,
      })
      await dispatch((d, ctx) => addEvidence(d, ctx, ev))
      await dispatch((d, ctx) => updateCorrectiveAction(d, ctx, selected.id, { evidenceIds: [...selected.evidenceIds, ev.id] }, `Evidence attached: ${ev.title}`))
      toast.success('Evidence attached (demo placeholder generated)')
      setAttachOpen(false)
      setAttach({ type: 'Photo', title: '', description: '' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not attach evidence')
    } finally {
      setBusy(false)
    }
  }

  const addCapaComment = async (text: string) => {
    if (!selected) return
    try {
      await dispatch((d, ctx) => addComment(d, ctx, 'corrective_action', selected.id, text))
      toast.success('Comment posted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not post comment')
    }
  }

  const openNew = () => {
    const first = openFindingsWithoutCapa[0] ?? null
    setNewFindingId(first?.id ?? '')
    setNewDraft(defaultDraft(first, owners, now))
    setNewOpen(true)
  }

  const changeNewFinding = (id: string) => {
    setNewFindingId(id)
    const f = findingById.get(id) ?? null
    setNewDraft(defaultDraft(f, owners, now))
  }

  const submitNew = async (e: FormEvent) => {
    e.preventDefault()
    if (!newDraft || !newFindingId) {
      toast.error('Select a finding first')
      return
    }
    if (!newDraft.title.trim() || !newDraft.ownerId || !newDraft.targetDate) {
      toast.error('Title, owner and target date are required')
      return
    }
    const ok = await run('Corrective action created and assigned', (d, ctx) => createCorrectiveAction(d, ctx, { ...newDraft, findingId: newFindingId }))
    if (ok) {
      setNewOpen(false)
      setNewDraft(null)
    }
  }

  const doExport = async () => {
    exportCsv(
      rows.map((a) => ({
        'Action ID': a.code,
        Title: a.title,
        Finding: a.findingCode,
        'Finding title': a.findingTitle,
        Outlet: a.outletName,
        Category: CATEGORY_LABELS[a.category],
        Owner: a.ownerName,
        Priority: a.priority,
        Status: a.status,
        Created: a.createdAt,
        'Target date': a.targetDate,
        'Days to target': a.daysToTarget ?? '',
        Evidence: a.evidenceIds.length,
        Reviewer: a.reviewerId ? (userById.get(a.reviewerId)?.name ?? '') : '',
        'Closure date': a.closureDate ?? '',
      })),
      `insight360-corrective-actions-${format(now, 'yyyyMMdd')}`,
    )
    try {
      await dispatch((d, ctx) => logExport(d, ctx, 'Corrective actions', 'CSV'))
    } catch {
      /* export already delivered */
    }
    toast.success(`Exported ${rows.length} actions`)
  }

  const columns = useMemo<Column<CapaRow>[]>(
    () => [
      { key: 'code', header: 'Action ID', width: '120px', render: (a) => <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-100">{a.code}</span> },
      {
        key: 'findingCode',
        header: 'Finding',
        render: (a) => (
          <div className="min-w-[220px] max-w-[340px]">
            <p className="font-medium text-slate-800 dark:text-slate-100 leading-snug">{truncate(a.title, 70)}</p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-mono">{a.findingCode}</span> · {truncate(a.findingTitle, 50)}
            </p>
          </div>
        ),
      },
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
      { key: 'category', header: 'Issue category', render: (a) => <span className="text-xs">{CATEGORY_LABELS[a.category]}</span>, sortValue: (a) => CATEGORY_LABELS[a.category] },
      {
        key: 'ownerName',
        header: 'Owner',
        render: (a) => (
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <Avatar name={a.ownerName} size="xs" />
            <span className="text-xs">{a.ownerName}</span>
          </span>
        ),
      },
      { key: 'priority', header: 'Priority', render: (a) => <SeverityBadge severity={a.priority} />, sortValue: (a) => SEVERITY_ORDER[a.priority] },
      {
        key: 'targetDate',
        header: 'Target date',
        render: (a) => {
          const c = dueCaption(a)
          return (
            <div className="whitespace-nowrap">
              <p className="text-xs tabular-nums">{fmtDate(a.targetDate)}</p>
              {c.text && <p className={cn('text-[11px] font-medium', c.tone === 'critical' ? 'text-red-700 dark:text-red-300' : c.tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : c.tone === 'good' ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400')}>{c.text}</p>}
            </div>
          )
        },
      },
      { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
      {
        key: 'evidence',
        header: 'Evidence',
        align: 'center',
        sortValue: (a) => a.evidenceIds.length,
        render: (a) => (
          <span className="inline-flex items-center gap-1 text-xs tabular-nums" aria-label={`${a.evidenceIds.length} evidence items`}>
            <Paperclip className="h-3.5 w-3.5 text-slate-400" aria-hidden /> {a.evidenceIds.length}
          </span>
        ),
      },
      { key: 'reviewer', header: 'Reviewer', sortValue: (a) => (a.reviewerId ? (userById.get(a.reviewerId)?.name ?? '') : ''), render: (a) => <span className="text-xs whitespace-nowrap">{a.reviewerId ? (userById.get(a.reviewerId)?.name ?? '—') : '—'}</span> },
      { key: 'closureDate', header: 'Closure date', render: (a) => <span className="text-xs tabular-nums whitespace-nowrap">{a.closureDate ? fmtDate(a.closureDate) : '—'}</span> },
    ],
    [userById],
  )

  // Workflow footer
  const footer = selected ? (
    <>
      {canManage && selected.status !== 'Closed' && (
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => {
            setAssignOwner(selected.ownerId ?? '')
            setAssignOpen(true)
          }}
          disabled={busy}
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden /> Assign
        </button>
      )}
      {canManage && (selected.status === 'Open' || selected.status === 'Assigned' || selected.status === 'Overdue') && (
        <button type="button" className="btn-primary btn-sm" onClick={() => void transition(selected, 'In Progress', 'Work started')} disabled={busy}>
          <Play className="h-3.5 w-3.5" aria-hidden /> Start work
        </button>
      )}
      {canManage && selected.status === 'In Progress' && (
        <button type="button" className="btn-secondary btn-sm" onClick={() => void transition(selected, 'Awaiting Evidence', 'Evidence requested from owner')} disabled={busy}>
          <ImagePlus className="h-3.5 w-3.5" aria-hidden /> Request evidence
        </button>
      )}
      {canManage && (selected.status === 'In Progress' || selected.status === 'Awaiting Evidence') && (
        <button type="button" className="btn-primary btn-sm" onClick={() => void transition(selected, 'Awaiting Verification', 'Submitted for verification')} disabled={busy}>
          <Eye className="h-3.5 w-3.5" aria-hidden /> Submit for verification
        </button>
      )}
      {canManage && selected.status === 'Awaiting Verification' && (
        <button type="button" className="btn-accent btn-sm" onClick={() => setVerifyOpen(true)} disabled={busy}>
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Verify & close
        </button>
      )}
      {canManage && selected.status === 'Closed' && (
        <button type="button" className="btn-secondary btn-sm" onClick={() => void transition(selected, 'In Progress', 'Reopened for further action')} disabled={busy}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reopen
        </button>
      )}
      <button type="button" className="btn-ghost btn-sm" onClick={() => openAction(null)}>
        Close
      </button>
    </>
  ) : undefined

  const selectedDue = selected ? dueCaption(selected) : null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Corrective Actions"
        subtitle="CAPA — corrective and preventive action tracking"
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => void doExport()} disabled={!rows.length}>
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </button>
            {canManage && (
              <button type="button" className="btn-primary" onClick={openNew}>
                <Plus className="h-4 w-4" aria-hidden /> New corrective action
              </button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          <KpiCard compact label="Open" value={stats.open} icon={ClipboardList} tone="accent" sub={`of ${stats.total} total`} onClick={() => setFilters({})} />
          <KpiCard compact label="Overdue" value={stats.overdue} icon={AlertTriangle} tone="critical" sub="Past target date" onClick={() => setFilters({ status: 'Overdue' })} />
          <KpiCard compact label="Due soon" value={stats.dueSoon} icon={Clock} tone="warn" sub="Within 7 days" onClick={() => setFilters({ due: 'due7' })} />
          <KpiCard compact label="Awaiting verification" value={stats.awaitingVerification} icon={Eye} tone="default" sub="Ready for review" onClick={() => setFilters({ status: 'Awaiting Verification' })} />
          <KpiCard compact label="Closed" value={stats.closed} icon={Lock} tone="good" sub="Verified & closed" onClick={() => setFilters({ status: 'Closed' })} />
          <KpiCard compact label="Closure rate" value={fmtPct(stats.closureRate, 0)} icon={CheckCircle2} tone="good" sub="Closed ÷ raised" />
          <KpiCard compact label="Avg. closure days" value={stats.avgClosureDays === null ? '—' : Math.round(stats.avgClosureDays)} icon={Hourglass} tone="default" sub="Created → closed" />
          <KpiCard compact label="Total actions" value={stats.total} icon={FileText} tone="default" sub="In your scope" />
        </div>
        <Card className="flex flex-col">
          <CardHeader title="Status mix" subtitle="All actions in scope" />
          <CardBody className="flex-1 min-h-[220px]">
            <DonutChart value={stats.closed} max={Math.max(1, stats.total)} label={fmtPct(stats.closureRate, 0)} sublabel="closed" size={150} segments={donutSegments} />
          </CardBody>
        </Card>
      </div>

      <FilterBar search={search} onSearch={setSearch} searchPlaceholder="Search action, finding, outlet or owner…" filters={filterDefs} values={filters} onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={() => { setFilters({}); setSearch('') }} resultCount={rows.length} />

      <Card>
        <DataTable columns={columns} rows={rows} rowKey={(a) => a.id} onRowClick={(a) => openAction(a.id)} selectedKey={selectedId} initialSort={{ key: 'targetDate', dir: 'asc' }} pageSize={15} caption="Corrective actions" emptyTitle="No corrective actions match" emptyMessage="Adjust the filters or raise a new action from an open finding." />
      </Card>

      <Drawer open={!!selected} onClose={() => openAction(null)} width="xl" tour="capa-detail" title={selected ? `${selected.code} · ${selected.title}` : 'Corrective action'} subtitle={selected ? `${selected.outletName} · owner ${selected.ownerName}` : undefined} footer={footer}>
        {selected && selectedDue && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.status} size="md" />
              <SeverityBadge severity={selected.priority} size="md" />
              <Badge tone="navy" size="md">
                {CATEGORY_LABELS[selected.category]}
              </Badge>
              {selectedDue.text && (
                <Badge tone={selectedDue.tone === 'critical' ? 'red' : selectedDue.tone === 'warn' ? 'amber' : selectedDue.tone === 'good' ? 'green' : 'slate'} icon={CalendarClock} size="md">
                  {selectedDue.text}
                </Badge>
              )}
            </div>

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
                  label: 'Finding',
                  value: (
                    <Link to={`/quality/findings?finding=${selected.findingId}`} className="link">
                      <span className="font-mono text-xs">{selected.findingCode}</span> · {truncate(selected.findingTitle, 60)}
                    </Link>
                  ),
                },
                { label: 'Category', value: CATEGORY_LABELS[selected.category] },
                {
                  label: 'Owner',
                  value: (
                    <span className="inline-flex items-center gap-2">
                      <Avatar name={selected.ownerName} size="xs" /> {selected.ownerName}
                    </span>
                  ),
                },
                { label: 'Target date', value: fmtDate(selected.targetDate) },
                { label: 'Created', value: fmtDateTime(selected.createdAt) },
                { label: 'Reviewer', value: reviewerName },
                { label: 'Closure date', value: selected.closureDate ? fmtDate(selected.closureDate) : '—' },
              ]}
            />

            <Divider />

            <section className="space-y-3">
              <EditableBlock label="Description" value={selected.description} canEdit={canManage} busy={busy} onSave={saveField(selected, 'description', 'Description')} />
              <EditableBlock label="Root cause" value={selected.rootCause} canEdit={canManage} busy={busy} onSave={saveField(selected, 'rootCause', 'Root cause')} />
              <EditableBlock label="Immediate action" value={selected.immediateAction} canEdit={canManage} busy={busy} onSave={saveField(selected, 'immediateAction', 'Immediate action')} />
              <EditableBlock label="Corrective action" value={selected.correctiveAction} canEdit={canManage} busy={busy} onSave={saveField(selected, 'correctiveAction', 'Corrective action')} />
              <EditableBlock label="Preventive action" value={selected.preventiveAction} canEdit={canManage} busy={busy} onSave={saveField(selected, 'preventiveAction', 'Preventive action')} />
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="section-title">Evidence ({selectedEvidence.length})</h3>
                {canManage && selected.status !== 'Closed' && (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setAttachOpen(true)} disabled={busy}>
                    <Paperclip className="h-3.5 w-3.5" aria-hidden /> Attach evidence
                  </button>
                )}
              </div>
              {selectedEvidence.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {selectedEvidence.map((ev) => (
                    <EvidenceCard key={ev.id} evidence={ev} onClick={() => setPreview(ev)} meta={`${ev.type} · ${fmtDate(ev.uploadedAt)} · ${ev.uploadedBy}`} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">No closure evidence attached yet.</p>
              )}
            </section>

            <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-navy-800 dark:bg-navy-800/60">
              <h3 className="section-title mb-1 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Verification note
              </h3>
              <p className={cn('text-sm', selected.verificationNote ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500 italic')}>{selected.verificationNote ?? 'Not yet verified.'}</p>
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
              <CommentsThread comments={selectedComments} canComment={canComment} onAdd={addCapaComment} />
            </section>
          </div>
        )}
      </Drawer>

      {/* Assign owner */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign owner"
        description={selected ? `${selected.code} · ${selected.title}` : undefined}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setAssignOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={() => void submitAssign()} disabled={busy || !assignOwner}>
              {busy ? 'Assigning…' : 'Assign'}
            </button>
          </>
        }
      >
        <Field label="Owner" required htmlFor="assign-owner">
          <Select id="assign-owner" value={assignOwner} onChange={(e) => setAssignOwner(e.target.value)}>
            <option value="">Select owner…</option>
            {owners.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.title}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>

      {/* Verify & close */}
      <ConfirmDialog
        open={verifyOpen}
        title="Verify & close corrective action"
        confirmLabel="Verify & close"
        busy={busy}
        onCancel={() => setVerifyOpen(false)}
        onConfirm={submitVerify}
        message={
          <div className="space-y-3">
            <p>
              Confirm that the corrective and preventive actions for <span className="font-mono text-xs">{selected?.code}</span> have been implemented and verified. The linked finding will be closed and any related alert resolved.
            </p>
            <Field label="Verification note" htmlFor="verify-note">
              <Textarea id="verify-note" value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)} placeholder="What was checked and by whom?" />
            </Field>
          </div>
        }
      />

      {/* Attach evidence */}
      <Modal
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        title="Attach closure evidence"
        description="Demo mode generates a neutral placeholder — no file is stored."
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setAttachOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" form="attach-form" className="btn-primary" disabled={busy}>
              {busy ? 'Attaching…' : 'Attach'}
            </button>
          </>
        }
      >
        <form id="attach-form" onSubmit={(e) => void submitAttach(e)} className="space-y-4">
          <Field label="Type" htmlFor="attach-type">
            <Select id="attach-type" value={attach.type} onChange={(e) => setAttach((a) => ({ ...a, type: e.target.value as EvidenceType }))}>
              {EVIDENCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" required htmlFor="attach-title">
            <Input id="attach-title" value={attach.title} onChange={(e) => setAttach((a) => ({ ...a, title: e.target.value }))} placeholder="e.g. Repaired signage — after" required />
          </Field>
          <Field label="Description" htmlFor="attach-desc">
            <Textarea id="attach-desc" value={attach.description} onChange={(e) => setAttach((a) => ({ ...a, description: e.target.value }))} className="min-h-[64px]" />
          </Field>
        </form>
      </Modal>

      {/* New corrective action */}
      <Modal
        open={newOpen && !!newDraft}
        onClose={() => setNewOpen(false)}
        title="New corrective action"
        description="Raise a CAPA against an open finding that has no corrective action yet."
        size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setNewOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" form="new-capa-form" className="btn-primary" disabled={busy || !newFindingId}>
              {busy ? 'Creating…' : 'Create & assign'}
            </button>
          </>
        }
      >
        {newDraft && (
          <form id="new-capa-form" onSubmit={(e) => void submitNew(e)} className="space-y-4">
            <Field label="Finding" required htmlFor="new-finding" hint={openFindingsWithoutCapa.length ? `${openFindingsWithoutCapa.length} open findings without a corrective action` : 'Every open finding in your scope already has a corrective action.'}>
              <Select id="new-finding" value={newFindingId} onChange={(e) => changeNewFinding(e.target.value)} required>
                <option value="">Select finding…</option>
                {openFindingsWithoutCapa.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} · {f.severity} · {outletById.get(f.outletId)?.name ?? ''} · {truncate(f.title, 50)}
                  </option>
                ))}
              </Select>
            </Field>
            {newFindingId ? (
              <CapaFormFields value={newDraft} onChange={(patch) => setNewDraft((d) => (d ? { ...d, ...patch } : d))} owners={owners} />
            ) : (
              <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <X className="h-3.5 w-3.5" aria-hidden /> Choose a finding to prefill the action details.
              </p>
            )}
          </form>
        )}
      </Modal>

      <EvidencePreviewModal evidence={preview} onClose={() => setPreview(null)} context={selected ? { outlet: selected.outletName, visit: selectedFinding ? (data.visits.find((v) => v.id === selectedFinding.visitId)?.code ?? undefined) : undefined, question: selectedFinding?.questionId ? data.questions.find((q) => q.id === selectedFinding.questionId)?.text : undefined } : undefined} />
    </div>
  )
}
