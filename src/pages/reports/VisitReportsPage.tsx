import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Download, FileText, Hourglass, ShieldCheck, ThumbsUp, XCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import type { ReportStatus, RiskRating, SlaStatus, Visit, VisitType } from '@/types'
import { approveVisit, logExport, rejectVisit } from '@/services/actions'
import { slaStats } from '@/services/analytics'
import { PageHeader } from '@/components/ui/PageHeader'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { FilterBar, applyFilters, matchesSearch, type FilterDef } from '@/components/ui/FilterBar'
import { Badge, RiskBadge, ScoreBadge, StatusBadge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Input, Textarea } from '@/components/ui/Form'
import { exportCsv } from '@/utils/export'
import { fmtDate, fmtDateTime, fmtPct, round } from '@/utils/format'
import { cn } from '@/utils/cn'

const VISIT_TYPES: VisitType[] = ['Main Audit 1', 'Follow-up 1', 'Main Audit 2', 'Follow-up 2']
const REPORT_STATUSES: ReportStatus[] = ['Draft', 'Pending Review', 'Approved', 'Rejected', 'Published']
const SLA_STATUSES: SlaStatus[] = ['Within SLA', 'At Risk', 'Breached', 'Pending']
const RISKS: RiskRating[] = ['Excellent', 'Good', 'Needs Improvement', 'Critical']

function scoreBand(score: number | null): string {
  if (score === null) return 'none'
  if (score >= 90) return '90'
  if (score >= 80) return '80'
  if (score >= 70) return '70'
  return 'lt70'
}

type ReviewAction = { kind: 'approve' | 'reject'; visit: Visit }

export default function VisitReportsPage() {
  useDocumentTitle('Visit Reports')
  const navigate = useNavigate()
  const now = useNow()
  const { can } = useAuth()
  const { data, dispatch, scopedOutlets, scopedVisits } = useData()

  const outletById = useMemo(() => new Map(data.outlets.map((o) => [o.id, o])), [data.outlets])
  const userById = useMemo(() => new Map(data.users.map((u) => [u.id, u])), [data.users])
  const outletName = (id: string) => outletById.get(id)?.name ?? '—'
  const reviewerName = (id: string | null) => (id ? (userById.get(id)?.name ?? '—') : '—')

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [review, setReview] = useState<ReviewAction | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  const sla = useMemo(() => slaStats(scopedVisits, now), [scopedVisits, now])

  const reportVisits = useMemo(() => scopedVisits.filter((v) => v.score !== null || v.reportStatus !== 'Not Started'), [scopedVisits])

  const filterDefs: FilterDef[] = useMemo(
    () => [
      { key: 'outlet', label: 'Outlet', options: [...scopedOutlets].sort((a, b) => a.name.localeCompare(b.name)).map((o) => ({ value: o.id, label: o.name })) },
      { key: 'type', label: 'Visit type', options: VISIT_TYPES.map((t) => ({ value: t, label: t })) },
      { key: 'reportStatus', label: 'Report status', options: REPORT_STATUSES.map((s) => ({ value: s, label: s })) },
      { key: 'sla', label: 'SLA', options: SLA_STATUSES.map((s) => ({ value: s, label: s })), allLabel: 'All SLA states' },
      { key: 'risk', label: 'Risk', options: RISKS.map((r) => ({ value: r, label: r })) },
      {
        key: 'band',
        label: 'Score band',
        options: [
          { value: '90', label: '90%+ Excellent' },
          { value: '80', label: '80–89% Good' },
          { value: '70', label: '70–79% Needs improvement' },
          { value: 'lt70', label: 'Below 70% Critical' },
        ],
        allLabel: 'All score bands',
      },
    ],
    [scopedOutlets],
  )

  const rows = useMemo(() => {
    let list = applyFilters(reportVisits, filters, {
      outlet: (v) => v.outletId,
      type: (v) => v.type,
      reportStatus: (v) => v.reportStatus,
      sla: (v) => v.slaStatus,
      risk: (v) => v.risk,
      band: (v) => scoreBand(v.score),
    })
    if (dateFrom) list = list.filter((v) => (v.visitDate ?? v.scheduledDate).slice(0, 10) >= dateFrom)
    if (dateTo) list = list.filter((v) => (v.visitDate ?? v.scheduledDate).slice(0, 10) <= dateTo)
    return matchesSearch(list, search, (v) => [v.code, outletName(v.outletId), outletById.get(v.outletId)?.code])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportVisits, filters, search, dateFrom, dateTo, outletById])

  const resetFilters = () => {
    setFilters({})
    setSearch('')
    setDateFrom('')
    setDateTo('')
  }

  const canReview = can('visits.review')
  const canExport = can('reports.export')
  const reviewable = (v: Visit) => canReview && (v.status === 'Submitted' || v.status === 'Under Review')

  const openReview = (kind: ReviewAction['kind'], visit: Visit) => {
    setComment('')
    setReview({ kind, visit })
  }

  const confirmReview = async () => {
    if (!review) return
    if (review.kind === 'reject' && !comment.trim()) {
      toast.error('A reason is required when returning a report.')
      return
    }
    setBusy(true)
    try {
      if (review.kind === 'approve') {
        await dispatch((d, ctx) => approveVisit(d, ctx, review.visit.id, comment.trim()))
        toast.success(`${review.visit.code} approved`)
      } else {
        await dispatch((d, ctx) => rejectVisit(d, ctx, review.visit.id, comment.trim()))
        toast.success(`${review.visit.code} returned for revision`)
      }
      setReview(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const exportRows = async () => {
    if (!rows.length) {
      toast.error('Nothing to export for the current filters.')
      return
    }
    exportCsv(
      rows.map((v) => ({
        'Visit ID': v.code,
        Outlet: outletName(v.outletId),
        'Outlet code': outletById.get(v.outletId)?.code ?? '',
        'Visit type': v.type,
        Journey: v.journey,
        'Visit date': v.visitDate ?? '',
        'Submission due': v.submissionDeadline ?? '',
        Submitted: v.submittedAt ?? '',
        SLA: v.slaStatus,
        'Report status': v.reportStatus,
        'Visit status': v.status,
        Score: v.score ?? '',
        Risk: v.risk ?? '',
        'Critical failures': v.criticalCount,
        Reviewer: reviewerName(v.reviewerId),
        'Reviewed at': v.reviewedAt ?? '',
      })),
      `visit-reports-${fmtDate(now, 'yyyyMMdd')}`,
    )
    await dispatch((d, ctx) => logExport(d, ctx, `Visit reports (${rows.length} rows)`, 'CSV'))
    toast.success(`Exported ${rows.length} report${rows.length === 1 ? '' : 's'} to CSV`)
  }

  const columns: Column<Visit>[] = [
    { key: 'code', header: 'Visit ID', render: (v) => <span className="font-medium text-slate-900 dark:text-white">{v.code}</span>, width: '110px' },
    {
      key: 'outlet',
      header: 'Outlet',
      sortValue: (v) => outletName(v.outletId),
      render: (v) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800 dark:text-slate-100">{outletName(v.outletId)}</p>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{outletById.get(v.outletId)?.code}</p>
        </div>
      ),
    },
    { key: 'type', header: 'Visit Type', render: (v) => <span className="whitespace-nowrap">{v.type}</span> },
    { key: 'visitDate', header: 'Visit Date', sortValue: (v) => v.visitDate ?? v.scheduledDate, render: (v) => <span className="whitespace-nowrap">{fmtDate(v.visitDate)}</span> },
    { key: 'submissionDeadline', header: 'Submission Due', sortValue: (v) => v.submissionDeadline, render: (v) => <span className="whitespace-nowrap">{fmtDateTime(v.submissionDeadline)}</span> },
    { key: 'submittedAt', header: 'Submitted', sortValue: (v) => v.submittedAt, render: (v) => <span className="whitespace-nowrap">{fmtDateTime(v.submittedAt)}</span> },
    { key: 'slaStatus', header: 'SLA', render: (v) => <StatusBadge status={v.slaStatus} /> },
    { key: 'reportStatus', header: 'Report Status', render: (v) => <StatusBadge status={v.reportStatus} /> },
    { key: 'score', header: 'Score', sortValue: (v) => v.score, render: (v) => <ScoreBadge score={v.score} />, align: 'right' },
    { key: 'risk', header: 'Risk', render: (v) => <RiskBadge risk={v.risk} /> },
    {
      key: 'criticalCount',
      header: 'Critical',
      align: 'center',
      render: (v) =>
        v.criticalCount > 0 ? (
          <Badge tone="red" icon={AlertTriangle}>
            {v.criticalCount}
          </Badge>
        ) : (
          <span className="text-xs text-slate-400">0</span>
        ),
    },
    { key: 'reviewer', header: 'Reviewer', sortValue: (v) => reviewerName(v.reviewerId), render: (v) => <span className="whitespace-nowrap text-slate-600 dark:text-slate-300">{reviewerName(v.reviewerId)}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      sortable: false,
      align: 'right',
      render: (v) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <button type="button" className="btn-ghost btn-sm" onClick={() => navigate(`/reports/visits/${v.id}`)} aria-label={`Open report ${v.code}`}>
            <FileText className="h-3.5 w-3.5" aria-hidden /> Open report
          </button>
          {reviewable(v) && (
            <>
              <button type="button" className="btn-ghost btn-sm text-emerald-700 dark:text-emerald-300" onClick={() => openReview('approve', v)} aria-label={`Approve ${v.code}`}>
                <ThumbsUp className="h-3.5 w-3.5" aria-hidden /> Approve
              </button>
              <button type="button" className="btn-ghost btn-sm text-red-700 dark:text-red-300" onClick={() => openReview('reject', v)} aria-label={`Reject ${v.code}`}>
                <XCircle className="h-3.5 w-3.5" aria-hidden /> Reject
              </button>
            </>
          )}
        </div>
      ),
    },
  ]

  const awaiting = rows.filter((v) => v.status === 'Submitted' || v.status === 'Under Review').length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Visit Reports"
        subtitle="Submitted, reviewed and approved assessment reports"
        badge={awaiting > 0 ? <Badge tone="violet" icon={Hourglass}>{awaiting} awaiting approval</Badge> : undefined}
        actions={
          canExport ? (
            <button type="button" className="btn-secondary" onClick={() => void exportRows()}>
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </button>
          ) : undefined
        }
      />

      {/* Reporting SLA panel */}
      <section aria-labelledby="sla-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="sla-heading" className="section-title">
            Reporting SLA
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Reports must be submitted within {data.organization.reportingSlaHours} hours of visit completion · {sla.submitted} submitted
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard compact label="SLA Compliance" value={fmtPct(sla.compliancePct, 1)} icon={ShieldCheck} tone={sla.compliancePct !== null && sla.compliancePct >= 90 ? 'good' : 'warn'} sub="Submitted within SLA" />
          <KpiCard compact label="Avg Report Turnaround" value={sla.avgTurnaroundHours === null ? '—' : `${round(sla.avgTurnaroundHours, 0)} h`} icon={Clock} tone="accent" sub={`Target ${data.organization.reportingSlaHours} h`} />
          <KpiCard compact label="Late Reports" value={sla.late} icon={AlertTriangle} tone={sla.late > 0 ? 'critical' : 'good'} sub="SLA breached" onClick={() => setFilters((f) => ({ ...f, sla: 'Breached' }))} />
          <KpiCard compact label="Reports Due Today" value={sla.dueToday} icon={CalendarClock} tone={sla.dueToday > 0 ? 'warn' : 'default'} sub={fmtDate(now)} />
          <KpiCard compact label="At Risk" value={sla.atRisk} icon={Hourglass} tone={sla.atRisk > 0 ? 'warn' : 'good'} sub="Approaching deadline" onClick={() => setFilters((f) => ({ ...f, sla: 'At Risk' }))} />
        </div>
      </section>

      <FilterBar search={search} onSearch={setSearch} searchPlaceholder="Search visit ID or outlet…" filters={filterDefs} values={filters} onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={resetFilters} resultCount={rows.length}>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="sr-only sm:not-sr-only whitespace-nowrap">Visit date</span>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="!w-auto !py-1.5 text-xs" aria-label="Visit date from" />
          <span aria-hidden>–</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="!w-auto !py-1.5 text-xs" aria-label="Visit date to" />
        </div>
      </FilterBar>

      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(v) => v.id}
          onRowClick={(v) => navigate(`/reports/visits/${v.id}`)}
          initialSort={{ key: 'visitDate', dir: 'desc' }}
          caption="Visit reports"
          emptyTitle="No reports match"
          emptyMessage="Adjust the filters or date range to see submitted reports."
          rowClassName={(v) => cn(v.slaStatus === 'Breached' && 'bg-red-50/40 dark:bg-red-500/5')}
        />
      </Card>

      <ConfirmDialog
        open={!!review}
        title={review?.kind === 'approve' ? `Approve ${review.visit.code}` : `Reject ${review?.visit.code ?? ''}`}
        confirmLabel={review?.kind === 'approve' ? 'Approve report' : 'Return for revision'}
        tone={review?.kind === 'reject' ? 'danger' : 'default'}
        busy={busy}
        onCancel={() => setReview(null)}
        onConfirm={confirmReview}
        message={
          review && (
            <div className="space-y-3">
              <p>
                {review.kind === 'approve' ? (
                  <>
                    Approving publishes the assessment for <strong>{outletName(review.visit.outletId)}</strong> ({review.visit.type}, score {fmtPct(review.visit.score)}). The outlet score and rankings will update immediately.
                  </>
                ) : (
                  <>
                    The report for <strong>{outletName(review.visit.outletId)}</strong> will be returned to the shopper for revision. Provide a clear reason.
                  </>
                )}
              </p>
              <label className="block">
                <span className="label">{review.kind === 'approve' ? 'Reviewer comment (optional)' : 'Reason for rejection'}</span>
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={review.kind === 'approve' ? 'e.g. Evidence complete, scoring verified.' : 'e.g. Missing receipt evidence for section 3.'} />
              </label>
              {review.kind === 'approve' && review.visit.criticalCount > 0 && (
                <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  This visit recorded {review.visit.criticalCount} critical failure{review.visit.criticalCount === 1 ? '' : 's'}. Approval will keep the outlet at Critical risk until findings are closed.
                </p>
              )}
              {review.kind === 'approve' && review.visit.criticalCount === 0 && (
                <p className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> No critical failures recorded.
                </p>
              )}
            </div>
          )
        }
      />
    </div>
  )
}
