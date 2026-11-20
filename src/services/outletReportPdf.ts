import { format } from 'date-fns'
import type { jsPDF } from 'jspdf'
import type { AuditTemplate, CorrectiveAction, Finding, KpiConfig, Outlet, Question, ScoreThreshold, Section, Visit } from '@/types'
import { CATEGORY_KEYS, CATEGORY_LABELS } from '@/utils/scoring'
import { stageRows, weightText } from '@/utils/sequence'
import { T } from '@/config/terms'
import {
  C,
  CW,
  L,
  ReportFlow,
  TONE,
  day,
  drawBackCover,
  drawContents,
  drawCover,
  drawFooters,
  drawScorePanel,
  makeTones,
  pct1,
  pillTable,
  severityTone,
  statusTone,
  type InterFonts,
  type Tone,
} from './pdfKit'

/**
 * The outlet performance report, in the same design as the visit report:
 * cover, contents, the outlet at a glance, its service-sequence stages, every
 * audit, and the findings and actions still open. Drawing only; the figures
 * come from the outlet page.
 */

export interface OutletReportData {
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
  thresholds?: ScoreThreshold[]
}

export interface OutletReportAssets {
  fonts: InterFonts
  clientMark: string | null
  brandMark: string | null
  issued: Date
}

const riskTone = (r: string | null | undefined): Tone => (r === 'Excellent' ? 'good' : r === 'Good' ? 'fair' : r === 'Needs Improvement' ? 'warn' : r === 'Critical' ? 'bad' : 'none')
const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`

export function buildOutletReport(JsPdf: typeof jsPDF, i: OutletReportData, assets: OutletReportAssets): jsPDF {
  const f = new ReportFlow(JsPdf, assets.fonts)
  const { doc, s } = f
  const { outlet } = i
  const tones = makeTones(i.thresholds)
  const { bands, toneOf, bandRange } = tones
  const issued = format(assets.issued, 'd MMM yyyy')
  const band = bands.find((b) => b.label === outlet.riskRating) ?? tones.bandOf(outlet.overallScore)
  const completed = i.history.filter((v) => v.status === 'Approved' || v.status === 'Closed').length
  const delta = outlet.overallScore !== null && outlet.previousScore !== null ? outlet.overallScore - outlet.previousScore : null
  const vsTarget = outlet.overallScore !== null && outlet.targetScore ? outlet.overallScore - outlet.targetScore : null
  const openFindings = i.findings.filter((x) => x.status === 'Open' || x.status === 'In Progress')
  const openActions = i.actions.filter((a) => a.status !== 'Closed')
  const summary = `${outlet.name} is rated ${outlet.riskRating}${outlet.targetScore ? ` against a target of ${outlet.targetScore}%` : ''}${outlet.rank ? `, ranking #${outlet.rank} of ${i.rankOf} assessed ${T.outlets}` : ''}. ${completed} of ${outlet.annualVisits} visits are complete this programme year. ${outlet.openIssues} issue${outlet.openIssues === 1 ? ' is' : 's are'} open, ${outlet.criticalFindings} of them critical.`

  doc.setDocumentProperties({ title: `Performance Review Report · ${outlet.name}`, subject: `${T.Outlet} performance · ${outlet.code}`, creator: 'INSIGHT360' })

  // ── Cover ──
  drawCover(f, {
    programmeLine: `${T.Outlet} performance · programme to date`,
    label: `${T.Outlet.toUpperCase()} PERFORMANCE REPORT`,
    title: ['Performance', 'Review', 'Report'],
    subtitle: `${outlet.name} · ${outlet.code} · programme to date`,
    clientMark: assets.clientMark,
    brandMark: assets.brandMark,
    score: outlet.overallScore,
    scoreCaption: 'Score',
    band: band ? `${band.label.toUpperCase()} · ${bandRange(band)}` : null,
    stats: [
      { v: outlet.targetScore ? `${outlet.targetScore}%` : '—', l: 'Target' },
      { v: outlet.rank ? `#${outlet.rank}/${i.rankOf}` : '—', l: 'Rank' },
      { v: String(outlet.openIssues), l: 'Open issues' },
    ],
    summary,
    meta: [
      { l: 'Brand', v: outlet.brand, w: 78 },
      { l: T.Outlet, v: outlet.name.replace(`${outlet.brand} – `, ''), w: 92 },
      { l: 'Location', v: `${outlet.location}, ${outlet.region}`, w: 140 },
      { l: 'Manager', v: outlet.manager || '—', w: 80 },
      { l: 'Last audit', v: day(outlet.lastAudit), w: 80 },
    ],
    issued,
  })

  // ── Contents, filled in at the end ──
  f.newPage()
  const contentsPage = f.page()

  // ── Overview ──
  f.chapter('Overview', `${T.Outlet} at a glance`, `${outlet.name} · ${outlet.code} · programme to date`, 'A')
  drawScorePanel(f, tones, {
    score: outlet.overallScore,
    caption: 'Score',
    target: outlet.targetScore,
    band,
    stats: [
      { v: pct1(outlet.previousScore), l: delta === null ? 'previous score' : `previous · ${signed(delta)} pts` },
      { v: outlet.rank ? `#${outlet.rank} of ${i.rankOf}` : '—', l: i.percentile !== null ? `rank · P${i.percentile}` : 'rank' },
      { v: `${completed} / ${outlet.annualVisits}`, l: 'visits completed' },
      { v: String(outlet.openIssues), l: `open issues · ${outlet.criticalFindings} critical`, c: outlet.criticalFindings ? C.red : C.ink },
    ],
  })
  f.y += 183.7
  categoryGrid()
  details()

  // ── Service sequence, on a framework that has one ──
  const stages = i.template?.sequence && i.latestCompleted ? stageRows(i.sections, i.questions, i.latestCompleted.stageScores ?? undefined) : []
  if (stages.length && i.latestCompleted && i.template?.sequence) {
    const seq = i.template.sequence
    f.chapter('Overview', 'Service sequence', `${seq.serviceModel} · ${seq.visitMode} · from ${i.latestCompleted.type} on ${day(i.latestCompleted.visitDate)}`, 'A')
    stageTable(stages, i.latestCompleted.score)
  }

  // ── History and actions ──
  f.chapter('History', 'Audit history', `Every visit to ${outlet.name}, newest first`, 'B')
  pillTable<Visit>(
    f,
    `Visits (${i.history.length})`,
    [
      { label: 'VISIT', x: 48.4, w: 66, text: (v) => v.code, code: true },
      { label: 'TYPE', x: 118, w: 80, text: (v) => v.type, strong: true },
      { label: 'DATE', x: 202, w: 66, text: (v) => day(v.visitDate ?? v.scheduledDate) },
      { label: 'STATUS', x: 272, w: 74, pill: (v) => ({ label: v.status, tone: statusTone(v.status === 'Approved' ? 'Closed' : v.status) }) },
      { label: 'SCORE', x: 350, w: 52, align: 'right', text: (v) => pct1(v.score), strong: true, color: (v) => (v.score === null ? C.muted : TONE[toneOf(v.score)].fg) },
      { label: 'RISK', x: 414, w: 90, pill: (v) => ({ label: v.risk ?? '—', tone: riskTone(v.risk) }) },
      { label: 'CRITICAL', x: 506, w: 46, align: 'right', text: (v) => String(v.criticalCount ?? 0), color: (v) => (v.criticalCount ? C.red : undefined) },
    ],
    i.history,
  )

  f.chapter('Actions', 'Findings & corrective actions', 'Still open at this site, and the actions taken on them', 'B')
  if (openFindings.length) {
    pillTable<Finding>(
      f,
      `Open findings (${openFindings.length})`,
      [
        { label: 'CODE', x: 48.4, w: 62, text: (x) => x.code, code: true },
        { label: 'FINDING', x: 114, w: 210, text: (x) => x.title, strong: true },
        { label: 'RAISED', x: 330, w: 62, text: (x) => day(x.createdAt) },
        { label: 'SEVERITY', x: 400, w: 52, pill: (x) => ({ label: x.severity, tone: severityTone(x.severity) }) },
        { label: 'STATUS', x: 470, w: 82, pill: (x) => ({ label: x.status, tone: statusTone(x.status) }) },
      ],
      openFindings,
    )
  } else {
    note('No open findings at this site.')
  }
  if (openActions.length) {
    pillTable<CorrectiveAction>(
      f,
      `Corrective actions in progress (${openActions.length})`,
      [
        { label: 'CODE', x: 48.4, w: 62, text: (c) => c.code, code: true },
        { label: 'ACTION', x: 114, w: 200, text: (c) => c.title, strong: true },
        { label: 'OWNER', x: 320, w: 88, text: (c) => c.ownerName || '—' },
        { label: 'TARGET', x: 410, w: 58, text: (c) => day(c.targetDate) },
        { label: 'STATUS', x: 474, w: 78, pill: (c) => ({ label: c.status, tone: statusTone(c.status) }) },
      ],
      openActions,
    )
  } else {
    note('No corrective actions in progress.')
  }

  // ── Closing page ──
  drawBackCover(f, assets.clientMark)
  f.contents.push({ group: 'C', label: 'About this report', page: f.page() })
  drawContents(
    f,
    contentsPage,
    [
      { key: 'A', title: 'OVERVIEW' },
      { key: 'B', title: 'HISTORY & ACTIONS' },
      { key: 'C', title: 'APPENDIX' },
    ],
    toneOf,
  )
  drawFooters(f, outlet.code, issued)
  return doc

  // ─────────────────────────────── Pieces ───────────────────────────────

  /** The six KPI categories, three to a row, each against its target. */
  function categoryGrid() {
    s.text('KPI category scores', L, f.y, { f: 'b', size: 11, color: C.ink })
    const colW = 159
    const colX = [L, 219, 394.5]
    CATEGORY_KEYS.forEach((k, n) => {
      const x = colX[n % 3]
      const ry = f.y + 30 + Math.floor(n / 3) * 57
      const v = outlet.categoryScores?.[k]
      const val = v === undefined || v === null || Number.isNaN(v) ? null : v
      const target = i.kpiConfig.find((c) => c.key === k)?.target ?? 90
      const t = TONE[toneOf(val)]
      s.text(CATEGORY_LABELS[k], x, ry, { f: 's', size: 9, color: C.ink })
      s.text(`target ${target}%`, x, ry + 12.8, { size: 7.4, color: C.muted })
      s.text(pct1(val), x + colW, ry + 11.3, { f: 'b', size: 13, color: t.fg, align: 'right' })
      s.rrect(x, ry + 20.3, colW, 6, 3, C.track)
      if (val) s.rrect(x, ry + 20.3, Math.max(6, (colW * val) / 100), 6, 3, t.fg)
      // The target, as a tick across the bar.
      s.rect(x + (colW * target) / 100 - 0.6, ry + 18.3, 1.2, 10, C.slate)
      s.hline(x, ry + 33, colW, C.line, 0.75)
    })
    f.y += 30 + Math.ceil(CATEGORY_KEYS.length / 3) * 57 + 18
  }

  /** The outlet's particulars, two columns of label and value. */
  function details() {
    const pairs: [string, string][] = [
      [T.Outlet, outlet.name],
      [`${T.Outlet} code`, outlet.code],
      ['Brand', outlet.brand],
      ['Location', `${outlet.location}, ${outlet.region}`],
      [`${T.Outlet} manager`, outlet.manager || '—'],
      ['Target score', outlet.targetScore ? `${outlet.targetScore}%` : '—'],
      ['Score vs target', vsTarget === null ? '—' : `${signed(vsTarget)} pts`],
      ['Change since last', delta === null ? '—' : `${signed(delta)} pts`],
      ['Last audit', day(outlet.lastAudit)],
      ['Next audit', day(outlet.nextAudit)],
    ]
    const rows = Math.ceil(pairs.length / 2)
    f.ensure(30 + rows * 26.25)
    s.text(`${T.Outlet} details`, L, f.y, { f: 'b', size: 11, color: C.ink })
    f.y += 12
    const colW = 246.75
    pairs.forEach(([label, value], n) => {
      const x = n % 2 === 0 ? L : 306.6
      const ry = f.y + 15 + Math.floor(n / 2) * 26.25
      const lw = s.text(label.toUpperCase(), x, ry, { f: 's', size: 7.2, color: C.muted, ls: 0.1 })
      s.text(s.fit(value, colW - lw - 12, 's', 9), x + colW, ry + 1.5, { f: 's', size: 9, color: C.ink, align: 'right' })
      s.hline(x, ry + 9.4, colW, C.line, 0.75)
    })
    f.y += 15 + rows * 26.25
  }

  /** Stage, weight, score and contribution from the latest completed visit. */
  function stageTable(rows: ReturnType<typeof stageRows>, visitScore: number | null) {
    const cols = [
      { label: '#', x: 48.4 },
      { label: 'STAGE', x: 71.1 },
      { label: 'QUESTIONS', x: 298.5, align: 'right' as const },
      { label: 'WEIGHT', x: 342.8, align: 'right' as const },
      { label: 'SCORE', x: 473.5, align: 'right' as const },
      { label: 'CONTRIBUTION', x: 547.8, align: 'right' as const },
    ]
    const head = () => {
      f.y = f.tableHead(cols, f.y + 7.5) + 15.8
    }
    head()
    rows.forEach((r, n) => {
      f.ensure(26, head)
      const none = r.score === null
      const t = TONE[toneOf(r.score)]
      s.text(String(n + 1), 48.4, f.y, { size: 8.8, color: C.muted })
      s.text(s.fit(r.section.title, 200, 'r', 8.8), 71.1, f.y, { size: 8.8, color: C.ink })
      s.text(String(r.questions), 298.5, f.y, { size: 8.8, color: C.ink, align: 'right' })
      s.text(r.weight === 0 ? '—' : `${weightText(r.weight)}%`, 342.8, f.y, { size: 8.8, color: C.ink, align: 'right' })
      s.rrect(354, f.y - 4.5, 73.5, 4.5, 2.25, C.track)
      if (!none && r.score! > 0) s.rrect(354, f.y - 4.5, Math.max(1, (73.5 * r.score!) / 100), 4.5, 2.25, t.fg)
      s.text(none ? '—' : pct1(r.score), 473.5, f.y, { f: none ? 'r' : 'b', size: 8.8, color: none ? C.muted : t.fg, align: 'right' })
      s.text(r.contribution === null ? '—' : `${r.contribution.toFixed(1)} pts`, 547.8, f.y, { size: 8.8, color: C.ink, align: 'right' })
      s.hline(L, f.y + 9.75, CW, C.line, 0.75)
      f.y += 25.5
    })
    f.ensure(26)
    f.y += 3
    const t = TONE[toneOf(visitScore)]
    s.text('Total · visit score', 71.1, f.y, { f: 'b', size: 8.8, color: C.ink })
    s.rrect(354, f.y - 4.5, 73.5, 4.5, 2.25, C.track)
    if (visitScore) s.rrect(354, f.y - 4.5, (73.5 * visitScore) / 100, 4.5, 2.25, t.fg)
    s.text(pct1(visitScore), 473.5, f.y, { f: 'b', size: 8.8, color: C.ink, align: 'right' })
    s.text(visitScore === null ? '—' : `${visitScore.toFixed(1)} pts`, 547.8, f.y, { f: 'b', size: 8.8, color: C.ink, align: 'right' })
    f.y += 20
  }

  /** A one-line green note where a table would be empty. */
  function note(text: string) {
    f.ensure(40)
    s.rrect(L, f.y, CW, 30, 6, C.greenSoft)
    s.text(text, L + 14, f.y + 18.6, { f: 's', size: 8.6, color: C.green })
    f.y += 44
  }
}
