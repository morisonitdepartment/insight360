import { format } from 'date-fns'
import type {
  AnswerValue,
  AuditTemplate,
  CategoryKey,
  CorrectiveAction,
  Evidence,
  Finding,
  KpiConfig,
  Outlet,
  Question,
  Scenario,
  ScoreThreshold,
  Section,
  Shopper,
  Visit,
  VisitAnswer,
} from '@/types'
import { CATEGORY_KEYS, CATEGORY_LABELS, DEFAULT_THRESHOLDS } from '@/utils/scoring'
import { ReportDoc, bandColor, loadClientMark, scoreTone, type CellTone, type PdfColumn } from '@/utils/pdf'
import { CLIENT } from '@/config/client'
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
/** Types whose answer carries information the score alone does not. */
const ANSWER_WORTH_SHOWING = new Set<Question['type']>(['time', 'numeric', 'rating_5', 'rating_10', 'multiple_choice'])
/** A question read as a statement: the trailing question mark earns nothing in a bullet. */
const strip = (text: string) => text.replace(/\?$/, '')
const clock = (d: string | null | undefined) => (d ? format(new Date(d), 'HH:mm') : '—')
/** `  ·  70–79%` — the band a rating covers, for the cover pill. */
const bandRange = (label: string, bands: ScoreThreshold[]) => {
  const b = bands.find((x) => x.label === label)
  return b ? `  ·  ${b.min === 0 ? `below ${Math.ceil(b.max)}` : `${b.min}–${Math.ceil(b.max)}`}%` : ''
}

/**
 * The closing page every document shares: who ran the programme and how to
 * reach them. Drawn from the client profile, so a second client's reports carry
 * their own details rather than the first one's.
 */
function backCover(doc: ReportDoc) {
  doc.backCover({
    lead: 'Get in',
    title: 'Touch',
    blocks: [
      [CLIENT.brand.name, CLIENT.org.engagementName],
      [`Programme period ${format(new Date(CLIENT.org.engagementStart), 'MMM yyyy')} – ${format(new Date(CLIENT.org.engagementEnd), 'MMM yyyy')}`, `${CLIENT.org.timezone} · reporting in ${CLIENT.org.currency}`],
      ['Issued by INSIGHT360 · Mystery Shopping Intelligence Platform', 'This report is confidential and intended for the named client only.'],
    ],
  })
}
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
  /** The client's configured rating bands; the gauge and the legend are drawn from them. */
  thresholds?: ScoreThreshold[]
  evidence?: Evidence[]
}

export async function exportVisitReportPdf(i: VisitPdfInput): Promise<void> {
  const { visit, outlet, template } = i
  const doc = await ReportDoc.create()
  const mark = await loadClientMark()
  const bands = i.thresholds ?? DEFAULT_THRESHOLDS
  const rating = visit.risk ?? 'Not Assessed'

  /**
   * Points, in the currency the client's own report uses.
   *
   * A question is worth its weight, and earns that weight times its score. The
   * sum over a section is the "34 of 51 pts" a manager reads — the same numbers
   * the percentage is calculated from, never a second opinion about them.
   */
  const pointsFor = (qs: Question[]) => {
    let got = 0
    let max = 0
    for (const q of qs) {
      if (q.weight <= 0 || !i.askedIds.has(q.id)) continue
      const a = i.answerMap.get(q.id)
      if (!a || a.na || a.score === null) continue
      got += a.score * q.weight
      max += q.weight
    }
    return { got, max }
  }

  const scored = i.sections
    .map((sec) => {
      const qs = i.questions.filter((q) => q.sectionId === sec.id)
      return { sec, qs, points: pointsFor(qs), score: i.sectionScores.find((x) => x.sectionId === sec.id)?.score ?? null }
    })
    .filter((r) => r.qs.length > 0)
  const assessedSections = scored.filter((r) => r.score !== null)
  const totalPoints = assessedSections.reduce((n, r) => n + r.points.got, 0)
  const maxPoints = assessedSections.reduce((n, r) => n + r.points.max, 0)

  // ── Cover ──
  doc.coverPage({
    eyebrow: `${CLIENT.brand.name} · ${visit.type}`,
    title: ['Service', 'Excellence', 'Report'],
    subtitle: `${template?.name ?? 'Mystery shopping assessment'} · ${i.scenario ? `${i.scenario.name} scenario` : 'Standard visit'}`,
    logo: mark,
    score: {
      value: visit.score,
      caption: 'Overall',
      band: `${rating.toUpperCase()}${bandRange(rating, bands)}`,
      bandTone: bandColor(rating),
      narrative: i.summary,
    },
    meta: [
      { label: 'Brand', value: outlet.brand },
      { label: T.Outlet, value: outlet.name.replace(`${outlet.brand} – `, '') },
      { label: 'Location', value: `${outlet.location}, ${outlet.region}` },
      { label: 'Visit date', value: day(visit.visitDate) },
    ],
  })

  // ── Performance overview ──
  doc.section('Performance overview', 'Rating dial, bands and the score behind every section')
  doc.gauge(visit.score, bands, rating)
  doc.gap(2)
  doc.bandLegend(bands)
  doc.gap(3)
  doc.scoreBars(
    scored.map((r) => ({ title: r.sec.title, score: r.score, points: r.points })),
    {
      title: 'Section scores',
      valueHeader: 'Points · %',
      total: { title: 'Total', score: visit.score, points: { got: totalPoints, max: maxPoints } },
    },
  )

  doc.gap(2)
  // The six-category roll-up every dashboard in the platform shares, so a reader
  // can place this visit against the portfolio without leaving the document.
  doc.heading('KPI category scores')
  doc.bars(
    CATEGORY_KEYS.map((k) => {
      const v = visit.categoryScores?.[k]
      const weight = i.kpiConfig.find((c) => c.key === k)?.weight ?? 0
      return { label: CATEGORY_LABELS[k], value: v === undefined || Number.isNaN(v) ? null : v, note: `weight ${weight}%` }
    }),
    { columns: 2 },
  )

  // ── Score summary ──
  doc.section('Score summary', 'Performance cards by audit section')
  doc.scoreCards(
    scored.map((r) => ({
      title: r.sec.title,
      score: r.score,
      points: r.points,
      note: r.sec.stageWeight === undefined ? undefined : r.sec.stageWeight === 0 ? 'unweighted' : `${weightText(r.sec.stageWeight)}% of the visit score`,
    })),
  )
  doc.totalBand({
    label: 'Overall total',
    value: pct(visit.score),
    note: `${Math.round(totalPoints)} / ${Math.round(maxPoints)} points across ${assessedSections.length} assessed sections`,
    body: template?.sequence
      ? 'The visit score is the stage-weighted mean of the section scores above, not the raw point total: each stage carries the share the framework assigns it, renormalised over the stages this visit actually scored. Sections in amber or red are where the points went; those are the fastest to recover.'
      : 'Sections in amber or red are where the points went. Every question scored below standard is listed later in this report with the shopper\u2019s own observation beneath it.',
  })

  // ── Visit details ──
  doc.section('Visit details', 'Mystery shopper visit information')
  doc.detailCards([
    { label: T.Outlet, value: outlet.name },
    { label: `${T.Outlet} code`, value: outlet.code },
    { label: 'Location', value: `${outlet.location}, ${outlet.region}` },
    { label: `${T.Outlet} manager`, value: outlet.manager },
    { label: 'Visit number', value: visit.code },
    { label: 'Visit type', value: visit.type },
    { label: 'Journey', value: visit.journey },
    { label: 'Scenario', value: i.scenario ? `${i.scenario.code} · ${i.scenario.name}` : 'Standard visit' },
    { label: 'Visit date', value: day(visit.visitDate) },
    { label: 'Time in / out', value: `${clock(visit.visitStart)} – ${clock(visit.visitEnd)}` },
    { label: 'Mystery shopper', value: i.shopper ? `${i.shopper.code} · ${i.shopper.profileType}` : '—' },
    { label: 'Party size', value: visit.partySize ? `${visit.partySize} guest${visit.partySize === 1 ? '' : 's'}` : '—' },
    { label: 'Spend', value: visit.spend ? `${CLIENT.org.currency} ${visit.spend}` : '—' },
    { label: 'Submitted', value: dayTime(visit.submittedAt) },
    { label: 'Reporting SLA', value: `${visit.slaStatus}${i.turnaround !== null ? ` · ${i.turnaround}h turnaround` : ''}` },
    { label: 'Reviewed by', value: i.reviewerName },
  ])

  // ── Main KPIs, on a framework that reports them ──
  if (template?.sequence) {
    const seq = template.sequence
    const kpiScores = visit.kpiScores ?? null
    doc.section('Main KPIs', `${seq.industry} · ${seq.serviceModel} · ${seq.visitMode}`)
    doc.tiles(
      seq.mainKpis.map((k) => ({
        label: k.label,
        value: formatKpiValue(k, kpiScores?.[k.key], 'visit'),
        note: KPI_KIND_LABEL[k.kind],
        tone: k.kind === 'weighted' || k.kind === 'derived' ? scoreTone(kpiScores?.[k.key] ?? null) : 'default',
      })),
      3,
    )
    const chain = timingChainText(seq.timingChain, kpiScores)
    if (chain) doc.paragraph(`Timing chain · ${chain}`, { size: 8 })

    const stages = stageRows(i.sections, i.questions, visit.stageScores ?? undefined)
    if (stages.length) {
      doc.heading('How the visit score was built')
      const stageCols: PdfColumn<(typeof stages)[number]>[] = [
        { header: '#', width: 0.4, align: 'center', render: (r) => String(stages.indexOf(r) + 1) },
        { header: 'Stage', width: 3.4, strong: true, render: (r) => r.section.title },
        { header: 'Weight', width: 1, align: 'right', render: (r) => (r.weight === 0 ? '—' : `${weightText(r.weight)}%`) },
        { header: 'Score', width: 1, align: 'right', render: (r) => pct(r.score), tone: (r) => scoreTone(r.score) },
        { header: 'Contribution', width: 1.4, align: 'right', render: (r) => (r.contribution === null ? '—' : `${r.contribution.toFixed(1)} pts`) },
      ]
      doc.table(stageCols, stages, { footer: ['', 'Visit score', '', '', `${(visit.score ?? 0).toFixed(1)} pts`] })
    }
  }

  // ── What went wrong, and what went right ──
  const criticals = i.questions
    .filter((q) => q.critical && i.askedIds.has(q.id))
    .map((q) => ({ q, a: i.answerMap.get(q.id) }))
    .filter((r) => r.a && !r.a.na && r.a.score !== null && r.a.score < 0.5)
  const assessed = i.questions
    .filter((q) => i.askedIds.has(q.id) && q.weight > 0)
    .map((q) => ({ q, a: i.answerMap.get(q.id) }))
    .filter((r) => r.a && !r.a.na && r.a.score !== null)
  const positives = assessed.filter((r) => (r.a!.score ?? 0) >= 0.9).sort((x, y) => y.q.weight - x.q.weight).slice(0, 8)
  const improvements = assessed.filter((r) => (r.a!.score ?? 0) < 0.5 && !r.q.critical).sort((x, y) => y.q.weight - x.q.weight).slice(0, 10)

  doc.section('Summary & priorities', 'What the visit found, and where the points went')
  doc.heading('Executive summary')
  doc.paragraph(i.summary)
  if (criticals.length) {
    doc.callout(
      `${criticals.length} critical standard${criticals.length === 1 ? '' : 's'} failed — immediate escalation`,
      criticals.map((r) => `${r.q.code} · ${strip(r.q.text)}. ${r.a?.comment || 'Critical standard failed.'}`),
      'bad',
    )
  }
  doc.heading('Positive observations')
  doc.bullets(positives.map((r) => `${strip(r.q.text)}${r.a?.comment ? ` — ${r.a.comment}` : ''}`), 'good')
  doc.heading('Priority improvements')
  doc.bullets(
    improvements.map((r) => `${strip(r.q.text)} (${answerText(r.q, r.a!.value, r.a!.na)})${r.a?.comment ? ` — ${r.a.comment}` : ''}`),
    'warn',
  )
  if (template?.sequence?.criticalFailures.length) {
    doc.heading('Critical failure checklist')
    doc.bullets(template.sequence.criticalFailures, 'muted', '–')
    doc.paragraph(
      criticals.length
        ? `Observed on this visit: ${criticals.map((r) => `${r.q.code} ${strip(r.q.text)}`).join('; ')}.`
        : 'No critical failure was observed on this visit.',
      { size: 8, tone: criticals.length ? 'bad' : 'good' },
    )
  }
  if (visit.narrative) {
    doc.heading('Shopper narrative')
    doc.quote(visit.narrative)
  }

  // ── The questionnaire, a section to a page ──
  scored.forEach((r, idx) => {
    doc.section(
      `${idx + 1}. ${r.sec.title}`,
      `${Math.round(r.points.got)} / ${Math.round(r.points.max)} points${r.sec.stageWeight ? `  ·  ${weightText(r.sec.stageWeight)}% of the visit score` : ''}`,
      { value: r.score === null ? '—' : `${r.score.toFixed(0)}%`, note: `${Math.round(r.points.got)}/${Math.round(r.points.max)} pts`, tone: scoreTone(r.score) },
    )
    doc.questionTable(
      r.qs.map((q) => {
        const a = i.answerMap.get(q.id)
        const skipped = !i.askedIds.has(q.id)
        const value = a && !skipped ? a.score : null
        const shown = skipped ? 'not asked' : a ? answerText(q, a.value, a.na) : '—'
        return {
          code: q.code,
          text: q.text,
          answer: shown,
          // Yes and Pass are already told by full marks; a measurement is not.
          answerNote: !skipped && value !== null && ANSWER_WORTH_SHOWING.has(q.type) ? `Recorded: ${shown}` : undefined,
          score: value,
          points: q.weight > 0 && value !== null ? { got: value * q.weight, max: q.weight } : undefined,
          observation: a?.comment?.trim() || undefined,
          critical: q.critical,
          skipped,
        }
      }),
    )
  })

  // ── Evidence ──
  if (i.evidence?.length) {
    doc.section('Evidence', 'Visual documentation captured during the visit')
    doc.photoGrid(
      i.evidence.slice(0, 24).map((e) => ({
        image: null,
        title: e.title,
        caption: `${e.type} · ${dayTime(e.capturedAt)}${e.questionId ? ` · ${i.questions.find((q) => q.id === e.questionId)?.code ?? ''}` : ''}`,
      })),
    )
  }

  // ── Findings and the actions they raised ──
  if (i.findings.length || i.capas.length) {
    doc.section('Findings & corrective actions', 'Raised by this visit and tracked to closure')
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
  }

  backCover(doc)
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

  doc.coverPage({
    eyebrow: `${CLIENT.brand.name} · ${T.Outlet} performance`,
    title: ['Performance', 'Review', 'Report'],
    subtitle: `${outlet.name} · ${outlet.code} · programme to date`,
    logo: mark,
    score: {
      value: outlet.overallScore,
      caption: 'Score',
      band: `${outlet.riskRating.toUpperCase()}${bandRange(outlet.riskRating, DEFAULT_THRESHOLDS)}`,
      bandTone: bandColor(outlet.riskRating),
      narrative: `${outlet.name} is rated ${outlet.riskRating} against a target of ${outlet.targetScore}%${outlet.rank ? `, ranking #${outlet.rank} of ${i.rankOf} assessed ${T.outlets}` : ''}. ${outlet.openIssues} issue${outlet.openIssues === 1 ? '' : 's'} are open, ${outlet.criticalFindings} of them critical.`,
    },
    meta: [
      { label: 'Brand', value: outlet.brand },
      { label: 'Location', value: `${outlet.location}, ${outlet.region}` },
      { label: 'Manager', value: outlet.manager },
      { label: 'Last audit', value: day(outlet.lastAudit) },
    ],
  })
  doc.section(`${T.Outlet} performance`, `${outlet.name} · ${outlet.code}`, {
    value: pct(outlet.overallScore),
    note: outlet.riskRating,
    tone: riskTone(outlet.riskRating),
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

  backCover(doc)
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

  doc.coverPage({
    eyebrow: `${CLIENT.brand.name} · ${T.Outlet} comparison`,
    title: ['Side', 'by Side', 'Report'],
    subtitle: i.outlets.map((o) => o.name).join('   ·   '),
    logo: mark,
    meta: i.outlets.slice(0, 4).map((o) => ({ label: o.code, value: pct(o.overallScore) })),
  })
  doc.section(`${T.Outlet} comparison`, `${i.outlets.length} ${T.outlets} across every KPI category, issue count and SLA`)

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

  backCover(doc)
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
  /** The cover headline, broken where it should break; the last line takes the accent. */
  titleLines?: string[]
  filename: string
}

export async function exportSummaryPdf(i: SummaryPdfInput): Promise<void> {
  const doc = await ReportDoc.create()
  const mark = await loadClientMark()

  doc.coverPage({
    eyebrow: `${CLIENT.brand.name} · ${i.eyebrow}`,
    title: i.titleLines ?? [i.title],
    subtitle: i.subtitle,
    logo: mark,
    meta: i.meta.slice(0, 4),
  })
  doc.section(i.title, i.subtitle)
  if (i.meta.length > 4) doc.meta(i.meta, 4)

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

  backCover(doc)
  doc.save(i.filename)
}
