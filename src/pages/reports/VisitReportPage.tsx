import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AlertOctagon, AlertTriangle, Camera, CheckCircle2, Download, FileSpreadsheet, Lightbulb, Printer, Target, ThumbsDown, ThumbsUp, XCircle } from 'lucide-react'
import { useData } from '@/contexts/DataContext'
import { useAuth } from '@/contexts/AuthContext'
import { useDocumentTitle } from '@/hooks'
import { Badge, RiskBadge, ScoreBadge, SegmentBadge, SeverityBadge, StatusBadge, scoreTextClass } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Form'
import { ProgressBar, Timeline } from '@/components/ui/Misc'
import { EmptyState } from '@/components/ui/States'
import { EvidenceCard, EvidencePreviewModal } from '@/components/ui/EvidenceThumb'
import { RadarCompareChart } from '@/components/charts'
import { ClientLogo } from '@/components/ui/ClientLogo'
import { CLIENT_BRAND } from '@/config/client'
import { approveVisit, getVisitQuestions, getVisitSections, logExport, rejectVisit, startReview } from '@/services/actions'
import { CATEGORY_KEYS, CATEGORY_LABELS, CATEGORY_SHORT, computeVisitScores } from '@/utils/scoring'
import { exportCsv, exportElementToPdf, printPage } from '@/utils/export'
import { fmtDate, fmtDateTime, fmtPct, hoursBetween } from '@/utils/format'
import type { AnswerValue, Evidence, Question } from '@/types'
import { cn } from '@/utils/cn'

function answerText(q: Question, v: AnswerValue, na: boolean): string {
  if (na) return 'N/A'
  if (v === null || v === undefined || v === '') return '—'
  if (q.type === 'yes_no') return v === true ? 'Yes' : 'No'
  if (q.type === 'pass_fail') return v === true ? 'Pass' : 'Fail'
  if (q.type === 'time') return `${v} min`
  if (q.type === 'rating_5') return `${v} / 5`
  if (q.type === 'rating_10') return `${v} / 10`
  return String(v)
}

const RECOMMENDATIONS: Record<string, string> = {
  service_speed: 'Re-balance the shift roster against footfall and introduce a 15-minute kitchen-to-table service standard with visible timers.',
  product_environment: 'Enforce hourly cleaning checks with supervisor sign-off; add washroom inspection to the duty manager walk.',
  upselling_sales: 'Refresh suggestive-selling training with role-play; add a daily upsell target to the shift briefing.',
  customer_experience: 'Reinforce the 30-second acknowledgement standard and greeting script during pre-shift briefings.',
  operational_compliance: 'Audit billing and order-accuracy controls; re-issue the SOP and verify with weekly self-audits.',
  safety_entertainment: 'Immediate re-training on the safety / food-hygiene SOP; escalate equipment or cold-chain faults within 30 minutes.',
}

export default function VisitReportPage() {
  const { id } = useParams()
  const { data, scopedVisits, dispatch } = useData()
  const { can, role } = useAuth()
  const navigate = useNavigate()
  const printRef = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<Evidence | null>(null)
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  const visit = useMemo(() => data.visits.find((v) => v.id === id), [data.visits, id])
  const allowed = useMemo(() => scopedVisits.some((v) => v.id === id), [scopedVisits, id])
  const outlet = useMemo(() => data.outlets.find((o) => o.id === visit?.outletId), [data.outlets, visit])
  const shopper = useMemo(() => data.shoppers.find((s) => s.id === visit?.shopperId), [data.shoppers, visit])
  const scenario = useMemo(() => (visit?.scenarioId ? data.scenarios.find((s) => s.id === visit.scenarioId) ?? null : null), [data.scenarios, visit])
  useDocumentTitle(visit ? `Report ${visit.code}` : 'Visit report')

  const sections = useMemo(() => (visit ? getVisitSections(data, visit) : []), [data, visit])
  const questions = useMemo(() => (visit ? getVisitQuestions(data, visit) : []), [data, visit])
  const answers = useMemo(() => data.answers.filter((a) => a.visitId === id), [data.answers, id])
  const answerMap = useMemo(() => new Map(answers.map((a) => [a.questionId, a])), [answers])
  const result = useMemo(() => computeVisitScores(questions, sections, answers, data.kpiConfig, data.thresholds), [questions, sections, answers, data.kpiConfig, data.thresholds])
  const evidence = useMemo(() => data.evidence.filter((e) => e.visitId === id), [data.evidence, id])
  const findings = useMemo(() => data.findings.filter((f) => f.visitId === id), [data.findings, id])
  const capas = useMemo(() => data.correctiveActions.filter((c) => findings.some((f) => f.id === c.findingId)), [data.correctiveActions, findings])
  const comments = useMemo(() => data.comments.filter((c) => c.entityType === 'visit' && c.entityId === id), [data.comments, id])

  useEffect(() => {
    if (window.location.hash === '#evidence') {
      const t = setTimeout(() => document.getElementById('evidence')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350)
      return () => clearTimeout(t)
    }
  }, [id])

  if (!visit || !outlet || !allowed) return <EmptyState title="Report not available" message="This visit does not exist or is outside your authorised scope." action={<Link to="/reports/visits" className="btn-secondary">Back to visit reports</Link>} />
  if (visit.score === null) return <EmptyState title="Report not yet available" message={`Visit ${visit.code} is ${visit.status.toLowerCase()} — the report is generated once the assessment is submitted.`} action={<Link to={`/operations/visits/${visit.id}`} className="btn-secondary">Open visit</Link>} />

  const rows = questions.map((q) => ({ q, a: answerMap.get(q.id), section: sections.find((s) => s.id === q.sectionId)! }))
  const positives = rows.filter((r) => r.a && !r.a.na && r.a.score !== null && r.a.score >= 0.9).sort((x, y) => y.q.weight - x.q.weight).slice(0, 6)
  const improvements = rows.filter((r) => r.a && !r.a.na && r.a.score !== null && r.a.score < 0.5 && !r.q.critical).sort((x, y) => y.q.weight - x.q.weight).slice(0, 8)
  const criticals = rows.filter((r) => r.a && !r.a.na && r.a.score !== null && r.a.score < 0.5 && r.q.critical)
  const weakCats = CATEGORY_KEYS.filter((k) => visit.categoryScores && !Number.isNaN(visit.categoryScores[k]) && visit.categoryScores[k] < 80).sort((a, b) => (visit.categoryScores![a] ?? 0) - (visit.categoryScores![b] ?? 0))
  const canDecide = can('visits.review') && (visit.status === 'Submitted' || visit.status === 'Under Review')
  const turnaround = hoursBetween(visit.visitEnd, visit.submittedAt)
  const radar = CATEGORY_KEYS.map((k) => ({ category: CATEGORY_SHORT[k], Visit: visit.categoryScores?.[k] ?? 0, Target: data.kpiConfig.find((c) => c.key === k)?.target ?? 90 }))

  const summary = `${outlet.name} was assessed on ${fmtDate(visit.visitDate)} as part of ${visit.type} (${visit.journey.toLowerCase()} scenario). The visit scored ${fmtPct(visit.score)}, rated ${visit.risk ?? 'n/a'}${outlet.targetScore ? `, against a target of ${outlet.targetScore}%` : ''}. ${criticals.length ? `${criticals.length} critical standard${criticals.length === 1 ? ' was' : 's were'} failed, triggering immediate escalation. ` : 'No critical standards were failed. '}${weakCats.length ? `The weakest areas were ${weakCats.map((k) => `${CATEGORY_LABELS[k].toLowerCase()} (${fmtPct(visit.categoryScores?.[k])})`).join(', ')}.` : 'All categories met or exceeded the 80% good-practice threshold.'}`

  const doDecision = async () => {
    if (!decision) return
    setBusy(true)
    try {
      if (visit.status === 'Submitted') await dispatch((d, ctx) => startReview(d, ctx, visit.id))
      if (decision === 'approve') {
        await dispatch((d, ctx) => approveVisit(d, ctx, visit.id, comment))
        toast.success(`Report ${visit.code} approved`)
      } else {
        if (comment.trim().length < 10) {
          toast.error('Please provide a reason for rejection')
          return
        }
        await dispatch((d, ctx) => rejectVisit(d, ctx, visit.id, comment))
        toast.success(`Report ${visit.code} returned to the shopper`)
      }
      setDecision(null)
      setComment('')
    } finally {
      setBusy(false)
    }
  }

  const exportPdf = async () => {
    if (!printRef.current) return
    const t = toast.loading('Rendering PDF…')
    try {
      await exportElementToPdf(printRef.current, `${visit.code}-visit-report.pdf`)
      await dispatch((d, ctx) => logExport(d, ctx, visit.code, 'PDF'))
      toast.success('PDF downloaded', { id: t })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF export failed', { id: t })
    }
  }
  const exportData = () => {
    exportCsv(
      rows.map((r) => ({ Section: `${r.section.code} ${r.section.title}`, Category: CATEGORY_LABELS[r.section.category], Code: r.q.code, Question: r.q.text, Type: r.q.type, Weight: r.q.weight, Critical: r.q.critical ? 'Yes' : 'No', Answer: r.a ? answerText(r.q, r.a.value, r.a.na) : '—', Score: r.a?.score === null || r.a?.score === undefined ? '' : Math.round(r.a.score * 100), Comment: r.a?.comment ?? '', Evidence: r.a?.evidenceIds.length ?? 0 })),
      `${visit.code}-questionnaire.csv`,
    )
    void dispatch((d, ctx) => logExport(d, ctx, visit.code, 'CSV'))
    toast.success('Questionnaire exported')
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link to="/reports/visits" className="link">Visit reports</Link> <span>/</span> <span className="font-mono">{visit.code}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={() => void exportPdf()}><Download className="h-3.5 w-3.5" /> Download PDF</button>
          <button type="button" className="btn-secondary btn-sm" onClick={printPage}><Printer className="h-3.5 w-3.5" /> Print</button>
          {can('reports.export') && <button type="button" className="btn-secondary btn-sm" onClick={exportData}><FileSpreadsheet className="h-3.5 w-3.5" /> Export</button>}
          {canDecide && (
            <>
              <button type="button" className="btn-accent btn-sm" onClick={() => setDecision('approve')}><ThumbsUp className="h-3.5 w-3.5" /> Approve Report</button>
              <button type="button" className="btn-danger btn-sm" onClick={() => setDecision('reject')}><ThumbsDown className="h-3.5 w-3.5" /> Reject Report</button>
            </>
          )}
          {role === 'shopper' && (visit.status === 'Rejected' || visit.status === 'Draft') && <button type="button" className="btn-primary btn-sm" onClick={() => navigate(`/operations/visits/${visit.id}/audit`)}>Edit assessment</button>}
        </div>
      </div>

      <div ref={printRef} className="print-area card overflow-hidden">
        {/* Report header */}
        <header className="bg-navy-900 text-white px-6 py-6 sm:px-8">
          <div className="mb-5 flex items-center justify-between gap-4 border-b border-white/10 pb-4">
            <ClientLogo size="sm" />
            <span className="text-right text-[10px] uppercase tracking-[0.18em] text-navy-300">
              {CLIENT_BRAND.name}
              <span className="block normal-case tracking-normal text-navy-400">Assessed by INSIGHT360</span>
            </span>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-300">Mystery Shopping Visit Report</p>
              <h1 className="mt-1 text-2xl font-semibold text-white">{outlet.name}</h1>
              <p className="mt-1 text-sm text-navy-200">{outlet.brand} · <SegmentBadge segment={outlet.segment} size="xs" /> {outlet.subcategory} · {outlet.location}, {outlet.region}</p>
            </div>
            <div className="text-right">
              <p className={cn('text-4xl font-bold tabular-nums leading-none', (visit.score ?? 0) < 70 ? 'text-red-300' : (visit.score ?? 0) < 80 ? 'text-amber-300' : 'text-teal-300')}>{visit.score.toFixed(1)}%</p>
              <p className="mt-1 text-xs text-navy-200">Overall score</p>
              <div className="mt-2 flex justify-end"><RiskBadge risk={visit.risk} /></div>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-xs sm:grid-cols-3 lg:grid-cols-5">
            {[
              ['Visit number', visit.code],
              ['Visit type', visit.type],
              ['Journey', visit.journey],
              ['Visit date', `${fmtDate(visit.visitDate)} ${visit.visitStart ? fmtDateTime(visit.visitStart).slice(-5) : ''}`],
              ['Mystery shopper ID', shopper?.code ?? '—'],
              ['Profile', shopper?.profileType ?? '—'],
              ['Review status', visit.status],
              ['Reviewer', data.users.find((u) => u.id === visit.reviewerId)?.name ?? 'Pending'],
              ['Scenario', scenario ? `${scenario.code} · ${scenario.name}` : '—', 'col-span-2'],
            ].map(([k, v, span]) => (
              <div key={k} className={span}>
                <dt className="text-navy-300 uppercase tracking-wider text-[10px]">{k}</dt>
                <dd className="mt-0.5 font-medium text-white">{v}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="px-6 py-6 sm:px-8 space-y-8">
          {/* SLA strip */}
          <section className="grid gap-3 rounded-xl border border-slate-200 dark:border-navy-800 bg-slate-50 dark:bg-navy-800/40 p-4 text-xs sm:grid-cols-4">
            <div><p className="text-slate-500">Visit completed</p><p className="font-semibold text-slate-800 dark:text-slate-100">{fmtDateTime(visit.visitEnd)}</p></div>
            <div><p className="text-slate-500">Submission due</p><p className="font-semibold text-slate-800 dark:text-slate-100">{fmtDateTime(visit.submissionDeadline)}</p></div>
            <div><p className="text-slate-500">Submitted</p><p className="font-semibold text-slate-800 dark:text-slate-100">{fmtDateTime(visit.submittedAt)}{turnaround !== null && <span className="ml-1 font-normal text-slate-500">({turnaround}h)</span>}</p></div>
            <div><p className="text-slate-500">Reporting SLA</p><StatusBadge status={visit.slaStatus} /></div>
          </section>

          {/* Executive summary */}
          <section>
            <h2 className="section-title mb-2">Executive summary</h2>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{summary}</p>
          </section>

          {/* Category scores */}
          <section className="grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="section-title mb-3">Category scores</h2>
              <div className="space-y-3">
                {CATEGORY_KEYS.map((k) => {
                  const v = visit.categoryScores?.[k]
                  const val = v === undefined || Number.isNaN(v) ? null : v
                  const weight = data.kpiConfig.find((c) => c.key === k)?.weight ?? 0
                  return (
                    <div key={k}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-slate-700 dark:text-slate-200">{CATEGORY_LABELS[k]} <span className="text-slate-400">· weight {weight}%</span></span>
                        <span className={cn('font-semibold tabular-nums', scoreTextClass(val))}>{fmtPct(val)}</span>
                      </div>
                      <ProgressBar value={val} size="sm" />
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="h-64">
              <RadarCompareChart data={radar} series={[{ key: 'Visit', label: 'This visit' }, { key: 'Target', label: 'Target', color: '#d97706' }]} />
            </div>
          </section>

          {/* Critical findings */}
          {criticals.length > 0 && (
            <section className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-red-800 dark:text-red-200"><AlertOctagon className="h-4 w-4" /> Critical findings ({criticals.length})</h2>
              <ul className="mt-2 space-y-2">
                {criticals.map((r) => (
                  <li key={r.q.id} className="text-sm text-red-900 dark:text-red-100">
                    <span className="font-medium">{r.q.code} · {r.q.text}</span>
                    <span className="block text-xs text-red-800/80 dark:text-red-200/80">{r.a?.comment || 'Critical standard failed.'}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Positives / improvements */}
          <section className="grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="section-title mb-2 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Positive observations</h2>
              <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-200">
                {positives.length === 0 && <li className="text-slate-500">No standout positives recorded.</li>}
                {positives.map((r) => (
                  <li key={r.q.id} className="flex gap-2"><span className="text-emerald-600">•</span><span>{r.q.text.replace(/\?$/, '')}{r.a?.comment ? <span className="block text-xs text-slate-500">{r.a.comment}</span> : null}</span></li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="section-title mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> Areas for improvement</h2>
              <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-200">
                {improvements.length === 0 && <li className="text-slate-500">No failed standards beyond critical items.</li>}
                {improvements.map((r) => (
                  <li key={r.q.id} className="flex gap-2"><span className="text-amber-600">•</span><span>{r.q.text.replace(/\?$/, '')} <span className="text-xs text-slate-500">({answerText(r.q, r.a!.value, r.a!.na)})</span>{r.a?.comment ? <span className="block text-xs text-slate-500">{r.a.comment}</span> : null}</span></li>
                ))}
              </ul>
            </div>
          </section>

          {/* Detailed results */}
          <section>
            <h2 className="section-title mb-3">Detailed questionnaire results</h2>
            <div className="space-y-4">
              {sections.map((s) => {
                const ss = result.sectionScores.find((x) => x.sectionId === s.id)
                const sr = rows.filter((r) => r.section.id === s.id)
                return (
                  <div key={s.id} className="rounded-xl border border-slate-200 dark:border-navy-800 overflow-hidden">
                    <div className="flex items-center justify-between bg-slate-50 dark:bg-navy-800/60 px-4 py-2">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Section {s.code} · {s.title} <span className="ml-1 text-xs font-normal text-slate-500">{CATEGORY_LABELS[s.category]}</span></p>
                      <ScoreBadge score={ss?.score ?? null} />
                    </div>
                    <div className="table-wrap">
                      <table className="table text-xs">
                        <thead>
                          <tr><th>Code</th><th>Question</th><th>Answer</th><th className="text-right">Score</th><th className="text-right">Weight</th><th>Comment</th><th className="text-right">Evidence</th></tr>
                        </thead>
                        <tbody>
                          {sr.map(({ q, a }) => {
                            const sc = a?.score ?? null
                            const failed = sc !== null && sc < 0.5
                            return (
                              <tr key={q.id} className={cn(failed && q.critical && 'bg-red-50/60 dark:bg-red-500/5')}>
                                <td className="font-mono">{q.code}</td>
                                <td className="max-w-[320px]">{q.text}{q.critical && <Badge tone="red" size="xs" className="ml-1">Critical</Badge>}</td>
                                <td className={cn('whitespace-nowrap font-medium', failed ? 'text-red-700 dark:text-red-300' : sc === 1 ? 'text-emerald-700 dark:text-emerald-300' : '')}>{a ? answerText(q, a.value, a.na) : '—'}</td>
                                <td className="text-right tabular-nums">{sc === null ? '—' : `${Math.round(sc * 100)}%`}</td>
                                <td className="text-right tabular-nums">{q.weight}</td>
                                <td className="max-w-[260px] text-slate-600 dark:text-slate-300">{a?.comment || ''}</td>
                                <td className="text-right">{a?.evidenceIds.length ? <span className="inline-flex items-center gap-1"><Camera className="h-3 w-3" />{a.evidenceIds.length}</span> : ''}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Evidence gallery */}
          <section id="evidence" data-tour="evidence-gallery">
            <h2 className="section-title mb-3">Evidence gallery ({evidence.length})</h2>
            {evidence.length === 0 ? (
              <p className="text-sm text-slate-500">No evidence attached.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {evidence.map((e) => (
                  <EvidenceCard key={e.id} evidence={e} onClick={() => setPreview(e)} meta={e.questionId ? questions.find((q) => q.id === e.questionId)?.code ?? e.type : e.type} />
                ))}
              </div>
            )}
          </section>

          {/* Narrative */}
          <section>
            <h2 className="section-title mb-2">Shopper narrative</h2>
            <blockquote className="rounded-xl border-l-4 border-teal-500 bg-slate-50 dark:bg-navy-800/40 p-4 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{visit.narrative ?? 'No narrative provided.'}</blockquote>
            <p className="mt-1 text-xs text-slate-500">Shopper {shopper?.name ?? '—'} · {shopper?.profileType ?? ''} profile · party of {visit.partySize} · spend QAR {visit.spend ?? '—'}</p>
            {scenario && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-navy-800 dark:bg-navy-800/40">
                <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  <Target className="h-4 w-4 text-teal-600 dark:text-teal-400" aria-hidden />
                  Scenario executed · {scenario.name}
                  <Badge tone="teal" size="xs">{scenario.type}</Badge>
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{scenario.description}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-slate-700 dark:text-slate-200">Expected outcome:</span> {scenario.expectedOutcome}
                </p>
              </div>
            )}
          </section>

          {/* Recommendations */}
          <section>
            <h2 className="section-title mb-2 flex items-center gap-2"><Lightbulb className="h-4 w-4 text-amber-500" /> Recommendations</h2>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-200">
              {criticals.length > 0 && <li>Treat the critical finding{criticals.length > 1 ? 's' : ''} as an immediate-action item: verify closure within 7 days and re-inspect at the next follow-up.</li>}
              {(weakCats.length ? weakCats : CATEGORY_KEYS.slice(0, 1)).slice(0, 4).map((k) => (
                <li key={k}><span className="font-medium">{CATEGORY_LABELS[k]}:</span> {RECOMMENDATIONS[k]}</li>
              ))}
              {weakCats.length === 0 && criticals.length === 0 && <li>Maintain standards; share this outlet's practices as a benchmark for the brand.</li>}
            </ol>
          </section>

          {/* Corrective actions */}
          <section>
            <h2 className="section-title mb-2">Corrective actions</h2>
            {capas.length === 0 ? (
              <p className="text-sm text-slate-500">No corrective actions linked to this visit{findings.length ? ` (${findings.length} findings raised)` : ''}.</p>
            ) : (
              <div className="table-wrap">
                <table className="table text-xs">
                  <thead><tr><th>Action</th><th>Title</th><th>Owner</th><th>Priority</th><th>Target</th><th>Status</th></tr></thead>
                  <tbody>
                    {capas.map((c) => (
                      <tr key={c.id}>
                        <td className="font-mono"><Link to={`/quality/corrective-actions?action=${c.id}`} className="link">{c.code}</Link></td>
                        <td>{c.title}</td>
                        <td>{c.ownerName}</td>
                        <td><SeverityBadge severity={c.priority} size="xs" /></td>
                        <td className="whitespace-nowrap">{fmtDate(c.targetDate)}</td>
                        <td><StatusBadge status={c.status} size="xs" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Reviewer comments + approval */}
          <section className="grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="section-title mb-2">Reviewer comments</h2>
              {visit.reviewerComment ? <p className="text-sm text-slate-700 dark:text-slate-200">“{visit.reviewerComment}”</p> : <p className="text-sm text-slate-500">Awaiting review.</p>}
              {comments.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {comments.map((c) => (
                    <li key={c.id} className="rounded-lg bg-slate-50 dark:bg-navy-800/50 p-3 text-xs">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{c.userName} <span className="font-normal text-slate-500">· {fmtDateTime(c.createdAt)}</span></p>
                      <p className="mt-1 text-slate-600 dark:text-slate-300">{c.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h2 className="section-title mb-2">Approval history</h2>
              <Timeline items={visit.approvalHistory.map((h) => ({ at: h.at, by: h.by, action: h.action, note: h.comment }))} />
            </div>
          </section>
          <p className="border-t border-slate-200 dark:border-navy-800 pt-3 text-[10px] text-slate-400">INSIGHT360 · {data.organization.name} · {data.organization.engagementName} · Confidential — generated {fmtDateTime(new Date())}. Scores derive from the weighted scoring model (question → section → category → visit).</p>
        </div>
      </div>

      <EvidencePreviewModal evidence={preview} onClose={() => setPreview(null)} context={{ outlet: outlet.name, visit: visit.code, question: preview?.questionId ? questions.find((q) => q.id === preview.questionId)?.text : undefined }} />

      <Modal
        open={decision !== null}
        onClose={() => setDecision(null)}
        title={decision === 'approve' ? 'Approve report' : 'Reject report'}
        description={decision === 'approve' ? `Approving publishes the score (${fmtPct(visit.score)}) to the outlet record and dashboards.` : 'The report will be returned to the shopper for revision.'}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDecision(null)} disabled={busy}>Cancel</button>
            <button type="button" className={decision === 'approve' ? 'btn-accent' : 'btn-danger'} onClick={() => void doDecision()} disabled={busy}>
              {decision === 'approve' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {busy ? 'Working…' : decision === 'approve' ? 'Approve' : 'Reject'}
            </button>
          </>
        }
      >
        <label className="label" htmlFor="review-comment">{decision === 'approve' ? 'Reviewer comment (optional)' : 'Reason for rejection'}</label>
        <Textarea id="review-comment" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={decision === 'approve' ? 'e.g. Evidence verified; scores validated.' : 'e.g. Timing evidence missing for section B.'} />
      </Modal>
    </div>
  )
}
