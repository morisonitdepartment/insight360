import { format } from 'date-fns'
import type {
  AnswerValue,
  AuditTemplate,
  CategoryKey,
  CorrectiveAction,
  Finding,
  KpiConfig,
  Outlet,
  Question,
  Scenario,
  Section,
  Shopper,
  Visit,
  VisitAnswer,
} from '@/types'
import { CATEGORY_KEYS, CATEGORY_LABELS } from '@/utils/scoring'
import { ReportDoc, loadClientMark, scoreTone, type BarItem, type CellTone, type PdfColumn } from '@/utils/pdf'
import { KPI_KIND_LABEL, formatKpiValue, stageRows, timingChainText, weightText } from '@/utils/sequence'
import { T } from '@/config/terms'

/**
 * The documents the programme issues.
 *
 * Each builder takes what the page already has on screen and lays it out for
 * paper. Nothing is recomputed here: a printed report that disagreed with the
 * screen it was exported from would be worse than no report at all.
 */

const pct = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${v.toFixed(1)}%`)
const day = (d: string | null | undefined) => (d ? format(new Date(d), 'd MMM yyyy') : '—')
const dayTime = (d: string | null | undefined) => (d ? format(new Date(d), 'd MMM yyyy, HH:mm') : '—')
const riskTone = (risk: string | null | undefined): CellTone =>
  risk === 'Excellent' || risk === 'Good' ? 'good' : risk === 'Needs Improvement' ? 'warn' : risk === 'Critical' ? 'bad' : 'muted'

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

// ─────────────────────────────── Visit report ───────────────────────────────

export interface VisitPdfInput {
  visit: Visit
  outlet: Outlet
  shopper?: Shopper
  scenario: Scenario | null
  template?: AuditTemplate
  sections: Section[]
  questions: Question[]
  answerMap: Map<string, VisitAnswer>
  askedIds: Set<string>
  kpiConfig: KpiConfig[]
  sectionScores: { sectionId: string; score: number | null }[]
  findings: Finding[]
  capas: CorrectiveAction[]
  summary: string
  reviewerName: string
  turnaround: number | null
}

export async function exportVisitReportPdf(i: VisitPdfInput): Promise<void> {
  const { visit, outlet, template } = i
  const doc = await ReportDoc.create()
  const mark = await loadClientMark()

  doc.cover({
    eyebrow: 'Mystery Shopping Visit Report',
    title: outlet.name,
    subtitle: `${outlet.brand} · ${outlet.subcategory} · ${outlet.location}, ${outlet.region}`,
    stat: { value: pct(visit.score), label: `${visit.risk ?? 'Not assessed'}`, tone: riskTone(visit.risk) },
    logo: mark,
  })

  doc.meta(
    [
      { label: 'Visit number', value: visit.code },
      { label: 'Visit type', value: visit.type },
      { label: 'Journey', value: visit.journey },
      { label: 'Visit date', value: day(visit.visitDate) },
      { label: 'Mystery shopper', value: i.shopper?.code ?? '—' },
      { label: 'Shopper profile', value: i.shopper?.profileType ?? '—' },
      { label: 'Review status', value: visit.status },
      { label: 'Reviewer', value: i.reviewerName },
    ],
    4,
  )
  if (i.scenario) {
    doc.meta([{ label: 'Scenario', value: `${i.scenario.code} · ${i.scenario.name}` }], 1)
  }

  doc.heading('Reporting SLA')
  doc.tiles(
    [
      { label: 'Visit completed', value: dayTime(visit.visitEnd) },
      { label: 'Submission due', value: dayTime(visit.submissionDeadline) },
      { label: 'Submitted', value: dayTime(visit.submittedAt), note: i.turnaround !== null ? `${i.turnaround}h turnaround` : undefined },
      {
        label: 'Reporting SLA',
        value: visit.slaStatus,
        tone: visit.slaStatus === 'Breached' ? 'bad' : visit.slaStatus === 'At Risk' ? 'warn' : 'good',
      },
    ],
    4,
  )

  doc.heading('Executive summary')
  doc.paragraph(i.summary)

  // ── Service sequence, when the template is one ──
  const stages = template?.sequence ? stageRows(i.sections, i.questions, visit.stageScores ?? undefined) : []
  if (template?.sequence && stages.length) {
    const seq = template.sequence
    doc.heading('Service sequence')
    doc.paragraph(
      `${seq.industry} · ${seq.serviceModel} · ${seq.visitMode}. Each stage carries a fixed share of the visit score; the contributions below sum to the score on the cover.`,
      { size: 8 },
    )
    const stageCols: PdfColumn<(typeof stages)[number]>[] = [
      { header: '#', width: 0.4, align: 'center', render: (r) => String(stages.indexOf(r) + 1) },
      { header: 'Stage', width: 3, strong: true, render: (r) => r.section.title },
      { header: 'KPI', width: 3, render: (r) => r.section.kpiName ?? '—' },
      { header: 'Weight', width: 1, align: 'right', render: (r) => (r.weight === 0 ? '—' : `${weightText(r.weight)}%`) },
      { header: 'Score', width: 1, align: 'right', render: (r) => pct(r.score), tone: (r) => scoreTone(r.score) },
      { header: 'Contribution', width: 1.4, align: 'right', render: (r) => (r.contribution === null ? '—' : `${r.contribution.toFixed(1)} pts`) },
    ]
    doc.table(stageCols, stages, {
      footer: ['', 'Visit score', '', `${stages.reduce((n, r) => n + (r.score === null ? 0 : r.weight), 0)}%`, '', `${(visit.score ?? 0).toFixed(1)} pts`],
    })

    const kpiScores = visit.kpiScores ?? null
    doc.heading('Main KPIs')
    doc.tiles(
      seq.mainKpis.map((k) => ({
        label: k.label,
        value: formatKpiValue(k, kpiScores?.[k.key], 'visit'),
        note: KPI_KIND_LABEL[k.kind],
        tone: k.kind === 'weighted' || k.kind === 'derived' ? scoreTone(kpiScores?.[k.key] ?? null) : 'default',
      })),
      4,
    )
    const chain = timingChainText(seq.timingChain, kpiScores)
    if (chain) doc.paragraph(`Timing chain · ${chain}`, { size: 8 })
  }

  // ── Category scores ──
  doc.heading('KPI category scores')
  const catBars: BarItem[] = CATEGORY_KEYS.map((k) => {
    const v = visit.categoryScores?.[k]
    const weight = i.kpiConfig.find((c) => c.key === k)?.weight ?? 0
    return { label: CATEGORY_LABELS[k], value: v === undefined || Number.isNaN(v) ? null : v, note: `weight ${weight}%` }
  })
  doc.bars(catBars, { columns: 2 })

  // ── Critical findings ──
  const criticals = i.questions
    .filter((q) => q.critical && i.askedIds.has(q.id))
    .map((q) => ({ q, a: i.answerMap.get(q.id) }))
    .filter((r) => r.a && !r.a.na && r.a.score !== null && r.a.score < 0.5)
  if (criticals.length) {
    doc.heading('Critical findings')
    doc.callout(
      `${criticals.length} critical standard${criticals.length === 1 ? '' : 's'} failed — immediate escalation`,
      criticals.map((r) => `${r.q.code} · ${r.q.text.replace(/\?$/, '')}. ${r.a?.comment || 'Critical standard failed.'}`),
      'bad',
    )
  }
  if (template?.sequence?.criticalFailures.length) {
    doc.heading('Critical failure checklist')
    doc.bullets(template.sequence.criticalFailures, 'muted', '–')
    doc.paragraph(
      criticals.length
        ? `Failed on this visit: ${criticals.map((r) => `${r.q.code} ${r.q.text.replace(/\?$/, '')}`).join('; ')}.`
        : 'No critical failure was observed on this visit.',
      { size: 8, tone: criticals.length ? 'bad' : 'good' },
    )
  }

  // ── Positives and improvements ──
  const assessed = i.questions
    .filter((q) => i.askedIds.has(q.id) && q.weight > 0)
    .map((q) => ({ q, a: i.answerMap.get(q.id) }))
    .filter((r) => r.a && !r.a.na && r.a.score !== null)
  const positives = assessed.filter((r) => (r.a!.score ?? 0) >= 0.9).sort((x, y) => y.q.weight - x.q.weight).slice(0, 6)
  const improvements = assessed.filter((r) => (r.a!.score ?? 0) < 0.5 && !r.q.critical).sort((x, y) => y.q.weight - x.q.weight).slice(0, 8)

  doc.heading('Positive observations')
  doc.bullets(positives.map((r) => `${r.q.text.replace(/\?$/, '')}${r.a?.comment ? ` — ${r.a.comment}` : ''}`), 'good')

  doc.heading('Areas for improvement')
  doc.bullets(
    improvements.map((r) => `${r.q.text.replace(/\?$/, '')} (${answerText(r.q, r.a!.value, r.a!.na)})${r.a?.comment ? ` — ${r.a.comment}` : ''}`),
    'warn',
  )

  // ── Detailed questionnaire ──
  doc.heading('Detailed questionnaire results')
  interface QRow {
    q: Question
    a?: VisitAnswer
    skipped: boolean
  }
  const qCols: PdfColumn<QRow>[] = [
    { header: 'Code', width: 0.8, render: (r) => r.q.code },
    { header: 'Question', width: 5.2, render: (r) => `${r.q.text}${r.q.critical ? '  [CRITICAL]' : ''}` },
    {
      header: 'Answer',
      width: 1.4,
      render: (r) => (r.skipped ? 'Skipped' : r.a ? answerText(r.q, r.a.value, r.a.na) : '—'),
      tone: (r) => (r.skipped ? 'muted' : r.a?.score === null || r.a?.score === undefined ? 'muted' : r.a.score < 0.5 ? 'bad' : r.a.score === 1 ? 'good' : 'default'),
      strong: true,
    },
    {
      header: 'Score',
      width: 0.8,
      align: 'right',
      render: (r) => (r.skipped || r.a?.score === null || r.a?.score === undefined ? '—' : `${Math.round(r.a.score * 100)}%`),
    },
    { header: 'Wt', width: 0.5, align: 'right', render: (r) => String(r.q.weight) },
  ]

  for (const s of i.sections) {
    const sectionQs = i.questions.filter((q) => q.sectionId === s.id)
    if (!sectionQs.length) continue
    const ss = i.sectionScores.find((x) => x.sectionId === s.id)
    const stageNote = s.stageWeight !== undefined ? (s.stageWeight === 0 ? ' · unweighted' : ` · weight ${s.stageWeight}%`) : ''
    doc.heading(`${s.stageWeight !== undefined ? 'Stage' : 'Section'} ${s.stageWeight !== undefined ? s.order : s.code} · ${s.title}  —  ${pct(ss?.score ?? null)}`)
    doc.paragraph(`${CATEGORY_LABELS[s.category]}${stageNote}. ${s.description}`, { size: 7.6 })
    doc.table(
      qCols,
      sectionQs.map((q) => ({ q, a: i.answerMap.get(q.id), skipped: !i.askedIds.has(q.id) })),
    )
  }

  // ── Narrative and follow-up ──
  if (visit.narrative) {
    doc.heading('Shopper narrative')
    doc.quote(visit.narrative)
    doc.paragraph(
      `Shopper ${i.shopper?.name ?? '—'} · ${i.shopper?.profileType ?? ''} profile · party of ${visit.partySize}${visit.spend ? ` · spend QAR ${visit.spend}` : ''}`,
      { size: 7.6 },
    )
  }

  if (i.findings.length) {
    doc.heading(`Findings raised (${i.findings.length})`)
    const fCols: PdfColumn<Finding>[] = [
      { header: 'Code', width: 1, render: (f) => f.code },
      { header: 'Finding', width: 4.6, strong: true, render: (f) => f.title },
      { header: 'Category', width: 1.8, render: (f) => CATEGORY_LABELS[f.category] },
      { header: 'Severity', width: 1, render: (f) => f.severity, tone: (f) => (f.severity === 'Critical' ? 'bad' : f.severity === 'High' ? 'warn' : 'default') },
      { header: 'Status', width: 1.1, render: (f) => f.status },
    ]
    doc.table(fCols, i.findings)
  }

  if (i.capas.length) {
    doc.heading(`Corrective actions (${i.capas.length})`)
    const cCols: PdfColumn<CorrectiveAction>[] = [
      { header: 'Code', width: 1, render: (c) => c.code },
      { header: 'Action', width: 4, strong: true, render: (c) => c.title },
      { header: 'Owner', width: 1.6, render: (c) => c.ownerName },
      { header: 'Target', width: 1.1, align: 'right', render: (c) => day(c.targetDate) },
      { header: 'Status', width: 1.3, render: (c) => c.status, tone: (c) => (c.status === 'Overdue' ? 'bad' : c.status === 'Closed' ? 'good' : 'default') },
    ]
    doc.table(cCols, i.capas)
  }

  doc.save(`${visit.code}-visit-report.pdf`)
}

// ─────────────────────────────── Outlet report ──────────────────────────────

export interface OutletPdfInput {
  outlet: Outlet
  history: Visit[]
  findings: Finding[]
  actions: CorrectiveAction[]
  kpiConfig: KpiConfig[]
  template?: AuditTemplate
  sections: Section[]
  questions: Question[]
  latestCompleted?: Visit
  rankOf: number
  percentile: number | null
}

export async function exportOutletReportPdf(i: OutletPdfInput): Promise<void> {
  const { outlet } = i
  const doc = await ReportDoc.create()
  const mark = await loadClientMark()

  doc.cover({
    eyebrow: `${T.Outlet} performance report`,
    title: outlet.name,
    subtitle: `${outlet.code} · ${outlet.brand} · ${outlet.location}, ${outlet.region} · Manager ${outlet.manager}`,
    stat: { value: pct(outlet.overallScore), label: outlet.riskRating, tone: riskTone(outlet.riskRating) },
    logo: mark,
  })

  const completed = i.history.filter((v) => v.status === 'Approved' || v.status === 'Closed').length
  const delta = outlet.overallScore !== null && outlet.previousScore !== null ? outlet.overallScore - outlet.previousScore : null
  doc.tiles(
    [
      { label: 'Current score', value: pct(outlet.overallScore), note: outlet.riskRating, tone: scoreTone(outlet.overallScore) },
      { label: 'Previous score', value: pct(outlet.previousScore), note: delta !== null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pts` : undefined },
      { label: 'Target score', value: `${outlet.targetScore}%`, note: outlet.overallScore !== null ? `${(outlet.overallScore - outlet.targetScore).toFixed(1)} pts vs target` : undefined },
      { label: 'Rank', value: outlet.rank ? `#${outlet.rank}` : '—', note: `of ${i.rankOf}${i.percentile !== null ? ` · P${i.percentile}` : ''}` },
      { label: 'Visits completed', value: `${completed} / ${outlet.annualVisits}`, note: 'this programme year' },
      { label: 'Open issues', value: String(outlet.openIssues), note: `${outlet.criticalFindings} critical`, tone: outlet.criticalFindings ? 'bad' : 'default' },
      { label: 'Last audit', value: day(outlet.lastAudit) },
      { label: 'Next audit', value: day(outlet.nextAudit) },
    ],
    4,
  )

  doc.heading('KPI category scores')
  doc.bars(
    CATEGORY_KEYS.map((k) => {
      const v = outlet.categoryScores?.[k]
      const target = i.kpiConfig.find((c) => c.key === k)?.target ?? 90
      return { label: CATEGORY_LABELS[k], value: v === undefined || Number.isNaN(v) ? null : v, note: `target ${target}%` }
    }),
    { columns: 2 },
  )

  if (i.template?.sequence && i.latestCompleted) {
    const stages = stageRows(i.sections, i.questions, i.latestCompleted.stageScores ?? undefined)
    if (stages.length) {
      doc.heading('Service sequence — stage scores')
      doc.paragraph(
        `${i.template.sequence.serviceModel} · ${i.template.sequence.visitMode}. From ${i.latestCompleted.type} on ${day(i.latestCompleted.visitDate)}.`,
        { size: 8 },
      )
      doc.bars(
        stages.map((r) => ({ label: r.section.title, value: r.score, note: r.weight === 0 ? 'unweighted' : `${weightText(r.weight)}%` })),
        { columns: 2 },
      )
    }
  }

  doc.heading('Audit history')
  const hCols: PdfColumn<Visit>[] = [
    { header: 'Visit', width: 1.3, render: (v) => v.code },
    { header: 'Type', width: 1.6, strong: true, render: (v) => v.type },
    { header: 'Date', width: 1.3, render: (v) => day(v.visitDate) },
    { header: 'Status', width: 1.3, render: (v) => v.status },
    { header: 'Score', width: 1, align: 'right', render: (v) => pct(v.score), tone: (v) => scoreTone(v.score) },
    { header: 'Risk', width: 1.4, render: (v) => v.risk ?? '—', tone: (v) => riskTone(v.risk) },
    { header: 'Critical', width: 0.9, align: 'right', render: (v) => String(v.criticalCount) },
  ]
  doc.table(hCols, i.history)

  const open = i.findings.filter((f) => f.status === 'Open' || f.status === 'In Progress')
  doc.heading(`Open findings (${open.length})`)
  if (open.length) {
    const fCols: PdfColumn<Finding>[] = [
      { header: 'Code', width: 1, render: (f) => f.code },
      { header: 'Finding', width: 4.4, strong: true, render: (f) => f.title },
      { header: 'Severity', width: 1, render: (f) => f.severity, tone: (f) => (f.severity === 'Critical' ? 'bad' : f.severity === 'High' ? 'warn' : 'default') },
      { header: 'Raised', width: 1.2, render: (f) => day(f.createdAt) },
      { header: 'Status', width: 1.2, render: (f) => f.status },
    ]
    doc.table(fCols, open)
  } else {
    doc.paragraph('No open findings at this site.', { size: 8, tone: 'good' })
  }

  const openActions = i.actions.filter((a) => a.status !== 'Closed')
  if (openActions.length) {
    doc.heading(`Corrective actions in progress (${openActions.length})`)
    const cCols: PdfColumn<CorrectiveAction>[] = [
      { header: 'Code', width: 1, render: (c) => c.code },
      { header: 'Action', width: 3.8, strong: true, render: (c) => c.title },
      { header: 'Owner', width: 1.6, render: (c) => c.ownerName },
      { header: 'Target', width: 1.1, align: 'right', render: (c) => day(c.targetDate) },
      { header: 'Status', width: 1.3, render: (c) => c.status, tone: (c) => (c.status === 'Overdue' ? 'bad' : 'default') },
    ]
    doc.table(cCols, openActions)
  }

  doc.save(`${outlet.code}-${T.outlet}-report.pdf`)
}

// ──────────────────────────────── Comparison ────────────────────────────────

export interface ComparePdfInput {
  outlets: Outlet[]
  metrics: { label: string; values: (string | number)[] }[]
  kpiConfig: KpiConfig[]
}

export async function exportComparePdf(i: ComparePdfInput): Promise<void> {
  const doc = await ReportDoc.create()
  const mark = await loadClientMark()

  doc.cover({
    eyebrow: `${T.Outlet} comparison`,
    title: i.outlets.map((o) => o.name).join('  ·  '),
    subtitle: `Side-by-side comparison of ${i.outlets.length} ${T.outlets} across all KPI categories, issues and SLA`,
    logo: mark,
  })

  doc.heading('Overall standing')
  doc.tiles(
    i.outlets.map((o) => ({ label: o.name, value: pct(o.overallScore), note: `${o.riskRating}${o.rank ? ` · rank #${o.rank}` : ''}`, tone: scoreTone(o.overallScore) })),
    Math.min(4, Math.max(2, i.outlets.length)) as 2 | 3 | 4,
  )

  doc.heading('KPI category comparison')
  interface CatRow {
    key: CategoryKey
  }
  const catCols: PdfColumn<CatRow>[] = [
    { header: 'KPI category', width: 2.4, strong: true, render: (r) => CATEGORY_LABELS[r.key] },
    ...i.outlets.map(
      (o): PdfColumn<CatRow> => ({
        header: o.name,
        width: 1.6,
        align: 'right',
        render: (r) => {
          const v = o.categoryScores?.[r.key]
          return v === undefined || Number.isNaN(v) ? '—' : `${v.toFixed(1)}%`
        },
        tone: (r) => {
          const v = o.categoryScores?.[r.key]
          return scoreTone(v === undefined || Number.isNaN(v) ? null : v)
        },
      }),
    ),
  ]
  doc.table(catCols, CATEGORY_KEYS.map((key) => ({ key })))

  doc.heading('Performance metrics')
  interface MRow {
    label: string
    values: (string | number)[]
  }
  const mCols: PdfColumn<MRow>[] = [
    { header: 'Metric', width: 2.4, strong: true, render: (r) => r.label },
    ...i.outlets.map((o, idx): PdfColumn<MRow> => ({ header: o.name, width: 1.6, align: 'right', render: (r) => String(r.values[idx] ?? '—') })),
  ]
  doc.table(mCols, i.metrics)

  doc.save(`${T.outlet}-comparison.pdf`)
}

// ────────────────────────── Management / built report ───────────────────────

export interface SummaryPdfInput {
  eyebrow: string
  title: string
  subtitle?: string
  meta: { label: string; value: string }[]
  summary: string
  outlets?: Outlet[]
  sections?: { heading: string; body?: string; bullets?: string[] }[]
  filename: string
}

export async function exportSummaryPdf(i: SummaryPdfInput): Promise<void> {
  const doc = await ReportDoc.create()
  const mark = await loadClientMark()

  doc.cover({ eyebrow: i.eyebrow, title: i.title, subtitle: i.subtitle, logo: mark })
  if (i.meta.length) doc.meta(i.meta, 4)

  doc.heading('Summary')
  doc.paragraph(i.summary)

  for (const s of i.sections ?? []) {
    doc.heading(s.heading)
    if (s.body) doc.paragraph(s.body)
    if (s.bullets?.length) doc.bullets(s.bullets)
  }

  if (i.outlets?.length) {
    doc.heading(`${T.Outlets} in scope (${i.outlets.length})`)
    const cols: PdfColumn<Outlet>[] = [
      { header: 'Code', width: 1, render: (o) => o.code },
      { header: T.Outlet, width: 3.4, strong: true, render: (o) => o.name },
      { header: 'Region', width: 1.6, render: (o) => o.region },
      { header: 'Score', width: 1, align: 'right', render: (o) => pct(o.overallScore), tone: (o) => scoreTone(o.overallScore) },
      { header: 'Risk', width: 1.5, render: (o) => o.riskRating, tone: (o) => riskTone(o.riskRating) },
      { header: 'Open', width: 0.8, align: 'right', render: (o) => String(o.openIssues) },
    ]
    doc.table(cols, i.outlets)
  }

  doc.save(i.filename)
}
