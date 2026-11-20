import { format } from 'date-fns'
import type { jsPDF } from 'jspdf'
import type { CategoryKey, KpiConfig, Outlet, ScoreThreshold } from '@/types'
import { CATEGORY_KEYS, CATEGORY_LABELS } from '@/utils/scoring'
import { T } from '@/config/terms'
import {
  C,
  CW,
  L,
  ReportFlow,
  TONE,
  drawBackCover,
  drawContents,
  drawCover,
  drawFooters,
  makeTones,
  pct1,
  pillTable,
  riskTone,
  type InterFonts,
  type Rgb,
} from './pdfKit'

/**
 * The portfolio documents — management reports, reports from the builder and
 * the outlet comparison — in the design of the visit and outlet reports.
 */

export interface PortfolioReportAssets {
  fonts: InterFonts
  clientMark: string | null
  issued: Date
}

const shortName = (o: Outlet) => o.name.replace(`${o.brand} – `, '')

// ─────────────────────────────── Management / built report ───────────────────────────────

export interface SummaryReportData {
  eyebrow: string
  title: string
  subtitle?: string
  meta: { label: string; value: string }[]
  summary: string
  outlets?: Outlet[]
  sections?: { heading: string; body?: string; bullets?: string[] }[]
  titleLines?: string[]
  /** The portfolio score for the cover ring. */
  score?: number | null
  /** Up to three figures beside the ring. */
  stats?: { v: string; l: string }[]
  /** Printed in every footer, e.g. the report number. */
  reference?: string
  thresholds?: ScoreThreshold[]
}

export function buildSummaryReport(JsPdf: typeof jsPDF, i: SummaryReportData, assets: PortfolioReportAssets): jsPDF {
  const f = new ReportFlow(JsPdf, assets.fonts)
  const { doc, s } = f
  const tones = makeTones(i.thresholds)
  const issued = format(assets.issued, 'd MMM yyyy')
  const band = i.score === null || i.score === undefined ? null : tones.bandOf(i.score)
  doc.setDocumentProperties({ title: i.title, subject: i.eyebrow, creator: 'INSIGHT360' })

  drawCover(f, {
    programmeLine: i.eyebrow,
    label: i.eyebrow.toUpperCase(),
    title: i.titleLines?.length ? i.titleLines : [i.title],
    subtitle: i.subtitle ?? '',
    clientMark: assets.clientMark,
    brandMark: null,
    score: i.score ?? null,
    scoreCaption: 'Portfolio',
    band: band ? `${band.label.toUpperCase()} · ${tones.bandRange(band)}` : null,
    stats: i.stats ?? [],
    summary: i.summary,
    meta: i.meta.slice(0, 5).map((m, n) => ({ l: m.label, v: m.value, w: [78, 92, 140, 80, 80][n] })),
    issued,
  })
  f.newPage()
  const contentsPage = f.page()

  // ── The report itself ──
  f.chapter(i.eyebrow, i.title, i.subtitle ?? '', 'A', 'Summary')
  details(i.meta)
  panel('SUMMARY', i.summary, C.orange)
  for (const sec of i.sections ?? []) {
    f.ensure(60)
    s.text(sec.heading, L, f.y + 12, { f: 'b', size: 11, color: C.ink })
    f.y += 30
    if (sec.body) {
      for (const ln of s.wrap(sec.body, CW, 'r', 9.2)) {
        f.ensure(15)
        s.text(ln, L, f.y, { size: 9.2, color: C.ink })
        f.y += 14.7
      }
      f.y += 6
    }
    for (const b of sec.bullets ?? []) {
      const lines = s.wrap(b, CW - 20, 'r', 9)
      f.ensure(lines.length * 13 + 6)
      s.circle(L + 4, f.y - 3, 2.2, C.orange)
      lines.forEach((ln, k) => s.text(ln, L + 15, f.y + k * 13, { size: 9, color: C.ink }))
      f.y += lines.length * 13 + 7
    }
    f.y += 12
  }

  if (i.outlets?.length) {
    f.chapter('Portfolio', `${T.Outlets} in scope`, `${i.outlets.length} ${T.outlets}, best score first`, 'B')
    const ranked = [...i.outlets].sort((a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1))
    pillTable<Outlet>(
      f,
      `${T.Outlets} (${ranked.length})`,
      [
        { label: 'CODE', x: 48.4, w: 50, text: (o) => o.code, code: true },
        { label: T.Outlet.toUpperCase(), x: 102, w: 180, text: (o) => o.name, strong: true },
        { label: 'REGION', x: 288, w: 90, text: (o) => o.region },
        { label: 'SCORE', x: 380, w: 50, align: 'right', text: (o) => pct1(o.overallScore), strong: true, color: (o) => (o.overallScore === null ? C.muted : TONE[tones.toneOf(o.overallScore)].fg) },
        { label: 'RISK', x: 440, w: 80, pill: (o) => ({ label: o.riskRating, tone: riskTone(o.riskRating) }) },
        { label: 'OPEN', x: 524, w: 28, align: 'right', text: (o) => String(o.openIssues), color: (o) => (o.criticalFindings ? C.red : undefined) },
      ],
      ranked,
    )
  }

  drawBackCover(f, assets.clientMark)
  f.contents.push({ group: 'C', label: 'About this report', page: f.page() })
  drawContents(
    f,
    contentsPage,
    [
      { key: 'A', title: i.eyebrow.toUpperCase() },
      { key: 'B', title: 'PORTFOLIO' },
      { key: 'C', title: 'APPENDIX' },
    ],
    tones.toneOf,
  )
  drawFooters(f, i.reference ?? i.title, issued)
  return doc

  function details(pairs: { label: string; value: string }[]) {
    const colW = 246.75
    pairs.forEach((p, n) => {
      const x = n % 2 === 0 ? L : 306.6
      const ry = f.y + 15 + Math.floor(n / 2) * 26.25
      const lw = s.text(p.label.toUpperCase(), x, ry, { f: 's', size: 7.2, color: C.muted, ls: 0.1 })
      s.text(s.fit(p.value, colW - lw - 12, 's', 9), x + colW, ry + 1.5, { f: 's', size: 9, color: C.ink, align: 'right' })
      s.hline(x, ry + 9.4, colW, C.line, 0.75)
    })
    f.y += 15 + Math.ceil(pairs.length / 2) * 26.25 + 18
  }

  function panel(title: string, text: string, bar: Rgb) {
    const lines = s.wrap(text, 476, 'r', 9.4)
    const h = 42 + (lines.length - 1) * 14.7 + 17
    f.ensure(Math.min(h, 700))
    s.rrect(L + 1.1, f.y, CW - 1.1, h, 6, C.panel)
    s.rect(L, f.y, 2.25, h, bar)
    s.text(title, 59.2, f.y + 21, { f: 'b', size: 8, color: C.ink, ls: 0.1 })
    lines.forEach((ln, n) => s.text(ln, 59.2, f.y + 42 + n * 14.7, { size: 9.4, color: C.ink }))
    f.y += h + 28
  }
}

// ─────────────────────────────── Outlet comparison ───────────────────────────────

export interface CompareReportData {
  outlets: Outlet[]
  metrics: { label: string; values: (string | number)[] }[]
  kpiConfig: KpiConfig[]
  thresholds?: ScoreThreshold[]
}

export function buildCompareReport(JsPdf: typeof jsPDF, i: CompareReportData, assets: PortfolioReportAssets): jsPDF {
  const f = new ReportFlow(JsPdf, assets.fonts)
  const { doc, s } = f
  const tones = makeTones(i.thresholds)
  const issued = format(assets.issued, 'd MMM yyyy')
  const scored = i.outlets.filter((o) => o.overallScore !== null)
  const avg = scored.length ? scored.reduce((n, o) => n + (o.overallScore ?? 0), 0) / scored.length : null
  const best = [...scored].sort((a, b) => b.overallScore! - a.overallScore!)[0]
  const worst = [...scored].sort((a, b) => a.overallScore! - b.overallScore!)[0]
  const spread = best && worst ? best.overallScore! - worst.overallScore! : null
  const band = tones.bandOf(avg)
  doc.setDocumentProperties({ title: `${T.Outlet} comparison`, subject: i.outlets.map((o) => o.name).join(', '), creator: 'INSIGHT360' })

  drawCover(f, {
    programmeLine: `${T.Outlet} comparison`,
    label: `${T.Outlet.toUpperCase()} COMPARISON REPORT`,
    title: ['Side', 'by Side', 'Report'],
    subtitle: i.outlets.map((o) => o.name).join(' · '),
    clientMark: assets.clientMark,
    brandMark: null,
    score: avg,
    scoreCaption: 'Average',
    band: band ? `${band.label.toUpperCase()} · ${tones.bandRange(band)}` : null,
    stats: [
      { v: String(i.outlets.length), l: `${T.Outlets} compared` },
      { v: best ? pct1(best.overallScore) : '—', l: 'Highest' },
      { v: spread === null ? '—' : `${spread.toFixed(1)} pts`, l: 'Spread' },
    ],
    summary: best && worst && best !== worst
      ? `${i.outlets.length} ${T.outlets} compared across every KPI category, issue count and reporting SLA. ${best.name} leads at ${pct1(best.overallScore)}; ${worst.name} trails at ${pct1(worst.overallScore)}, ${spread!.toFixed(1)} points behind.`
      : `${i.outlets.length} ${T.outlets} compared across every KPI category, issue count and reporting SLA.`,
    meta: i.outlets.slice(0, 5).map((o, n) => ({ l: o.code, v: `${shortName(o)} · ${pct1(o.overallScore)}`, w: [78, 92, 140, 80, 80][n] })),
    issued,
  })
  f.newPage()
  const contentsPage = f.page()

  // ── Overall standing: one card per outlet ──
  f.chapter('Comparison', 'Overall standing', `${i.outlets.length} ${T.outlets}, side by side`, 'A')
  const cols = Math.min(4, Math.max(2, i.outlets.length))
  const gap = 7.5
  const w = (CW - gap * (cols - 1)) / cols
  i.outlets.forEach((o, n) => {
    const col = n % cols
    const top = f.y + Math.floor(n / cols) * 80
    if (col === 0) f.ensure(80)
    const x = L + col * (w + gap)
    const tone = tones.toneOf(o.overallScore)
    const t = TONE[tone]
    s.rrect(x, top, w, 72, 5, tone === 'none' ? C.neutral : t.fg)
    s.rrect(x, top + 0.75, w, 71.25, 5, tone === 'bad' ? C.redSoft : C.panel)
    s.rect(x + 0.6, top + 0.75, w - 1.2, 4, tone === 'bad' ? C.redSoft : C.panel)
    s.text(s.fit(shortName(o), w - 16, 's', 7.4), x + 8.4, top + 15.7, { f: 's', size: 7.4, color: C.slate })
    s.text(s.fit(o.brand, w - 16, 'r', 6.6), x + 8.4, top + 25.5, { size: 6.6, color: C.muted })
    s.text(pct1(o.overallScore), x + 8.4, top + 49, { f: 'b', size: 15, color: tone === 'none' ? C.ink : t.fg })
    s.text(`${o.riskRating}${o.rank ? ` · RANK #${o.rank}` : ''}`.toUpperCase(), x + 8.4, top + 62, { f: 's', size: 6.4, color: C.muted, ls: 0.08 })
  })
  f.y += Math.ceil(i.outlets.length / cols) * 80 + 18

  // ── KPI categories and metrics, outlet by outlet ──
  matrix(
    'KPI category comparison',
    CATEGORY_KEYS.map((k) => ({
      label: CATEGORY_LABELS[k],
      sub: `target ${i.kpiConfig.find((c) => c.key === k)?.target ?? 90}%`,
      cells: i.outlets.map((o) => {
        const v = o.categoryScores?.[k as CategoryKey]
        const val = v === undefined || v === null || Number.isNaN(v) ? null : v
        return { text: pct1(val), value: val }
      }),
    })),
  )
  matrix(
    'Performance metrics',
    i.metrics.map((m) => ({ label: m.label, cells: m.values.map((v) => ({ text: String(v ?? '—'), value: null })) })),
  )

  drawBackCover(f, assets.clientMark)
  f.contents.push({ group: 'C', label: 'About this report', page: f.page() })
  drawContents(
    f,
    contentsPage,
    [
      { key: 'A', title: 'COMPARISON' },
      { key: 'C', title: 'APPENDIX' },
    ],
    tones.toneOf,
  )
  drawFooters(f, `${T.Outlet} comparison`, issued)
  return doc

  /** Rows down, outlets across; scored cells carry their colour and a bar. */
  function matrix(title: string, rows: { label: string; sub?: string; cells: { text: string; value: number | null }[] }[]) {
    const labelW = 150
    const colW = (CW - labelW) / i.outlets.length
    const head = () => {
      // Outlet names as column heads, up to two lines each.
      const names = i.outlets.map((o) => s.wrap(shortName(o).toUpperCase(), colW - 8, 'b', 6.6).slice(0, 2))
      const lines = Math.max(...names.map((n) => n.length))
      s.text('MEASURE', 48.4, f.y + 7.5 + (lines - 1) * 8.5, { f: 'b', size: 6.6, color: C.muted, ls: 0.1 })
      names.forEach((nm, n) => nm.forEach((ln, k) => s.text(ln, L + labelW + (n + 1) * colW - 4, f.y + 7.5 + k * 8.5, { f: 'b', size: 6.6, color: C.muted, align: 'right', ls: 0.06 })))
      s.hline(L, f.y + 7.5 + (lines - 1) * 8.5 + 6.7, CW, C.ink, 0.75)
      f.y += 7.5 + (lines - 1) * 8.5 + 6.7 + 16
    }
    f.ensure(90)
    s.text(title, L, f.y + 12, { f: 'b', size: 11, color: C.ink })
    f.y += 33
    head()
    for (const r of rows) {
      const lines = s.wrap(r.label, labelW - 12, 's', 8.6)
      const rh = Math.max(lines.length * 11.5 + (r.sub ? 11 : 0), 18) + 12
      f.ensure(rh, () => {
        f.y -= 9
        head()
      })
      lines.forEach((ln, k) => s.text(ln, 48.4, f.y + k * 11.5, { f: 's', size: 8.6, color: C.ink }))
      if (r.sub) s.text(r.sub, 48.4, f.y + lines.length * 11.5, { size: 7, color: C.muted })
      r.cells.forEach((c, n) => {
        const right = L + labelW + (n + 1) * colW - 4
        const tone = c.value === null ? null : TONE[tones.toneOf(c.value)]
        s.text(s.fit(c.text, colW - 10, tone ? 'b' : 'r', 8.8), right, f.y, { f: tone ? 'b' : 'r', size: 8.8, color: tone ? tone.fg : C.ink, align: 'right' })
        if (tone && c.value !== null) {
          const bw = Math.min(70, colW - 14)
          s.rrect(right - bw, f.y + 5, bw, 3.5, 1.75, C.track)
          s.rrect(right - bw, f.y + 5, Math.max(3.5, (bw * c.value) / 100), 3.5, 1.75, tone.fg)
        }
      })
      s.hline(L, f.y + rh - 15.5, CW, C.line, 0.75)
      f.y += rh
    }
    f.y += 14
  }
}
