import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, ClipboardList, Eye, FileText, Images, MessageSquare, PlayCircle, Printer, Target, ThumbsUp, UserPlus, XCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import type { Evidence } from '@/types'
import { addComment, approveVisit, assignShopper, rejectVisit, startReview, startVisit } from '@/services/actions'
import { isAwaitingApproval, isCompleted } from '@/services/derive'
import { CATEGORY_KEYS, CATEGORY_LABELS } from '@/utils/scoring'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, RiskBadge, ScoreBadge, SegmentBadge, SeverityBadge, StatusBadge, scoreTextClass } from '@/components/ui/Badge'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/States'
import { Field, Select, Textarea } from '@/components/ui/Form'
import { Avatar, DescriptionList, ProgressBar, Timeline } from '@/components/ui/Misc'
import { EvidenceCard, EvidencePreviewModal } from '@/components/ui/EvidenceThumb'
import { printPage } from '@/utils/export'
import { fmtCurrency, fmtDate, fmtDateTime, hoursBetween, relativeTime } from '@/utils/format'

export default function VisitDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const now = useNow()
  const { role, can } = useAuth()
  const { data, dispatch } = useData()

  const visit = data.visits.find((v) => v.id === id) ?? null
  const outlet = visit ? data.outlets.find((o) => o.id === visit.outletId) ?? null : null
  useDocumentTitle(visit ? `${visit.code} · ${outlet?.name ?? 'Visit'}` : 'Visit not found')

  const shopper = visit?.shopperId ? data.shoppers.find((s) => s.id === visit.shopperId) ?? null : null
  const template = visit ? data.templates.find((t) => t.id === visit.templateId) ?? null : null
  const scenario = visit?.scenarioId ? data.scenarios.find((s) => s.id === visit.scenarioId) ?? null : null
  const findings = useMemo(() => (visit ? data.findings.filter((f) => f.visitId === visit.id) : []), [data.findings, visit])
  const evidence = useMemo(() => (visit ? data.evidence.filter((e) => e.visitId === visit.id).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)) : []), [data.evidence, visit])
  const comments = useMemo(() => (visit ? data.comments.filter((c) => c.entityType === 'visit' && c.entityId === visit.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : []), [data.comments, visit])

  const [assignOpen, setAssignOpen] = useState(false)
  const [assignId, setAssignId] = useState('')
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null)
  const [comment, setComment] = useState('')
  const [newComment, setNewComment] = useState('')
  const [preview, setPreview] = useState<Evidence | null>(null)
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

  if (!visit || !outlet) {
    return (
      <EmptyState
        title="Visit not found"
        message="The visit you are looking for does not exist or is outside your outlet scope."
        icon={ClipboardList}
        action={
          <Link to="/operations/visits" className="btn-secondary">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to visits
          </Link>
        }
      />
    )
  }

  const isShopper = role === 'shopper'
  const canReview = can('visits.review')
  const canAssign = can('visits.assign') && !isCompleted(visit) && !isAwaitingApproval(visit)
  const canComment = can('findings.comment') || role === 'super_admin' || role === 'client_admin'
  const eligibleShoppers = data.shoppers.filter((s) => s.status === 'Active' && s.assignedCategories.includes(outlet.segment)).sort((a, b) => a.name.localeCompare(b.name))
  const turnaround = hoursBetween(visit.visitEnd, visit.submittedAt)
  const dueIn = visit.submissionDeadline && !visit.submittedAt ? relativeTime(visit.submissionDeadline, now) : null

  const onAssign = () => {
    if (!assignId) return
    const s = data.shoppers.find((x) => x.id === assignId)
    void run(`${s?.name ?? 'Shopper'} assigned to ${visit.code}`, (d, ctx) => assignShopper(d, ctx, visit.id, assignId), () => setAssignOpen(false))
  }

  const submitDecision = async () => {
    if (!decision) return
    if (decision === 'reject' && !comment.trim()) {
      toast.error('A reason is required to reject a report.')
      return
    }
    await run(decision === 'approve' ? `${visit.code} approved` : `${visit.code} returned to shopper`, (d, ctx) => (decision === 'approve' ? approveVisit(d, ctx, visit.id, comment.trim()) : rejectVisit(d, ctx, visit.id, comment.trim())), () => {
      setDecision(null)
      setComment('')
    })
  }

  const submitComment = (e: FormEvent) => {
    e.preventDefault()
    const text = newComment.trim()
    if (!text) return
    void run('Comment added', (d, ctx) => addComment(d, ctx, 'visit', visit.id, text), () => setNewComment(''))
  }

  const actions = (
    <>
      {isShopper && visit.status === 'Assigned' && can('visits.conduct') && (
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void run(`${visit.code} started`, (d, ctx) => startVisit(d, ctx, visit.id), () => navigate(`/operations/visits/${visit.id}/audit`))}>
          <PlayCircle className="h-4 w-4" aria-hidden /> Start visit
        </button>
      )}
      {isShopper && can('visits.conduct') && (visit.status === 'In Progress' || visit.status === 'Draft' || visit.status === 'Rejected') && (
        <button type="button" className="btn-accent" onClick={() => navigate(`/operations/visits/${visit.id}/audit`)}>
          <ClipboardList className="h-4 w-4" aria-hidden /> Continue assessment
        </button>
      )}
      {canAssign && (
        <button type="button" className="btn-secondary" onClick={() => { setAssignId(visit.shopperId ?? ''); setAssignOpen(true) }}>
          <UserPlus className="h-4 w-4" aria-hidden /> {visit.shopperId ? 'Reassign shopper' : 'Assign shopper'}
        </button>
      )}
      {canReview && visit.status === 'Submitted' && (
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void run(`Review started for ${visit.code}`, (d, ctx) => startReview(d, ctx, visit.id))}>
          <Eye className="h-4 w-4" aria-hidden /> Start review
        </button>
      )}
      {canReview && isAwaitingApproval(visit) && (
        <>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => { setComment(''); setDecision('approve') }}>
            <ThumbsUp className="h-4 w-4" aria-hidden /> Approve
          </button>
          <button type="button" className="btn-danger" disabled={busy} onClick={() => { setComment(''); setDecision('reject') }}>
            <XCircle className="h-4 w-4" aria-hidden /> Reject
          </button>
        </>
      )}
      {visit.score !== null && (can('reports.visit') || can('visits.conduct')) && (
        <button type="button" className="btn-secondary" onClick={() => navigate(`/reports/visits/${visit.id}`)}>
          <FileText className="h-4 w-4" aria-hidden /> View report
        </button>
      )}
      <button type="button" className="btn-ghost" onClick={printPage}>
        <Printer className="h-4 w-4" aria-hidden /> Print
      </button>
    </>
  )

  return (
    <div className="space-y-5 print-area">
      <nav aria-label="Breadcrumb" className="no-print">
        <Link to="/operations/visits" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All visits
        </Link>
      </nav>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {outlet.name}
            <span className="font-mono text-base font-medium text-slate-500 dark:text-slate-400">{visit.code}</span>
          </span>
        }
        subtitle={`${visit.type} · ${visit.journey} · ${outlet.brand} · ${outlet.location}`}
        badge={
          <span className="flex flex-wrap items-center gap-1.5">
            <SegmentBadge segment={outlet.segment} />
            <StatusBadge status={visit.status} />
            <RiskBadge risk={visit.risk} />
            <ScoreBadge score={visit.score} showLabel />
          </span>
        }
        actions={actions}
      />

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        {/* Left column */}
        <div className="space-y-5 min-w-0">
          <Card>
            <CardHeader title="Visit information" subtitle={template ? `${template.name} · v${template.version}` : undefined} />
            <CardBody>
              <DescriptionList
                columns={3}
                items={[
                  { label: 'Outlet', value: <Link to={`/performance/outlets/${outlet.id}`} className="link">{outlet.name}</Link> },
                  { label: 'Brand', value: outlet.brand },
                  { label: 'Category', value: `${outlet.segment} · ${outlet.subcategory}` },
                  { label: 'Journey', value: visit.journey },
                  { label: 'Template', value: template?.name ?? '—' },
                  { label: 'Scenario', value: scenario ? `${scenario.code} · ${scenario.name}` : '—' },
                  { label: 'Shopper', value: shopper ? <Link to={`/operations/shoppers/${shopper.id}`} className="link">{shopper.name}</Link> : <span className="italic text-slate-400">Unassigned</span> },
                  { label: 'Scheduled', value: fmtDate(visit.scheduledDate) },
                  { label: 'Visit date', value: fmtDate(visit.visitDate) },
                  { label: 'Visit window', value: visit.visitStart ? `${fmtDateTime(visit.visitStart)} → ${visit.visitEnd ? fmtDate(visit.visitEnd, 'HH:mm') : '…'}` : '—' },
                  { label: 'Party size', value: visit.partySize },
                  { label: 'Spend', value: fmtCurrency(visit.spend, data.organization.currency) },
                  { label: 'Critical failures', value: visit.criticalCount ? <span className="font-semibold text-red-700 dark:text-red-300">{visit.criticalCount}</span> : '0' },
                ]}
              />
              {visit.narrative && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-navy-800 dark:bg-navy-800/50 dark:text-slate-200">
                  <p className="section-title mb-1">Shopper narrative</p>
                  <p className="leading-relaxed">{visit.narrative}</p>
                </div>
              )}
            </CardBody>
          </Card>

          {scenario && (
            <Card>
              <CardHeader
                title="Scenario briefing"
                subtitle={`${scenario.code} · ${scenario.name}`}
                actions={<Badge tone="teal" icon={Target}>{scenario.type}</Badge>}
              />
              <CardBody className="space-y-3">
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{scenario.description}</p>
                <div>
                  <p className="section-title mb-1.5">Shopper instructions</p>
                  <ol className="space-y-1.5">
                    {scenario.instructions.map((ins, i) => (
                      <li key={ins} className="flex gap-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600 dark:bg-navy-800 dark:text-slate-300">{i + 1}</span>
                        <span className="min-w-0">{ins}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="rounded-lg border border-teal-200 bg-teal-50/70 p-3 dark:border-teal-500/30 dark:bg-teal-500/10">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-800 dark:text-teal-300">Expected outcome</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{scenario.expectedOutcome}</p>
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Reporting SLA" subtitle={`${data.organization.reportingTargetHours}–${data.organization.reportingSlaHours}h submission window after visit completion`} actions={<StatusBadge status={visit.slaStatus} />} />
            <CardBody>
              <DescriptionList
                columns={4}
                items={[
                  { label: 'Visit completed', value: fmtDateTime(visit.visitEnd) },
                  { label: 'Submission due', value: <span>{fmtDateTime(visit.submissionDeadline)}{dueIn && <span className="ml-1 text-xs text-slate-500">({dueIn})</span>}</span> },
                  { label: 'Submitted', value: fmtDateTime(visit.submittedAt) },
                  { label: 'Turnaround', value: turnaround !== null ? `${turnaround} h` : '—' },
                ]}
              />
            </CardBody>
          </Card>

          {visit.categoryScores ? (
            <Card>
              <CardHeader title="Category scores" subtitle="KPI-weighted results for this assessment" actions={<span className={`text-lg font-semibold tabular-nums ${scoreTextClass(visit.score)}`}>{visit.score?.toFixed(1)}%</span>} />
              <CardBody className="space-y-3">
                {CATEGORY_KEYS.map((k) => {
                  const v = visit.categoryScores?.[k]
                  const has = typeof v === 'number' && !Number.isNaN(v)
                  return (
                    <div key={k}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-200">{CATEGORY_LABELS[k]}</span>
                        <span className={`tabular-nums ${has ? scoreTextClass(v) : 'text-slate-400'}`}>{has ? `${v.toFixed(1)}%` : 'n/a'}</span>
                      </div>
                      <ProgressBar value={has ? v : 0} label={CATEGORY_LABELS[k]} />
                    </div>
                  )
                })}
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader title="Assessment progress" subtitle={visit.status === 'Planned' || visit.status === 'Assigned' ? 'Not started yet' : 'Mandatory questions answered'} />
              <CardBody>
                <ProgressBar value={visit.progress} tone="accent" showValue label="Assessment progress" />
              </CardBody>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5 min-w-0">
          <Card>
            <CardHeader title="Approval history" subtitle={visit.reviewerComment ? `Latest reviewer note: ${visit.reviewerComment}` : undefined} />
            <CardBody>
              <Timeline items={visit.approvalHistory.map((h) => ({ at: h.at, by: h.by, action: h.action, note: h.comment }))} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Findings from this visit" subtitle={`${findings.length} recorded`} />
            <CardBody className="space-y-2">
              {findings.length === 0 && <p className="text-xs text-slate-500">No findings were raised on this visit.</p>}
              {findings.map((f) => (
                <Link key={f.id} to={`/quality/findings?finding=${f.id}`} className="block rounded-lg border border-slate-200 p-3 transition hover:border-teal-400 dark:border-navy-800 dark:hover:border-teal-600">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SeverityBadge severity={f.severity} size="xs" />
                    <StatusBadge status={f.status} size="xs" />
                    {f.repeated && <Badge tone="amber" size="xs">Repeated</Badge>}
                    <span className="ml-auto font-mono text-[10px] text-slate-400">{f.code}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">{f.title}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{CATEGORY_LABELS[f.category]}</p>
                </Link>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Evidence"
              subtitle={`${evidence.length} file${evidence.length === 1 ? '' : 's'} captured`}
              actions={
                evidence.length > 0 && can('evidence.view') ? (
                  <Link to={`/evidence?visit=${visit.id}`} className="btn-ghost btn-sm">
                    <Images className="h-3.5 w-3.5" aria-hidden /> Library
                  </Link>
                ) : undefined
              }
            />
            <CardBody>
              {evidence.length === 0 ? (
                <p className="text-xs text-slate-500">No evidence uploaded yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {evidence.slice(0, 6).map((e) => (
                    <EvidenceCard key={e.id} evidence={e} onClick={() => setPreview(e)} />
                  ))}
                </div>
              )}
              {evidence.length > 6 && (
                <Link to={`/evidence?visit=${visit.id}`} className="link mt-3 inline-block text-xs">
                  View all {evidence.length} items →
                </Link>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Comments" subtitle={`${comments.length} internal note${comments.length === 1 ? '' : 's'}`} />
            <CardBody className="space-y-3">
              {comments.length === 0 && <p className="text-xs text-slate-500">No comments yet.</p>}
              <ul className="space-y-3">
                {comments.map((c) => (
                  <li key={c.id} className="flex gap-2.5">
                    <Avatar name={c.userName} size="sm" />
                    <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2 dark:bg-navy-800/60">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{c.userName}</p>
                        <time className="text-[10px] text-slate-400" dateTime={c.createdAt}>
                          {fmtDateTime(c.createdAt)}
                        </time>
                      </div>
                      <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-200">{c.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {canComment && (
                <form onSubmit={submitComment} className="no-print space-y-2 border-t border-slate-100 pt-3 dark:border-navy-800">
                  <label htmlFor="visit-comment" className="sr-only">
                    Add a comment
                  </label>
                  <Textarea id="visit-comment" value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add an internal note for reviewers and managers…" className="min-h-[64px]" />
                  <div className="flex justify-end">
                    <button type="submit" className="btn-primary btn-sm" disabled={busy || !newComment.trim()}>
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Post comment
                    </button>
                  </div>
                </form>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Assign modal */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={`${visit.shopperId ? 'Reassign' : 'Assign'} shopper · ${visit.code}`}
        description={`Active shoppers eligible for ${outlet.segment}.`}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setAssignOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={busy || !assignId || assignId === visit.shopperId} onClick={onAssign}>
              {busy ? 'Assigning…' : 'Assign'}
            </button>
          </>
        }
      >
        <Field label="Shopper" htmlFor="detail-assign" required>
          <Select id="detail-assign" value={assignId} onChange={(e) => setAssignId(e.target.value)}>
            <option value="">Select a shopper…</option>
            {eligibleShoppers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.availability} · {s.certificationStatus}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>

      <ConfirmDialog
        open={!!decision}
        title={decision === 'approve' ? `Approve ${visit.code}` : `Reject ${visit.code}`}
        tone={decision === 'reject' ? 'danger' : 'default'}
        confirmLabel={decision === 'approve' ? 'Approve report' : 'Reject & return'}
        busy={busy}
        onCancel={() => {
          setDecision(null)
          setComment('')
        }}
        onConfirm={submitDecision}
        message={
          <div className="space-y-3">
            <p>{decision === 'approve' ? `Approving publishes the report (score ${visit.score?.toFixed(1) ?? '—'}%) and updates ${outlet.name}'s rating.` : 'The report will be returned to the shopper for revision. A reason is required.'}</p>
            <Field label={decision === 'approve' ? 'Reviewer comment (optional)' : 'Reason for rejection'} htmlFor="detail-decision" required={decision === 'reject'}>
              <Textarea id="detail-decision" value={comment} onChange={(e) => setComment(e.target.value)} />
            </Field>
          </div>
        }
      />

      <EvidencePreviewModal evidence={preview} onClose={() => setPreview(null)} context={{ outlet: outlet.name, visit: `${visit.code} · ${visit.type}`, question: preview?.questionId ? data.questions.find((q) => q.id === preview.questionId)?.text : undefined }} />
    </div>
  )
}
