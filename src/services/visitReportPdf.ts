import { format } from 'date-fns'
import type { jsPDF } from 'jspdf'
import type { AuditTemplate, CorrectiveAction, Evidence, Finding, KpiConfig, Outlet, Question, Scenario, ScoreThreshold, Section, Shopper, Visit, VisitAnswer } from '@/types'
import { CATEGORY_KEYS, CATEGORY_LABELS, CRITICAL_COUNT_KEY } from '@/utils/scoring'
import { KPI_KIND_LABEL, formatKpiValue, stageRows, weightText } from '@/utils/sequence'
import { CLIENT } from '@/config/client'
import {
  ANSWER_WORTH_SHOWING,
  BOTTOM,
  C,
  CW,
  L,
  ReportFlow,
  TONE,
  TOP,
  answerText,
  clock,
  day,
  dayTime,
  drawBackCover,
  drawContents as kitContents,
  drawScorePanel,
  drawCover as kitCover,
  drawFooters as kitFooters,
  makeTones,
  pct0,
  pct1,
  pillTable,
  round,
  severityTone,
  statusTone,
  strip,
  type FontKey,
  type InterFonts,
  type Rgb,
} from './pdfKit'

/**
 * The visit report as a document: cover, contents, an overview chapter, every
 * section's findings, the photographs and a closing page.
 *
 * Laid out in points on A4, in Inter, to the design the client signed off
 * (MS-26-0002, 19 Nov 2026). This module only draws: it takes the figures the
 * report page already shows and the files it has already loaded, and returns
 * the finished jsPDF. Nothing here touches the DOM, so the same code renders in
 * the browser and in the preview script.
 */

// ─────────────────────────────── Inputs ───────────────────────────────

export interface VisitReportData {
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
  summary: string
  reviewerName: string
  turnaround: number | null
  thresholds?: ScoreThreshold[]
  evidence?: Evidence[]
  /** Raised by this visit, and the actions taken on them. */
  findings?: Finding[]
  capas?: CorrectiveAction[]
}

export { INTER_FILES, type InterFonts } from './pdfKit'

export interface VisitReportAssets {
  fonts: InterFonts
  /** The programme's mark, as a PNG data URL. */
  clientMark: string | null
  /** The assessed company's logo, as a PNG data URL. */
  brandMark: string | null
  /** Photographs by evidence id, as JPEG data URLs cropped to the gallery frame. */
  photos: Map<string, string | null>
  /** The date printed as "Issued". */
  issued: Date
}

/** The gallery frame's width over its height; photographs are cropped to it before they arrive. */
export const PHOTO_RATIO = 249 / 153.75

// ─────────────────────────────── The report ───────────────────────────────

/**
 * Builds the visit report. `JsPdf` is the jsPDF constructor, passed in so the
 * browser can load it lazily and the preview script can import it directly.
 */
export function buildVisitReport(JsPdf: typeof jsPDF, i: VisitReportData, assets: VisitReportAssets): jsPDF {
  const f = new ReportFlow(JsPdf, assets.fonts)
  const { doc, s } = f
  const { visit, outlet, template } = i
  const seq = template?.sequence
  const issued = format(assets.issued, 'd MMM yyyy')
  const engagement = CLIENT.org.engagementName

  doc.setDocumentProperties({
    title: `Service Excellence Report · ${outlet.name} · ${visit.code}`,
    author: CLIENT.brand.name,
    subject: `${visit.type} · ${day(visit.visitDate)}`,
    creator: 'INSIGHT360',
  })

  const tones = makeTones(i.thresholds)
  const { bands, bandOf, toneOf, bandRange } = tones

  // ── The figures, computed once ──
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
  const stageInfo = new Map(stageRows(i.sections, i.questions, visit.stageScores ?? undefined).map((r) => [r.section.id, r]))
  const scored = i.sections
    .map((sec) => {
      const qs = i.questions.filter((q) => q.sectionId === sec.id)
      const stage = stageInfo.get(sec.id)
      return {
        sec,
        qs,
        points: pointsFor(qs),
        score: i.sectionScores.find((x) => x.sectionId === sec.id)?.score ?? null,
        weight: stage ? stage.weight : null,
        contribution: stage ? stage.contribution : null,
      }
    })
    .filter((r) => r.qs.length > 0)
  const assessedSections = scored.filter((r) => r.score !== null)
  const totalPoints = assessedSections.reduce((n, r) => n + r.points.got, 0)
  const maxPoints = assessedSections.reduce((n, r) => n + r.points.max, 0)
  const rating = visit.risk ?? 'Not Assessed'
  const band = bands.find((b) => b.label === rating) ?? bandOf(visit.score)

  const rowsOf = (qs: Question[]) => qs.map((q) => ({ q, a: i.answerMap.get(q.id), asked: i.askedIds.has(q.id) }))
  const assessed = rowsOf(i.questions).filter((r) => r.asked && r.q.weight > 0 && r.a && !r.a.na && r.a.score !== null)
  const criticals = assessed.filter((r) => r.q.critical && (r.a!.score ?? 1) < 0.5)
  const positives = assessed.filter((r) => (r.a!.score ?? 0) >= 0.9).sort((x, y) => y.q.weight - x.q.weight).slice(0, 8)
  const improvements = assessed.filter((r) => (r.a!.score ?? 0) < 0.5 && !r.q.critical).sort((x, y) => y.q.weight - x.q.weight).slice(0, 10)
  const kpiScores = visit.kpiScores ?? null
  const csatKpi = seq?.mainKpis.find((k) => k.key === 'csat')
  const csat = csatKpi ? formatKpiValue(csatKpi, kpiScores?.csat, 'visit') : '—'
  const criticalCount = visit.criticalCount ?? criticals.length

  // ── Photographs, numbered in questionnaire order ──
  const qOrder = new Map(i.questions.map((q, n) => [q.id, n]))
  const evQuestion = new Map<string, string>()
  for (const q of i.questions) for (const id of i.answerMap.get(q.id)?.evidenceIds ?? []) evQuestion.set(id, q.id)
  const photos = [...(i.evidence ?? [])]
    .map((e) => ({ e, qid: e.questionId ?? evQuestion.get(e.id) ?? null }))
    .sort((a, b) => (a.qid ? qOrder.get(a.qid) ?? 1e6 : 1e6) - (b.qid ? qOrder.get(b.qid) ?? 1e6 : 1e6) || a.e.capturedAt.localeCompare(b.e.capturedAt))
  const photoNo = new Map(photos.map((p, n) => [p.e.id, n + 1]))
  const photosFor = (qid: string) => photos.filter((p) => p.qid === qid).map((p) => photoNo.get(p.e.id)!)

  // ═════════════════════════════ 1 · Cover ═════════════════════════════
  drawCover()

  // ═════════════════════════════ 2 · Contents (filled in at the end) ═════════════════════════════
  f.newPage()
  const contentsPage = f.page()

  // ═════════════════════════════ Overview · Visit at a glance ═════════════════════════════
  f.chapter('Overview', 'Visit at a glance', `${outlet.name} · ${day(visit.visitDate)} · ${visit.type}`, 'A')
  drawGlance()

  // ═════════════════════════════ Overview · Section scores ═════════════════════════════
  f.chapter('Overview', 'Section scores & weighting', `Points, weight, score and contribution for all ${scored.length} audit sections`, 'A')
  drawSectionTable()

  // ═════════════════════════════ Overview · Visit details ═════════════════════════════
  f.chapter('Overview', 'Visit details', 'Mystery shopper visit information', 'A')
  drawDetails()

  // ═════════════════════════════ Overview · Main KPIs ═════════════════════════════
  if (seq?.mainKpis.length) {
    f.chapter('Overview', 'Main KPIs', `${seq.industry} · ${seq.serviceModel} · ${seq.visitMode}`, 'A')
    drawKpis()
  }

  // ═════════════════════════════ Overview · Summary & priorities ═════════════════════════════
  f.chapter('Overview', 'Summary & priorities', 'What the visit found, and where the points went', 'A')
  drawSummary()

  // ═════════════════════════════ Overview · Every point dropped ═════════════════════════════
  f.chapter('Overview', 'Every point dropped', 'All scored standards that did not receive full marks, grouped by section', 'A')
  drawDropped()

  // ═════════════════════════════ Detailed findings ═════════════════════════════
  drawFindings()

  // ═════════════════════════════ Evidence ═════════════════════════════
  // ═════════════════════════════ Findings & corrective actions ═════════════════════════════
  if (i.findings?.length || i.capas?.length) drawActions()

  if (photos.length) drawEvidence()

  // ═════════════════════════════ Back cover ═════════════════════════════
  drawBackCover(f, assets.clientMark)
  f.contents.push({ group: 'C', label: 'About this report', page: f.page() })

  kitContents(
    f,
    contentsPage,
    [
      { key: 'A', title: 'OVERVIEW' },
      { key: 'B', title: `DETAILED FINDINGS · ${scored.length} AUDIT SECTIONS` },
      { key: 'C', title: i.findings?.length || i.capas?.length ? 'ACTIONS, EVIDENCE & APPENDIX' : 'EVIDENCE & APPENDIX' },
    ],
    toneOf,
  )
  kitFooters(f, visit.code, issued)
  return doc

  // ─────────────────────────────── Cover ───────────────────────────────
  function drawCover() {
    kitCover(f, {
      programmeLine: `${engagement} · ${visit.type}`,
      label: 'MYSTERY SHOPPING VISIT REPORT',
      title: ['Service', 'Excellence', 'Report'],
      subtitle: `${template?.name ?? 'Mystery shopping assessment'} · ${i.scenario ? `${i.scenario.name} scenario` : 'Standard visit'}`,
      clientMark: assets.clientMark,
      brandMark: assets.brandMark,
      score: visit.score,
      scoreCaption: 'Overall',
      band: band ? `${band.label.toUpperCase()} · ${bandRange(band)}` : null,
      stats: [
        { v: outlet.targetScore ? `${outlet.targetScore}%` : '—', l: 'Target' },
        { v: `${round(totalPoints)}/${round(maxPoints)}`, l: 'Points' },
        { v: String(criticalCount), l: 'Critical failures' },
      ],
      summary: i.summary,
      meta: [
        { l: 'Brand', v: outlet.brand, w: 78 },
        { l: 'Outlet', v: outlet.name.replace(`${outlet.brand} – `, ''), w: 92 },
        { l: 'Location', v: `${outlet.location}, ${outlet.region}`, w: 140 },
        { l: 'Visit date', v: day(visit.visitDate), w: 80 },
        { l: 'Visit no.', v: visit.code, w: 80 },
      ],
      issued,
    })
  }

  // ─────────────────────────────── Visit at a glance ───────────────────────────────
  function drawGlance() {
    const top = f.y
    drawScorePanel(f, tones, {
      score: visit.score,
      caption: 'Overall',
      target: outlet.targetScore,
      band,
      stats: [
        { v: `${round(totalPoints)} / ${round(maxPoints)}`, l: 'points scored' },
        { v: String(assessedSections.length), l: 'sections assessed' },
        { v: String(criticalCount), l: 'critical failures', c: criticalCount ? C.red : C.green },
        { v: csat, l: 'customer satisfaction' },
      ],
    })
    // KPI category scores, three to a row.
    f.y = top + 183.7
    s.text('KPI category scores', L, f.y, { f: 'b', size: 11, color: C.ink })
    const colW = 159
    const colX = [L, 219, 394.5]
    CATEGORY_KEYS.forEach((k, n) => {
      const x = colX[n % 3]
      const ry = f.y + 30 + Math.floor(n / 3) * 57
      const v = visit.categoryScores?.[k]
      const val = v === undefined || Number.isNaN(v) ? null : v
      const weight = i.kpiConfig.find((c) => c.key === k)?.weight ?? 0
      const t = TONE[toneOf(val)]
      s.text(CATEGORY_LABELS[k], x, ry, { f: 's', size: 9, color: C.ink })
      s.text(`weight ${weight}%`, x, ry + 12.8, { size: 7.4, color: C.muted })
      s.text(pct1(val), x + colW, ry + 11.3, { f: 'b', size: 13, color: t.fg, align: 'right' })
      s.rrect(x, ry + 20.3, colW, 6, 3, C.track)
      if (val) s.rrect(x, ry + 20.3, Math.max(6, (colW * val) / 100), 6, 3, t.fg)
      s.hline(x, ry + 33, colW, C.line, 0.75)
    })
    f.y += 30 + Math.ceil(CATEGORY_KEYS.length / 3) * 57 + 0.5

    // Where the points went, and where none did.
    const lowest = assessedSections.filter((r) => (r.score ?? 100) < 100).sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).slice(0, 5)
    const full = assessedSections.filter((r) => (r.score ?? 0) >= 99.95).slice(0, 6)
    const rows = Math.max(lowest.length, full.length, 1)
    const ph = 46 + rows * 21.75 - 6.5
    const panel = (x: number, title: string, color: Rgb, items: typeof lowest, empty: string) => {
      s.rrect(x, f.y, 249.75, ph, 7, C.panel)
      s.text(title, x + 14.2, f.y + 21, { f: 'b', size: 8, color, ls: 0.1 })
      if (!items.length) s.text(empty, x + 14.2, f.y + 45, { size: 8.6, color: C.muted })
      items.forEach((r, n) => {
        const ry = f.y + 45 + n * 21.75
        const t = TONE[toneOf(r.score)]
        s.text(s.fit(r.sec.title, 180, 'r', 8.6), x + 14.2, ry, { size: 8.6, color: C.ink })
        s.pill(pct0(r.score), x + 235.5, ry - 9.75, { size: 7.5, fg: t.fg, bg: t.bg, h: 13.5, padX: 7, align: 'right' })
        if (n < items.length - 1) s.hline(x + 14.2, ry + 7.5, 221.25, C.line2, 0.75)
      })
    }
    panel(L, 'LOWEST-SCORING SECTIONS', C.red, lowest, 'Every assessed section scored full marks.')
    panel(303.75, 'FULL MARKS', C.green, full, 'No section scored full marks.')
    f.y += ph
  }

  // ─────────────────────────────── Section scores ───────────────────────────────
  function drawSectionTable() {
    const cols = [
      { label: '#', x: 48.4 },
      { label: 'SECTION', x: 71.1 },
      { label: 'POINTS', x: 298.5, align: 'right' as const },
      { label: 'WEIGHT', x: 342.8, align: 'right' as const },
      { label: 'SCORE', x: 473.5, align: 'right' as const },
      { label: 'CONTRIBUTION', x: 547.8, align: 'right' as const },
    ]
    const head = () => {
      f.y = f.tableHead(cols, f.y + 7.5) + 15.8
    }
    head()
    scored.forEach((r, n) => {
      f.ensure(26, head)
      const t = TONE[toneOf(r.score)]
      const none = r.score === null
      s.text(String(n + 1), 48.4, f.y, { size: 8.8, color: C.muted })
      s.text(s.fit(r.sec.title, 175, 'r', 8.8), 71.1, f.y, { size: 8.8, color: C.ink })
      s.text(`${round(r.points.got)} / ${round(r.points.max)}`, 298.5, f.y, { size: 8.8, color: C.ink, align: 'right' })
      s.text(r.weight === null || r.weight === 0 || none ? '—' : `${weightText(r.weight)}%`, 342.8, f.y, { size: 8.8, color: C.ink, align: 'right' })
      s.rrect(354, f.y - 4.5, 73.5, 4.5, 2.25, C.track)
      if (!none && r.score! > 0) s.rrect(354, f.y - 4.5, Math.max(1, (73.5 * r.score!) / 100), 4.5, 2.25, t.fg)
      s.text(none ? '—' : pct1(r.score), 473.5, f.y, { f: none ? 'r' : 'b', size: 8.8, color: none ? C.muted : t.fg, align: 'right' })
      s.text(r.contribution === null ? '—' : `${r.contribution.toFixed(1)} pts`, 547.8, f.y, { size: 8.8, color: C.ink, align: 'right' })
      s.hline(L, f.y + 9.75, CW, C.line, 0.75)
      f.y += 25.5
    })
    f.ensure(26)
    f.y += 3
    const t = TONE[toneOf(visit.score)]
    s.text('Total · visit score', 71.1, f.y, { f: 'b', size: 8.8, color: C.ink })
    s.text(`${round(totalPoints)} / ${round(maxPoints)}`, 298.5, f.y, { f: 'b', size: 8.8, color: C.ink, align: 'right' })
    s.rrect(354, f.y - 4.5, 73.5, 4.5, 2.25, C.track)
    if (visit.score) s.rrect(354, f.y - 4.5, (73.5 * visit.score) / 100, 4.5, 2.25, t.fg)
    s.text(pct1(visit.score), 473.5, f.y, { f: 'b', size: 8.8, color: C.ink, align: 'right' })
    s.text(seq ? `${(visit.score ?? 0).toFixed(1)} pts` : '—', 547.8, f.y, { f: 'b', size: 8.8, color: C.ink, align: 'right' })
    f.y += 23

    const lead = 'How the visit score is built.'
    const body = seq
      ? ' The visit score is the stage-weighted mean of the section scores above, not the raw point total: each stage carries the share the framework assigns it, renormalised over the stages this visit actually scored. Sections in amber or red are where the points went; those are the fastest to recover.'
      : ' Each section counts by the weight of its category. Sections in amber or red are where the points went; every standard scored below full marks is listed later in this report with the shopper’s own observation beneath it.'
    const tail = `Overall total: ${round(totalPoints)} / ${round(maxPoints)} points across ${assessedSections.length} assessed sections · ${pct1(visit.score)}.`
    const leadW = s.width(lead, 'b', 8.4)
    // The bold lead runs into the first line of the body.
    const first = s.wrap(body.trim(), 466 - leadW - 2.4, 'r', 8.4)[0]
    const rest = s.wrap(body.trim().slice(first.length).trim(), 466, 'r', 8.4)
    const lines = 1 + rest.length + 1
    const h = 19.5 + lines * 12 + 9.5
    f.ensure(h)
    s.rrect(L + 1.1, f.y, CW - 1.1, h, 5, C.panel)
    s.rect(L, f.y, 2.25, h, C.orange)
    let ly = f.y + 19.5
    s.text(lead, 57.8, ly, { f: 'b', size: 8.4, color: C.ink })
    s.text(first, 57.8 + leadW + 2.4, ly, { size: 8.4, color: C.slate })
    for (const ln of rest) s.text(ln, 57.8, (ly += 12), { size: 8.4, color: C.slate })
    s.text(tail, 57.8, (ly += 12), { size: 8.4, color: C.muted })
    f.y += h
  }

  // ─────────────────────────────── Visit details ───────────────────────────────
  function drawDetails() {
    const pairs: [string, string][] = [
      ['Outlet', outlet.name],
      ['Outlet code', outlet.code],
      ['Location', `${outlet.location}, ${outlet.region}`],
      ['Outlet manager', outlet.manager],
      ['Visit number', visit.code],
      ['Visit type', visit.type],
      ['Journey', visit.journey],
      ['Scenario', i.scenario ? `${i.scenario.code} · ${i.scenario.name}` : 'Standard visit'],
      ['Visit date', day(visit.visitDate)],
      ['Time in / out', `${clock(visit.visitStart)} – ${clock(visit.visitEnd)}`],
      ['Mystery shopper', i.shopper ? `${i.shopper.code} · ${i.shopper.profileType}` : '—'],
      ['Party size', visit.partySize ? `${visit.partySize} guest${visit.partySize === 1 ? '' : 's'}` : '—'],
      ['Occupancy on arrival', visit.occupancy === null || visit.occupancy === undefined ? 'Not recorded' : `${visit.occupancy}% of seats in use`],
      ['Spend', visit.spend ? `${CLIENT.org.currency} ${visit.spend}` : '—'],
      ['Submitted', dayTime(visit.submittedAt)],
      ['Reporting SLA', `${visit.slaStatus}${i.turnaround !== null ? ` · ${i.turnaround}h turnaround` : ''}`],
      ['Reviewed by', i.reviewerName],
    ]
    const colW = 246.75
    pairs.forEach(([label, value], n) => {
      const x = n % 2 === 0 ? L : 306.6
      const ry = f.y + 15 + Math.floor(n / 2) * 26.25
      const lw = s.text(label.toUpperCase(), x, ry, { f: 's', size: 7.2, color: C.muted, ls: 0.1 })
      s.text(s.fit(value, colW - lw - 12, 's', 9), x + colW, ry + 1.5, { f: 's', size: 9, color: C.ink, align: 'right' })
      s.hline(x, ry + 9.4, colW, C.line, 0.75)
    })
    f.y += 15 + Math.ceil(pairs.length / 2) * 26.25
  }

  // ─────────────────────────────── Main KPIs ───────────────────────────────
  function drawKpis() {
    if (!seq) return
    const w = 122.25
    const gap = 7.5
    seq.mainKpis.forEach((k, n) => {
      const col = n % 4
      const rowTop = f.y + Math.floor(n / 4) * 70.5
      if (col === 0) f.ensure(64)
      const x = L + col * (w + gap)
      const raw = k.key === CRITICAL_COUNT_KEY ? criticalCount : kpiScores?.[k.key]
      const value = formatKpiValue(k, raw, 'visit')
      const scoredKind = (k.kind === 'weighted' || k.kind === 'derived') && raw !== null && raw !== undefined && Number.isFinite(raw)
      const tone = scoredKind ? toneOf(raw as number) : 'none'
      const accent = tone === 'none' ? C.neutral : TONE[tone].fg
      s.rrect(x, rowTop, w, 63, 5, accent)
      s.rrect(x, rowTop + 0.75, w, 62.25, 5, tone === 'bad' ? C.redSoft : C.panel)
      s.rect(x + 0.6, rowTop + 0.75, w - 1.2, 4, tone === 'bad' ? C.redSoft : C.panel)
      s.text(s.fit(k.label, w - 16, 'r', 6.9), x + 8.4, rowTop + 15.7, { size: 6.9, color: C.slate })
      s.text(value, x + 8.4, rowTop + 42, { f: 'b', size: 13, color: tone === 'none' ? C.ink : TONE[tone].fg })
      s.text(KPI_KIND_LABEL[k.kind].toUpperCase(), x + 8.4, rowTop + 53.3, { f: 's', size: 6.6, color: C.muted, ls: 0.1 })
    })
    f.y += Math.ceil(seq.mainKpis.length / 4) * 70.5 + 2
    f.ensure(14)
    const legend: [Rgb, string][] = [
      [C.green, `Score / compliance ≥ ${bands[0]?.min ?? 90}%`],
      [C.blue, `${bands[1]?.min ?? 80}–${bands[0]?.min ?? 90}%`],
      [C.amber, `${bands[2]?.min ?? 70}–${bands[1]?.min ?? 80}%`],
      [C.red, `Below ${bands[2]?.min ?? 70}%`],
      [C.neutral, 'Timing, satisfaction or not recorded'],
    ]
    let lx = L
    for (const [c, label] of legend) {
      s.circle(lx + 3.4, f.y + 9.4, 3.4, c)
      lx += 11 + s.text(label, lx + 11, f.y + 11.5, { size: 7.4, color: C.slate }) + 13
    }
    f.y += 20
  }

  // ─────────────────────────────── Summary & priorities ───────────────────────────────
  function drawSummary() {
    // Executive summary.
    const lines = s.wrap(i.summary, 482, 'r', 9.6)
    const h = 42 + (lines.length - 1) * 15 + 17.2
    s.rrect(L, f.y, CW, h, 7, C.panel)
    s.text('EXECUTIVE SUMMARY', 56.9, f.y + 21, { f: 'b', size: 8, color: C.ink, ls: 0.1 })
    lines.forEach((ln, n) => s.text(ln, 56.9, f.y + 42 + n * 15, { size: 9.6, color: C.ink }))
    f.y += h + 27.8

    // Priority improvements.
    if (improvements.length) {
      f.ensure(60)
      s.text('Priority improvements', L, f.y, { f: 'b', size: 11, color: C.ink })
      const cols = [
        { label: '#', x: 48.4 },
        { label: 'STANDARD', x: 70.7 },
        { label: 'ANSWER', x: 286.5 },
        { label: 'SHOPPER COMMENT', x: 337.4 },
      ]
      const head = () => {
        f.y = f.tableHead(cols, f.y + 21) + 16
      }
      head()
      improvements.forEach((r, n) => {
        const std = s.wrap(strip(r.q.text), 208, 'r', 8.5)
        const com = r.a?.comment?.trim() ? s.wrap(`“${r.a.comment.trim()}”`, 210, 'r', 8.5) : ['—']
        const lines = Math.max(std.length, com.length)
        const rh = lines * 12 + 12.7
        f.ensure(rh, head)
        s.text(String(n + 1), 48.4, f.y, { size: 8.5, color: C.muted })
        std.forEach((ln, k) => s.text(ln, 70.7, f.y + k * 12, { size: 8.5, color: C.ink }))
        s.text(answerText(r.q, r.a!.value, r.a!.na), 286.5, f.y, { f: 's', size: 8.5, color: C.red })
        com.forEach((ln, k) => s.text(ln, 337.4, f.y + k * 12, { f: com[0] === '—' ? 'r' : 'i', size: 8.5, color: C.slate }))
        s.hline(L, f.y + (lines - 1) * 12 + 7.2, CW, C.line, 0.75)
        f.y += rh
      })
      f.y += 12
    }

    // What went right, and the critical checklist, side by side.
    const posItems = positives.map((r) => s.wrap(strip(r.q.text), 200, 'r', 8.5))
    const crit = seq?.criticalFailures ?? []
    const critItems = crit.map((c) => s.wrap(c, 205, 'r', 8.2))
    const posH = 44.5 + posItems.reduce((n, l) => n + l.length * 12 + 6, 0) + 8
    const observed = criticals.map((r) => `${r.q.code} · ${strip(r.q.text)}`)
    const obsLines = observed.length ? observed.flatMap((o) => s.wrap(o, 200, 's', 8.2)) : ['No critical failure was observed on this visit.']
    const critH = crit.length ? 42 + critItems.reduce((n, l) => n + l.length * 12 + 4.5, 0) + 8 + obsLines.length * 12 + 18 : 0
    const ph = Math.max(posH, critH)
    if (f.ensure(ph)) f.y = TOP
    if (posItems.length) {
      s.rrect(L, f.y, 249.75, ph, 7, C.panel)
      s.text('POSITIVE OBSERVATIONS', 56.9, f.y + 21, { f: 'b', size: 8, color: C.green, ls: 0.1 })
      let iy = f.y + 43.5
      posItems.forEach((lines) => {
        check(60.6, iy - 3, C.green)
        lines.forEach((ln, k) => s.text(ln, 71.1, iy + k * 12, { size: 8.5, color: C.ink }))
        iy += lines.length * 12 + 6
      })
    }
    if (crit.length) {
      const x = posItems.length ? 303.75 : L
      s.rrect(x, f.y, 249.75, ph, 7, C.panel)
      s.text('CRITICAL FAILURE CHECKLIST', x + 14.25, f.y + 21, { f: 'b', size: 8, color: C.ink, ls: 0.1 })
      let iy = f.y + 42
      critItems.forEach((lines) => {
        check(x + 17.5, iy - 3, C.muted)
        lines.forEach((ln, k) => s.text(ln, x + 27, iy + k * 12, { size: 8.2, color: C.ink }))
        iy += lines.length * 12 + 4.5
      })
      const bh = obsLines.length * 12 + 11.5
      const bad = observed.length > 0
      s.rrect(x + 14.25, iy, 221.25, bh, 4, bad ? C.redSoft : C.greenSoft)
      obsLines.forEach((ln, k) => s.text(ln, x + 22.6, iy + 14.3 + k * 12, { f: 's', size: 8.4, color: bad ? C.red : C.green }))
    }
    f.y += ph + 14.5

    // The shopper's own account.
    if (visit.narrative?.trim()) {
      const paras = visit.narrative
        .split(/\n\s*\n|\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => s.wrap(p, 476, 'r', 9.2))
      const h = 42 + paras.reduce((n, p) => n + p.length * 14.7 + 5.5, 0) - 5.5 + 2
      f.ensure(Math.min(h, BOTTOM - TOP))
      s.rrect(L + 1.1, f.y, CW - 1.1, h, 6, C.panel)
      s.rect(L, f.y, 2.25, h, C.navy)
      s.text('SHOPPER NARRATIVE', 59.2, f.y + 21, { f: 'b', size: 8, color: C.ink, ls: 0.1 })
      let py = f.y + 42
      for (const p of paras) {
        for (const ln of p) {
          s.text(ln, 59.2, py, { size: 9.2, color: C.ink })
          py += 14.7
        }
        py += 5.5
      }
      f.y += h
    }
  }

  // ─────────────────────────────── Every point dropped ───────────────────────────────
  function drawDropped() {
    const cols = [
      { label: 'REF.', x: 48.4 },
      { label: 'STANDARD', x: 88.7 },
      { label: 'SCORE', x: 361.5, align: 'right' as const },
      { label: 'SHOPPER COMMENT / RECORDED VALUE', x: 372.9 },
    ]
    const head = () => {
      f.y = f.tableHead(cols, f.y + 7.5)
    }
    head()
    const groups = scored
      .map((r, n) => ({
        r,
        n,
        items: rowsOf(r.qs).filter((x) => x.asked && x.q.weight > 0 && x.a && !x.a.na && x.a.score !== null && x.a.score < 0.995),
      }))
      .filter((g) => g.items.length)
    if (!groups.length) {
      s.text('Every scored standard received full marks.', 48.4, f.y + 18, { size: 8.6, color: C.green })
      f.y += 30
      return
    }
    for (const g of groups) {
      f.ensure(24 + 30, head)
      s.rect(L, f.y + 0.75, CW, 23.25, C.panel)
      s.text(`${g.n + 1}. ${g.r.sec.title}`, 48.4, f.y + 15.8, { f: 'b', size: 8.4, color: C.ink })
      s.text(`${round(g.r.points.got)}/${round(g.r.points.max)} pts · ${pct0(g.r.score)}`, 547.8, f.y + 15.8, { size: 8.4, color: C.muted, align: 'right' })
      f.y += 24 + 15
      for (const x of g.items) {
        const std = s.wrap(x.q.text, 236, 'r', 8.4)
        const shown = answerText(x.q, x.a!.value, x.a!.na)
        const note = x.a?.comment?.trim() ? `“${x.a.comment.trim()}”` : ANSWER_WORTH_SHOWING.has(x.q.type) ? `Recorded: ${shown}` : '—'
        const com = s.wrap(note, 178, 'r', 8.4)
        const lines = Math.max(std.length, com.length)
        const rh = lines * 12 + 12.75
        f.ensure(rh, () => {
          head()
          f.y += 15
        })
        s.text(x.q.code, 48.4, f.y, { f: 's', size: 8.4, color: C.navy })
        std.forEach((ln, k) => s.text(ln, 88.7, f.y + k * 12, { size: 8.4, color: C.ink }))
        s.text(`${round(x.a!.score! * x.q.weight)} / ${round(x.q.weight)}`, 361.5, f.y, { f: 's', size: 8.4, color: C.ink, align: 'right' })
        com.forEach((ln, k) => s.text(ln, 372.9, f.y + k * 12, { f: note.startsWith('“') ? 'i' : 'r', size: 8.4, color: C.slate }))
        s.hline(L, f.y + (lines - 1) * 12 + 7.5, CW, C.line, 0.75)
        f.y += rh
      }
      f.y -= 15
    }
  }

  // ─────────────────────────────── Detailed findings ───────────────────────────────
  function drawFindings() {
    f.newPage()
    const firstPage = f.page()
    // The key to the marks used in the tables that follow.
    s.rrect(L, 53.25, CW, 26.25, 6, C.panel)
    const legend: [IconKind, string][] = [
      ['full', 'Full marks'],
      ['partial', 'Partial'],
      ['zero', 'No marks'],
      ['info', 'Recorded / unscored'],
      ['skip', 'Skipped / not applicable'],
    ]
    let lx = 52.5
    for (const [kind, label] of legend) {
      icon(kind, lx + 6, 66.75)
      lx += 15.7 + s.text(label, lx + 15.7, 69, { size: 7.4, color: C.slate }) + 21
    }
    f.y = 91.5

    const cols = [
      { label: 'REF.', x: 67.4 },
      { label: 'AUDIT QUESTION', x: 107.1 },
      { label: 'MAX', x: 486.1, align: 'right' as const },
      { label: 'SCORE', x: 548.5, align: 'right' as const },
    ]
    const contHead = () => {
      f.y = f.tableHead(cols, 41.5, 6.6) + 15.8
    }

    scored.forEach((r, n) => {
      // A section opens with its heading and at least one question on the same page.
      if (f.y + 100.5 + 34 > BOTTOM) f.newPage()
      if (n === 0) f.contents.push({ group: 'B', label: r.sec.title, page: firstPage, num: String(n + 1).padStart(2, '0'), score: r.score })
      else f.contents.push({ group: 'B', label: r.sec.title, page: f.page(), num: String(n + 1).padStart(2, '0'), score: r.score })
      const top = f.y
      const t = TONE[toneOf(r.score)]
      s.hline(L, top, CW, C.navy, 2.25)
      s.text(String(n + 1).padStart(2, '0'), L, top + 44.3, { f: 'x', size: 22, color: C.numeral })
      s.text(`DETAILED FINDINGS · SECTION ${n + 1} OF ${scored.length}`, 90.9, top + 19.5, { f: 'b', size: 7, color: C.orange, ls: 0.175 })
      s.text(s.fit(r.sec.title, 380, 'b', 13.5), 90.9, top + 36, { f: 'b', size: 13.5, color: C.ink })
      const meta = [
        `${round(r.points.got)} / ${round(r.points.max)} points`,
        r.weight ? `${weightText(r.weight)}% of the visit score` : null,
        r.contribution !== null && r.weight ? `contributes ${r.contribution.toFixed(1)} pts` : null,
      ]
        .filter(Boolean)
        .join(' · ')
      s.text(meta, 90.9, top + 49.5, { size: 7.8, color: C.slate })
      s.rrect(90.75, top + 57, 198.75, 4.5, 2.25, C.track)
      if (r.score) s.rrect(90.75, top + 57, Math.max(4.5, (198.75 * r.score) / 100), 4.5, 2.25, t.fg)
      s.rrect(483, top + 13.5, 70.5, 45.75, 7, r.score === null ? C.chip : t.bg)
      s.text(r.score === null ? '—' : pct0(r.score), 518.25, top + 36, { f: 'b', size: 17, color: r.score === null ? C.muted : t.fg, align: 'center' })
      s.text(`${round(r.points.got)}/${round(r.points.max)} pts`, 518.25, top + 49.5, { f: 's', size: 7.2, color: r.score === null ? C.muted : t.fg, align: 'center' })
      f.y = f.tableHead(cols, top + 78, 6.6) + 15.8

      for (const row of rowsOf(r.qs)) questionRow(row, contHead)
      f.y += 26
    })
  }

  type IconKind = 'full' | 'partial' | 'zero' | 'info' | 'skip'
  function icon(kind: IconKind, cx: number, cy: number) {
    if (kind === 'skip') {
      s.ring(cx, cy, 5.6, C.neutral, 0.75)
      s.line(cx - 1.6, cy, cx + 1.6, cy, C.faint, 0.75)
      return
    }
    const bg = kind === 'full' ? C.green : kind === 'partial' ? C.amber : kind === 'zero' ? C.red : C.neutral
    s.circle(cx, cy, 6, bg)
    if (kind === 'full') check(cx, cy, C.white, 1.1)
    else if (kind === 'zero') {
      s.line(cx - 2, cy - 2, cx + 2, cy + 2, C.white, 1.1)
      s.line(cx - 2, cy + 2, cx + 2, cy - 2, C.white, 1.1)
    } else if (kind === 'partial') {
      s.ring(cx, cy, 2.6, C.white, 0.8)
      const pts: [number, number][] = []
      for (let k = 0; k <= 12; k++) {
        const a = -Math.PI / 2 + (Math.PI * k) / 12
        pts.push([cx + 2.6 * Math.cos(a), cy + 2.6 * Math.sin(a)])
      }
      s.polygon(pts, C.white)
    } else {
      s.circle(cx, cy - 2.4, 0.7, C.white)
      s.line(cx, cy - 0.6, cx, cy + 2.6, C.white, 1.1)
    }
  }
  function check(cx: number, cy: number, c: Rgb, w = 1.2) {
    s.line(cx - 2.4, cy + 0.1, cx - 0.8, cy + 1.8, c, w)
    s.line(cx - 0.8, cy + 1.8, cx + 2.5, cy - 1.7, c, w)
  }

  function questionRow(row: { q: Question; a: VisitAnswer | undefined; asked: boolean }, contHead: () => void) {
    const { q, a, asked } = row
    const answered = asked && a && !a.na && a.value !== null && a.value !== undefined && a.value !== ''
    const scoredQ = asked && q.weight > 0 && a && !a.na && a.score !== null
    const skipped = !asked
    const na = asked && !!a?.na
    const kind: IconKind = skipped || na || (!answered && q.weight > 0) ? 'skip' : scoredQ ? (a!.score! >= 0.995 ? 'full' : a!.score! <= 0.005 ? 'zero' : 'partial') : 'info'
    const dim = kind === 'skip'
    const shown = a ? answerText(q, a.value, a.na) : '—'
    const scoreText = skipped ? 'skip' : na ? 'n/a' : scoredQ ? round(a!.score! * q.weight) : answered ? shown : q.weight > 0 ? '—' : shown
    const scoreColor = dim ? C.muted : scoredQ ? (kind === 'full' ? C.green : kind === 'zero' ? C.red : C.amber) : C.ink

    // What goes under the question: chips, then the shopper's observation.
    const qLines = s.wrap(q.text, 345, 'r', 8.6)
    const chips: { label: string; fg: Rgb; bg: Rgb; f: FontKey; ls?: number }[] = []
    if (scoredQ && ANSWER_WORTH_SHOWING.has(q.type)) chips.push({ label: `Recorded: ${shown}`, fg: C.slate, bg: C.chip, f: 's' })
    if (q.critical) chips.push({ label: 'CRITICAL STANDARD', fg: C.white, bg: C.navy, f: 'b', ls: 0.07 })
    for (const nPhoto of photosFor(q.id)) chips.push({ label: `Photo E${nPhoto}`, fg: C.photoInk, bg: C.photoBg, f: 's' })
    const comment = a?.comment?.trim()
    const obsLines = comment ? s.wrap(comment, 330, 'i', 8.4).slice(0, 24) : []
    const answeredLabel = !a || a.na ? (a?.na ? 'N/A' : '—') : shown.toUpperCase()
    const failed = kind === 'zero' || (kind === 'partial' && (a!.score ?? 1) < 0.5)

    // Height: question lines, a chip line, the observation box.
    const textBottom = (qLines.length - 1) * 11.5
    let h = textBottom + 2.5
    const chipY = h + 4
    if (chips.length) h = chipY + 12
    const boxY = h + 8
    const boxH = obsLines.length ? 19 + obsLines.length * 12 - 0.2 : 0
    if (boxH) h = boxY + boxH
    const rowH = h + 21.5

    f.ensure(rowH - 6, contHead)
    const base = f.y
    if (failed) s.rect(L, base - 15.8 + 0.75, CW, rowH, C.failRow)
    icon(kind, 53.25, base - 2.8)
    s.text(q.code, 67.4, base, { f: 's', size: 8.6, color: dim ? C.muted : C.navy })
    qLines.forEach((ln, k) => s.text(ln, 107.1, base + k * 11.5, { size: 8.6, color: dim ? C.muted : C.ink }))
    s.text(scoredQ || (q.weight > 0 && !skipped && !na) ? round(q.weight) : '—', 482.6, base, { size: 8.6, color: C.muted, align: 'center' })
    s.text(s.fit(scoreText, 54, scoredQ ? 'b' : 's', 8.6), 549.2, base, { f: scoredQ ? 'b' : dim ? 'r' : 's', size: 8.6, color: scoreColor, align: 'right' })

    if (chips.length) {
      let cx = 107.25
      for (const c of chips) {
        const w = s.pill(c.label, cx, base + chipY, { f: c.f, size: 6.6, fg: c.fg, bg: c.bg, h: 12, padX: 4.4, ls: c.ls })
        cx += w + 4
      }
    }
    if (boxH) {
      const bx = 108
      const by = base + boxY
      s.rrect(bx, by, 348, boxH, 4, failed ? C.failBox : C.panel)
      s.rect(bx, by, 6, boxH, failed ? C.failBox : C.panel)
      s.rect(bx - 0.75, by, 1.5, boxH, failed ? C.red : kind === 'full' ? C.green : C.neutral)
      s.text(s.fit(`OBSERVATION · ANSWERED ${answeredLabel}`, 330, 'b', 6.6), 115.9, by + 12.2, { f: 'b', size: 6.6, color: C.muted, ls: 0.075 })
      obsLines.forEach((ln, k) => s.text(ln, 115.9, by + 23.5 + k * 12, { f: 'i', size: 8.4, color: C.ink }))
    }
    s.hline(L, base + h + 6, CW, C.line, 0.75)
    f.y = base + rowH
  }

  // ─────────────────────────────── Findings & corrective actions ───────────────────────────────
  function drawActions() {
    f.chapter('Actions', 'Findings & corrective actions', 'Raised by this visit and tracked to closure', 'C')
    if (i.findings?.length) {
      pillTable<Finding>(
        f,
        `Findings raised (${i.findings.length})`,
        [
          { label: 'CODE', x: 48.4, w: 62, text: (x) => x.code, code: true },
          { label: 'FINDING', x: 114, w: 218, text: (x) => x.title, strong: true },
          { label: 'CATEGORY', x: 340, w: 92, text: (x) => CATEGORY_LABELS[x.category] },
          { label: 'SEVERITY', x: 438, w: 52, pill: (x) => ({ label: x.severity, tone: severityTone(x.severity) }) },
          { label: 'STATUS', x: 494, w: 58, pill: (x) => ({ label: x.status, tone: statusTone(x.status) }) },
        ],
        i.findings,
      )
    }
    if (i.capas?.length) {
      pillTable<CorrectiveAction>(
        f,
        `Corrective actions (${i.capas.length})`,
        [
          { label: 'CODE', x: 48.4, w: 62, text: (c) => c.code, code: true },
          { label: 'ACTION', x: 114, w: 200, text: (c) => c.title, strong: true },
          { label: 'OWNER', x: 320, w: 88, text: (c) => c.ownerName || '—' },
          { label: 'TARGET', x: 410, w: 58, text: (c) => day(c.targetDate) },
          { label: 'STATUS', x: 474, w: 78, pill: (c) => ({ label: c.status, tone: statusTone(c.status) }) },
        ],
        i.capas,
      )
    }
  }

  // ─────────────────────────────── Evidence ───────────────────────────────
  function drawEvidence() {
    f.chapter('Evidence', 'Evidence photographs', 'Visual documentation captured during the visit, in audit-section order', 'C')
    const w = 249.75
    const imgH = 153.75
    const cardH = 201.75
    photos.forEach((p, n) => {
      const col = n % 2
      if (col === 0 && n > 0) {
        f.y += cardH + 10.5
        if (f.y + cardH > BOTTOM + 10) {
          f.newPage()
          f.y = TOP - 10
        }
      }
      const x = col === 0 ? 43.1 : 303.4
      const e = p.e
      s.rrect(x + 0.4, f.y + 0.35, w - 0.8, imgH, 5, C.photoDark)
      s.rect(x + 0.4, f.y + 6, w - 0.8, imgH - 5.65, C.photoDark)
      const img = assets.photos.get(e.id)
      if (!s.image(img, 'JPEG', x + 0.4, f.y + 0.35, w - 0.8, imgH)) {
        s.text(e.type === 'Video' ? 'VIDEO ON FILE' : 'CAPTURE ON FILE', x + w / 2, f.y + imgH / 2 + 3, { f: 'b', size: 7.5, color: C.faint, align: 'center', ls: 0.16 })
      }
      s.rrectStroke(x, f.y, w, cardH, 6, C.line, 0.75)
      s.pill(`E${n + 1}`, x + 6.4, f.y + 6.3, { f: 'b', size: 7, fg: C.white, bg: C.orange, h: 12, padX: 5 })
      const q = p.qid ? i.questions.find((x) => x.id === p.qid) : undefined
      const sec = q ? scored.findIndex((r) => r.sec.id === q.sectionId) : -1
      const secLabel = sec >= 0 ? `${sec + 1}. ${scored[sec].sec.title}`.toUpperCase() : 'GENERAL'
      s.text(s.fit(secLabel, w - 18, 'b', 6.4), x + 8.9, f.y + imgH + 12, { f: 'b', size: 6.4, color: C.orange, ls: 0.1 })
      s.text(s.fit(e.title || q?.text || e.type, w - 18, 'b', 8.3), x + 8.9, f.y + imgH + 24.75, { f: 'b', size: 8.3, color: C.ink })
      const meta = `${e.type} · ${dayTime(e.photoTakenAt ?? e.capturedAt)}${q ? ' · ' : ' · No question reference'}`
      const mw = s.text(meta, x + 8.9, f.y + imgH + 36.75, { size: 7, color: C.muted })
      if (q) s.text(q.code, x + 8.9 + mw, f.y + imgH + 36.75, { f: 'b', size: 7, color: C.navy })
    })
    f.y += cardH
  }

  // ─────────────────────────────── Back cover ───────────────────────────────

  // ─────────────────────────────── Contents ───────────────────────────────

  // ─────────────────────────────── Footers ───────────────────────────────
}
