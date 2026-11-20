import { format } from 'date-fns'
import type { jsPDF } from 'jspdf'
import type { AnswerValue, AuditTemplate, Evidence, KpiConfig, Outlet, Question, Scenario, ScoreThreshold, Section, Shopper, Visit, VisitAnswer } from '@/types'
import { CATEGORY_KEYS, CATEGORY_LABELS, CRITICAL_COUNT_KEY, DEFAULT_THRESHOLDS } from '@/utils/scoring'
import { KPI_KIND_LABEL, formatKpiValue, stageRows, weightText } from '@/utils/sequence'
import { CLIENT } from '@/config/client'

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
}

/** The font files, base64-encoded: regular, italic, semibold, bold, extra-bold. */
export type InterFonts = Record<FontKey, string>
export const INTER_FILES: Record<FontKey, string> = { r: 'Inter-400.ttf', i: 'Inter-400i.ttf', s: 'Inter-600.ttf', b: 'Inter-700.ttf', x: 'Inter-800.ttf' }

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

// ─────────────────────────────── Design tokens ───────────────────────────────

type FontKey = 'r' | 'i' | 's' | 'b' | 'x'
type Rgb = [number, number, number]
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]

const C = {
  navy: hex('#173e8c'),
  ink: hex('#14213d'),
  ink2: hex('#0f1e3d'),
  slate: hex('#4a5672'),
  muted: hex('#7c879e'),
  faint: hex('#a8b1c2'),
  line: hex('#e3e8f0'),
  line2: hex('#e6eaf1'),
  panel: hex('#f5f7fb'),
  track: hex('#e8ecf3'),
  ringTrack: hex('#e6eaf2'),
  chip: hex('#f0f2f6'),
  neutral: hex('#c9d1de'),
  numeral: hex('#d3dae7'),
  orange: hex('#f56b26'),
  photoBg: hex('#fff0e8'),
  photoInk: hex('#c24f12'),
  green: hex('#1c9a5e'),
  blue: hex('#2f6fdb'),
  amber: hex('#e08a0b'),
  red: hex('#d63f2e'),
  greenSoft: hex('#e7f6ee'),
  blueSoft: hex('#e8f0fd'),
  amberSoft: hex('#fdf2e2'),
  redSoft: hex('#fceae7'),
  failRow: hex('#fdf6f5'),
  failBox: hex('#fdf4f3'),
  white: [255, 255, 255] as Rgb,
  photoDark: hex('#111111'),
}
type Tone = 'good' | 'fair' | 'warn' | 'bad' | 'none'
const TONE: Record<Tone, { fg: Rgb; bg: Rgb }> = {
  good: { fg: C.green, bg: C.greenSoft },
  fair: { fg: C.blue, bg: C.blueSoft },
  warn: { fg: C.amber, bg: C.amberSoft },
  bad: { fg: C.red, bg: C.redSoft },
  none: { fg: C.muted, bg: C.chip },
}

const PAGE_W = 595.28
const PAGE_H = 841.89
const L = 42.75
const CW = 510.75
const R = L + CW
/** Where content starts on a page that carries no chapter heading. */
const TOP = 45
/** The last baseline content may use before the footer. */
const BOTTOM = 788

// ─────────────────────────────── Small helpers ───────────────────────────────

const pct1 = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${v.toFixed(1)}%`)
const pct0 = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${Math.round(v)}%`)
const day = (d: string | null | undefined) => (d ? format(new Date(d), 'd MMM yyyy') : '—')
const dayTime = (d: string | null | undefined) => (d ? format(new Date(d), 'd MMM yyyy, HH:mm') : '—')
const clock = (d: string | null | undefined) => (d ? format(new Date(d), 'HH:mm') : '—')
const strip = (text: string) => text.replace(/\?$/, '')
const round = (n: number) => (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1))
/** Types whose answer says more than the score: shown as "Recorded: …" under the question. */
const ANSWER_WORTH_SHOWING = new Set<Question['type']>(['time', 'numeric', 'rating_5', 'rating_10', 'multiple_choice'])

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

// ─────────────────────────────── Drawing surface ───────────────────────────────

interface TextOpts {
  f?: FontKey
  size?: number
  color?: Rgb
  align?: 'left' | 'right' | 'center'
  /** Letter spacing, in em. */
  ls?: number
}

class Surface {
  readonly doc: jsPDF
  constructor(doc: jsPDF) {
    this.doc = doc
  }

  private set(f: FontKey, size: number) {
    this.doc.setFont(`Inter-${f}`, 'normal')
    this.doc.setFontSize(size)
  }
  width(s: string, f: FontKey, size: number, ls = 0) {
    this.set(f, size)
    return this.doc.getTextWidth(s) + (s.length > 1 ? ls * size * (s.length - 1) : 0)
  }
  text(s: string, x: number, y: number, o: TextOpts = {}) {
    const f = o.f ?? 'r'
    const size = o.size ?? 9
    const ls = o.ls ?? 0
    this.set(f, size)
    const c = o.color ?? C.ink
    this.doc.setTextColor(c[0], c[1], c[2])
    const w = this.width(s, f, size, ls)
    const x0 = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x
    this.doc.text(s, x0, y, ls ? { charSpace: ls * size } : undefined)
    return w
  }
  wrap(s: string, width: number, f: FontKey, size: number): string[] {
    this.set(f, size)
    return (this.doc.splitTextToSize(s, width) as string[]).map((l) => l.trimEnd())
  }
  /** One line that fits, with an ellipsis when it had to be cut. */
  fit(s: string, width: number, f: FontKey, size: number) {
    if (this.width(s, f, size) <= width) return s
    let t = s
    while (t.length > 1 && this.width(`${t}…`, f, size) > width) t = t.slice(0, -1)
    return `${t.trimEnd()}…`
  }
  fill(c: Rgb) {
    this.doc.setFillColor(c[0], c[1], c[2])
  }
  stroke(c: Rgb, w: number) {
    this.doc.setDrawColor(c[0], c[1], c[2])
    this.doc.setLineWidth(w)
  }
  rect(x: number, y: number, w: number, h: number, c: Rgb) {
    this.fill(c)
    this.doc.rect(x, y, w, h, 'F')
  }
  rrect(x: number, y: number, w: number, h: number, r: number, c: Rgb) {
    this.fill(c)
    this.doc.roundedRect(x, y, w, h, Math.min(r, h / 2, w / 2), Math.min(r, h / 2, w / 2), 'F')
  }
  rrectStroke(x: number, y: number, w: number, h: number, r: number, c: Rgb, lw = 0.75) {
    this.stroke(c, lw)
    this.doc.roundedRect(x, y, w, h, r, r, 'S')
  }
  hline(x: number, y: number, w: number, c: Rgb, h = 0.75) {
    this.rect(x, y, w, h, c)
  }
  circle(cx: number, cy: number, r: number, c: Rgb) {
    this.fill(c)
    this.doc.circle(cx, cy, r, 'F')
  }
  ring(cx: number, cy: number, r: number, c: Rgb, w: number) {
    this.stroke(c, w)
    this.doc.circle(cx, cy, r, 'S')
  }
  /** A thick arc from twelve o'clock, clockwise, with round ends. */
  arc(cx: number, cy: number, r: number, thickness: number, fraction: number, c: Rgb) {
    const f = Math.max(0, Math.min(1, fraction))
    if (f <= 0) return
    const ro = r + thickness / 2
    const ri = r - thickness / 2
    const steps = Math.max(8, Math.round(120 * f))
    const pts: [number, number][] = []
    for (let k = 0; k <= steps; k++) {
      const a = -Math.PI / 2 + 2 * Math.PI * f * (k / steps)
      pts.push([cx + ro * Math.cos(a), cy + ro * Math.sin(a)])
    }
    for (let k = steps; k >= 0; k--) {
      const a = -Math.PI / 2 + 2 * Math.PI * f * (k / steps)
      pts.push([cx + ri * Math.cos(a), cy + ri * Math.sin(a)])
    }
    this.polygon(pts, c)
    if (f < 1) {
      const end = -Math.PI / 2 + 2 * Math.PI * f
      this.circle(cx, cy - r, thickness / 2, c)
      this.circle(cx + r * Math.cos(end), cy + r * Math.sin(end), thickness / 2, c)
    }
  }
  polygon(pts: [number, number][], c: Rgb) {
    this.fill(c)
    const [x0, y0] = pts[0]
    const deltas = pts.slice(1).map((p, k) => [p[0] - pts[k][0], p[1] - pts[k][1]])
    this.doc.lines(deltas, x0, y0, [1, 1], 'F', true)
  }
  line(x1: number, y1: number, x2: number, y2: number, c: Rgb, w: number) {
    this.stroke(c, w)
    this.doc.setLineCap('round')
    this.doc.line(x1, y1, x2, y2)
    this.doc.setLineCap('butt')
  }
  image(data: string | null | undefined, kind: 'PNG' | 'JPEG', x: number, y: number, w: number, h: number) {
    if (!data) return false
    try {
      this.doc.addImage(data, kind, x, y, w, h, undefined, 'FAST')
      return true
    } catch {
      return false
    }
  }
  /** A pill with its text centred: the label is what sets the width unless one is given. */
  pill(label: string, x: number, y: number, o: { f?: FontKey; size: number; fg: Rgb; bg: Rgb; h: number; padX?: number; ls?: number; w?: number; align?: 'left' | 'right' }) {
    const f = o.f ?? 'b'
    const tw = this.width(label, f, o.size, o.ls ?? 0)
    const w = o.w ?? tw + 2 * (o.padX ?? 5)
    const x0 = o.align === 'right' ? x - w : x
    this.rrect(x0, y, w, o.h, o.h / 2.6, o.bg)
    this.text(label, x0 + w / 2, y + o.h / 2 + o.size * 0.36, { f, size: o.size, color: o.fg, align: 'center', ls: o.ls })
    return w
  }
}

// ─────────────────────────────── The report ───────────────────────────────

interface ContentsEntry {
  group: 'A' | 'B' | 'C'
  label: string
  page: number
  num?: string
  score?: number | null
}

/**
 * Builds the visit report. `JsPdf` is the jsPDF constructor, passed in so the
 * browser can load it lazily and the preview script can import it directly.
 */
export function buildVisitReport(JsPdf: typeof jsPDF, i: VisitReportData, assets: VisitReportAssets): jsPDF {
  const doc = new JsPdf({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true })
  for (const [key, file] of Object.entries(INTER_FILES)) {
    doc.addFileToVFS(file, assets.fonts[key as FontKey])
    doc.addFont(file, `Inter-${key}`, 'normal')
  }
  const s = new Surface(doc)
  const { visit, outlet, template } = i
  const bands = (i.thresholds?.length ? i.thresholds : DEFAULT_THRESHOLDS).slice().sort((a, b) => b.min - a.min)
  const seq = template?.sequence
  const issued = format(assets.issued, 'd MMM yyyy')
  const engagement = CLIENT.org.engagementName

  doc.setDocumentProperties({
    title: `Service Excellence Report · ${outlet.name} · ${visit.code}`,
    author: CLIENT.brand.name,
    subject: `${visit.type} · ${day(visit.visitDate)}`,
    creator: 'INSIGHT360',
  })

  // ── Tones follow the client's rating bands ──
  const bandOf = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? null : bands.find((b) => v >= b.min - 0.0001) ?? bands[bands.length - 1])
  const toneOf = (v: number | null | undefined): Tone => {
    const b = bandOf(v)
    if (!b) return 'none'
    const idx = bands.indexOf(b)
    return (['good', 'fair', 'warn', 'bad'] as Tone[])[Math.min(idx, 3)]
  }
  const bandRange = (b: ScoreThreshold) => (b.min === 0 ? `below ${Math.ceil(b.max)}%` : `${b.min}–${Math.ceil(b.max)}%`)

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

  // ── Page flow ──
  let y = TOP
  const plain = new Set<number>()
  const contents: ContentsEntry[] = []
  const page = () => doc.getNumberOfPages()
  const newPage = () => {
    doc.addPage()
    y = TOP
  }
  /** Room for `h` more points on this page, or a fresh page; `onBreak` redraws a running header. */
  const ensure = (h: number, onBreak?: () => void) => {
    if (y + h > BOTTOM) {
      newPage()
      onBreak?.()
      return true
    }
    return false
  }
  const chapter = (eyebrow: string, title: string, subtitle: string, group: ContentsEntry['group'], entry = title) => {
    newPage()
    s.text(eyebrow.toUpperCase(), L, 52.5, { f: 'b', size: 7, color: C.orange, ls: 0.16 })
    s.text(title, L, 77.25, { f: 'b', size: 21, color: C.ink })
    s.text(s.fit(subtitle, CW, 'r', 9), L, 94.5, { size: 9, color: C.slate })
    s.hline(L, 109.5, CW, C.ink, 1.5)
    y = 127.5
    contents.push({ group, label: entry, page: page() })
  }
  /** Column headings of a table, with the dark rule under them. */
  const tableHead = (cols: { label: string; x: number; align?: 'left' | 'right' | 'center' }[], top: number, size = 6.8) => {
    for (const c of cols) s.text(c.label, c.x, top, { f: 'b', size, color: C.muted, ls: 0.1, align: c.align })
    s.hline(L, top + 8.2, CW, C.ink, 0.75)
    return top + 8.2
  }

  // ═════════════════════════════ 1 · Cover ═════════════════════════════
  plain.add(1)
  drawCover()

  // ═════════════════════════════ 2 · Contents (filled in at the end) ═════════════════════════════
  newPage()
  const contentsPage = page()

  // ═════════════════════════════ Overview · Visit at a glance ═════════════════════════════
  chapter('Overview', 'Visit at a glance', `${outlet.name} · ${day(visit.visitDate)} · ${visit.type}`, 'A')
  drawGlance()

  // ═════════════════════════════ Overview · Section scores ═════════════════════════════
  chapter('Overview', 'Section scores & weighting', `Points, weight, score and contribution for all ${scored.length} audit sections`, 'A')
  drawSectionTable()

  // ═════════════════════════════ Overview · Visit details ═════════════════════════════
  chapter('Overview', 'Visit details', 'Mystery shopper visit information', 'A')
  drawDetails()

  // ═════════════════════════════ Overview · Main KPIs ═════════════════════════════
  if (seq?.mainKpis.length) {
    chapter('Overview', 'Main KPIs', `${seq.industry} · ${seq.serviceModel} · ${seq.visitMode}`, 'A')
    drawKpis()
  }

  // ═════════════════════════════ Overview · Summary & priorities ═════════════════════════════
  chapter('Overview', 'Summary & priorities', 'What the visit found, and where the points went', 'A')
  drawSummary()

  // ═════════════════════════════ Overview · Every point dropped ═════════════════════════════
  chapter('Overview', 'Every point dropped', 'All scored standards that did not receive full marks, grouped by section', 'A')
  drawDropped()

  // ═════════════════════════════ Detailed findings ═════════════════════════════
  drawFindings()

  // ═════════════════════════════ Evidence ═════════════════════════════
  if (photos.length) drawEvidence()

  // ═════════════════════════════ Back cover ═════════════════════════════
  newPage()
  plain.add(page())
  drawBack()
  contents.push({ group: 'C', label: 'About this report', page: page() })

  drawContents()
  drawFooters()
  return doc

  // ─────────────────────────────── Cover ───────────────────────────────
  function drawCover() {
    s.rect(0, 0, PAGE_W, PAGE_H, C.navy)
    // A soft glow from the top-right corner.
    for (let k = 0; k < 14; k++) s.circle(PAGE_W + 20, -40, 430 - k * 26, mix(C.navy, C.white, 0.012 + k * 0.0045))
    s.rect(0, 0, 14.25, PAGE_H, C.orange)

    // Programme mark and name.
    s.rrect(51, 57, 42.75, 42, 7, C.white)
    s.image(assets.clientMark, 'PNG', 55.5, 61.25, 33.75, 33.5)
    s.text(CLIENT.brand.name.toUpperCase(), 107.7, 74.2, { f: 'b', size: 8, color: C.white, ls: 0.17 })
    s.text(`${engagement} · ${visit.type}`.toUpperCase(), 107.7, 86.2, { f: 'r', size: 8, color: mix(C.navy, C.white, 0.78), ls: 0.08 })
    // The assessed company's own logo, top right.
    if (assets.brandMark) {
      s.rrect(484.5, 51, 60, 54, 8, C.white)
      s.image(assets.brandMark, 'PNG', 493.5, 57, 42, 42)
    }

    // The label pill and the title.
    const label = 'MYSTERY SHOPPING VISIT REPORT'
    const lw = s.width(label, 'b', 7.5, 0.16)
    s.rrectStroke(51.4, 190.1, lw + 21.5, 18.8, 9.4, C.orange, 0.75)
    s.text(label, 61.7, 202.5, { f: 'b', size: 7.5, color: C.orange, ls: 0.16 })
    s.text('Service', 51, 265.5, { f: 'b', size: 46, color: C.white, ls: -0.022 })
    s.text('Excellence', 51, 312.75, { f: 'b', size: 46, color: C.white, ls: -0.022 })
    s.text('Report', 51, 360, { f: 'b', size: 46, color: C.orange, ls: -0.022 })
    const sub = `${template?.name ?? 'Mystery shopping assessment'} · ${i.scenario ? `${i.scenario.name} scenario` : 'Standard visit'}`
    s.wrap(sub, 400, 'r', 10.5)
      .slice(0, 2)
      .forEach((ln, n) => s.text(ln, 51, 392.2 + n * 15, { size: 10.5, color: mix(C.navy, C.white, 0.85) }))

    // The score panel.
    s.rrect(51, 456.75, 493.5, 183.75, 10, mix(C.navy, C.white, 0.06))
    s.rrectStroke(51, 456.75, 493.5, 183.75, 10, mix(C.navy, C.white, 0.14), 0.75)
    s.ring(142.45, 548.25, 65.25, mix(C.navy, C.white, 0.22), 12)
    s.arc(142.45, 548.25, 65.25, 12, (visit.score ?? 0) / 100, C.orange)
    s.text(visit.score === null ? '—' : `${visit.score.toFixed(1)}%`, 142.45, 551.2, { f: 'b', size: 28.5, color: C.white, align: 'center', ls: -0.01 })
    s.text('OVERALL', 142.45 + 0.5, 570.8, { f: 's', size: 9, color: mix(C.navy, C.white, 0.85), align: 'center', ls: 0.12 })
    if (band) s.pill(`${band.label.toUpperCase()} · ${bandRange(band)}`, 240, 478.5, { size: 8, fg: C.white, bg: C.orange, h: 17.25, padX: 9.5, ls: 0.1 })
    const stats = [
      { x: 239.6, v: outlet.targetScore ? `${outlet.targetScore}%` : '—', l: 'TARGET' },
      { x: 304.4, v: `${round(totalPoints)}/${round(maxPoints)}`, l: 'POINTS' },
      { x: 402.4, v: String(criticalCount), l: 'CRITICAL FAILURES' },
    ]
    for (const st of stats) {
      s.text(st.v, st.x, 525, { f: 'b', size: 17, color: C.white })
      s.text(st.l, st.x, 541.5, { f: 's', size: 7, color: mix(C.navy, C.white, 0.68), ls: 0.09 })
    }
    s.wrap(i.summary, 288, 'r', 8.6)
      .slice(0, 6)
      .forEach((ln, n) => s.text(ln, 239.6, 563.2 + n * 12.9, { size: 8.6, color: mix(C.navy, C.white, 0.88) }))

    // What, where and when.
    s.hline(51, 669, 493.5, mix(C.navy, C.white, 0.2), 0.75)
    const meta = [
      { x: 51, w: 78, l: 'BRAND', v: outlet.brand },
      { x: 136.7, w: 92, l: 'OUTLET', v: outlet.name.replace(`${outlet.brand} – `, '') },
      { x: 236.8, w: 140, l: 'LOCATION', v: `${outlet.location}, ${outlet.region}` },
      { x: 386.9, w: 80, l: 'VISIT DATE', v: day(visit.visitDate) },
      { x: 472.7, w: 80, l: 'VISIT NO.', v: visit.code },
    ]
    for (const m of meta) {
      s.text(m.l, m.x, 690.8, { f: 's', size: 6.5, color: mix(C.navy, C.white, 0.62), ls: 0.14 })
      s.wrap(m.v, m.w, 'b', 9.5)
        .slice(0, 3)
        .forEach((ln, n) => s.text(ln, m.x, 705.8 + n * 13.4, { f: 'b', size: 9.5, color: C.white }))
    }
    s.text(`Confidential · Issued ${issued}`, 51, 810.8, { size: 7.5, color: mix(C.navy, C.white, 0.6) })
  }

  // ─────────────────────────────── Visit at a glance ───────────────────────────────
  function drawGlance() {
    const top = y
    s.rrectStroke(L + 0.35, top + 0.4, CW - 0.7, 154.5, 8, C.line, 0.75)
    const tone = TONE[toneOf(visit.score)]
    s.ring(116.95, top + 75.75, 51, C.ringTrack, 10.5)
    s.arc(116.95, top + 75.75, 51, 10.5, (visit.score ?? 0) / 100, tone.fg)
    s.text(pct1(visit.score), 116.95, top + 78.7, { f: 'b', size: 22.5, color: C.ink2, align: 'center', ls: -0.01 })
    s.text('OVERALL', 117.4, top + 93.7, { f: 's', size: 7.5, color: C.ink2, align: 'center', ls: 0.12 })

    // Rating, then the bar with its bands, the score and the target.
    if (band) {
      const w = s.pill(band.label, 195.75, top + 18, { f: 'b', size: 10, fg: tone.fg, bg: tone.bg, h: 20.25, padX: 11 })
      s.text(`Rating band ${bandRange(band)}`, 195.75 + w + 8.5, top + 30.7, { size: 8.5, color: C.muted })
    }
    const bx = 195.75
    const bw = 339.75
    const by = top + 69
    const xAt = (v: number) => bx + (bw * Math.max(0, Math.min(100, v))) / 100
    const asc = [...bands].sort((a, b) => a.min - b.min)
    asc.forEach((b, n) => {
      const x0 = xAt(b.min)
      const x1 = n === asc.length - 1 ? bx + bw : xAt(asc[n + 1].min)
      const c = mix(TONE[toneOf(b.min)].fg, C.white, 0.12)
      if (n === 0) s.rrect(x0, by, x1 - x0, 9, 4.5, c)
      else if (n === asc.length - 1) s.rrect(x0, by, x1 - x0, 9, 4.5, c)
      else s.rect(x0, by, x1 - x0, 9, c)
      if (n > 0 && n < asc.length - 1) s.rect(x0, by, x1 - x0, 9, c)
    })
    // Square the inner ends of the rounded first and last segments.
    if (asc.length > 1) {
      s.rect(xAt(asc[1].min) - 5, by, 5, 9, mix(TONE[toneOf(asc[0].min)].fg, C.white, 0.12))
      s.rect(xAt(asc[asc.length - 1].min), by, 5, 9, mix(TONE[toneOf(asc[asc.length - 1].min)].fg, C.white, 0.12))
    }
    s.text('0%', bx, by + 20.3, { size: 6.8, color: C.muted })
    asc.slice(1).forEach((b) => s.text(`${b.min}%`, xAt(b.min), by + 20.3, { size: 6.8, color: C.muted, align: 'center' }))
    s.text('100%', bx + bw, by + 20.3, { size: 6.8, color: C.muted, align: 'right' })
    // The score and the target each get a marker; their labels sit either side
    // of the pair so they never overprint when the two are close.
    const xs = visit.score !== null ? xAt(visit.score) : null
    const xt = outlet.targetScore ? xAt(outlet.targetScore) : null
    if (xs !== null) s.rect(xs - 0.75, by - 5.25, 1.5, 19.5, C.ink)
    if (xt !== null) for (let dy = 0; dy < 19.5; dy += 3.25) s.rect(xt - 0.75, by - 5.25 + dy, 1.5, 1.9, C.slate)
    const scoreLabel = pct1(visit.score)
    const targetLabel = `Target ${outlet.targetScore}%`
    if (xs !== null && xt !== null) {
      const scoreFirst = xs <= xt
      const lo = scoreFirst ? xs : xt
      const hi = scoreFirst ? xt : xs
      const loLabel = scoreFirst ? scoreLabel : targetLabel
      const hiLabel = scoreFirst ? targetLabel : scoreLabel
      const loW = s.width(loLabel, 'b', 7.5)
      const hiW = s.width(hiLabel, 'b', 7.5)
      let loX = lo - loW / 2
      let hiX = hi - hiW / 2
      if (loX + loW + 6 > hiX) {
        loX = Math.min(lo, hi) - 3 - loW
        hiX = Math.max(lo, hi) + 3
      }
      hiX = Math.min(hiX, bx + bw + 14 - hiW)
      s.text(loLabel, loX, by - 9, { f: scoreFirst ? 'b' : 's', size: 7.5, color: scoreFirst ? C.ink : C.slate })
      s.text(hiLabel, hiX, by - 9, { f: scoreFirst ? 's' : 'b', size: 7.5, color: scoreFirst ? C.slate : C.ink })
    } else if (xs !== null) s.text(scoreLabel, xs, by - 9, { f: 'b', size: 7.5, color: C.ink, align: 'center' })
    else if (xt !== null) s.text(targetLabel, xt, by - 9, { f: 's', size: 7.5, color: C.slate, align: 'center' })
    const stats = [
      { v: `${round(totalPoints)} / ${round(maxPoints)}`, l: 'points scored', c: C.ink },
      { v: String(assessedSections.length), l: 'sections assessed', c: C.ink },
      { v: String(criticalCount), l: 'critical failures', c: criticalCount ? C.red : C.green },
      { v: csat, l: 'customer satisfaction', c: C.ink },
    ]
    stats.forEach((st, n) => {
      s.text(st.v, 195.7 + n * 87.1, top + 119.3, { f: 'b', size: 13.5, color: st.c })
      s.text(st.l, 195.7 + n * 87.1, top + 134.3, { size: 7.4, color: C.muted })
    })

    // KPI category scores, three to a row.
    y = top + 183.7
    s.text('KPI category scores', L, y, { f: 'b', size: 11, color: C.ink })
    const colW = 159
    const colX = [L, 219, 394.5]
    CATEGORY_KEYS.forEach((k, n) => {
      const x = colX[n % 3]
      const ry = y + 30 + Math.floor(n / 3) * 57
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
    y += 30 + Math.ceil(CATEGORY_KEYS.length / 3) * 57 + 0.5

    // Where the points went, and where none did.
    const lowest = assessedSections.filter((r) => (r.score ?? 100) < 100).sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).slice(0, 5)
    const full = assessedSections.filter((r) => (r.score ?? 0) >= 99.95).slice(0, 6)
    const rows = Math.max(lowest.length, full.length, 1)
    const ph = 46 + rows * 21.75 - 6.5
    const panel = (x: number, title: string, color: Rgb, items: typeof lowest, empty: string) => {
      s.rrect(x, y, 249.75, ph, 7, C.panel)
      s.text(title, x + 14.2, y + 21, { f: 'b', size: 8, color, ls: 0.1 })
      if (!items.length) s.text(empty, x + 14.2, y + 45, { size: 8.6, color: C.muted })
      items.forEach((r, n) => {
        const ry = y + 45 + n * 21.75
        const t = TONE[toneOf(r.score)]
        s.text(s.fit(r.sec.title, 180, 'r', 8.6), x + 14.2, ry, { size: 8.6, color: C.ink })
        s.pill(pct0(r.score), x + 235.5, ry - 9.75, { size: 7.5, fg: t.fg, bg: t.bg, h: 13.5, padX: 7, align: 'right' })
        if (n < items.length - 1) s.hline(x + 14.2, ry + 7.5, 221.25, C.line2, 0.75)
      })
    }
    panel(L, 'LOWEST-SCORING SECTIONS', C.red, lowest, 'Every assessed section scored full marks.')
    panel(303.75, 'FULL MARKS', C.green, full, 'No section scored full marks.')
    y += ph
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
      y = tableHead(cols, y + 7.5) + 15.8
    }
    head()
    scored.forEach((r, n) => {
      ensure(26, head)
      const t = TONE[toneOf(r.score)]
      const none = r.score === null
      s.text(String(n + 1), 48.4, y, { size: 8.8, color: C.muted })
      s.text(s.fit(r.sec.title, 175, 'r', 8.8), 71.1, y, { size: 8.8, color: C.ink })
      s.text(`${round(r.points.got)} / ${round(r.points.max)}`, 298.5, y, { size: 8.8, color: C.ink, align: 'right' })
      s.text(r.weight === null || r.weight === 0 || none ? '—' : `${weightText(r.weight)}%`, 342.8, y, { size: 8.8, color: C.ink, align: 'right' })
      s.rrect(354, y - 4.5, 73.5, 4.5, 2.25, C.track)
      if (!none && r.score! > 0) s.rrect(354, y - 4.5, Math.max(1, (73.5 * r.score!) / 100), 4.5, 2.25, t.fg)
      s.text(none ? '—' : pct1(r.score), 473.5, y, { f: none ? 'r' : 'b', size: 8.8, color: none ? C.muted : t.fg, align: 'right' })
      s.text(r.contribution === null ? '—' : `${r.contribution.toFixed(1)} pts`, 547.8, y, { size: 8.8, color: C.ink, align: 'right' })
      s.hline(L, y + 9.75, CW, C.line, 0.75)
      y += 25.5
    })
    ensure(26)
    y += 3
    const t = TONE[toneOf(visit.score)]
    s.text('Total · visit score', 71.1, y, { f: 'b', size: 8.8, color: C.ink })
    s.text(`${round(totalPoints)} / ${round(maxPoints)}`, 298.5, y, { f: 'b', size: 8.8, color: C.ink, align: 'right' })
    s.rrect(354, y - 4.5, 73.5, 4.5, 2.25, C.track)
    if (visit.score) s.rrect(354, y - 4.5, (73.5 * visit.score) / 100, 4.5, 2.25, t.fg)
    s.text(pct1(visit.score), 473.5, y, { f: 'b', size: 8.8, color: C.ink, align: 'right' })
    s.text(seq ? `${(visit.score ?? 0).toFixed(1)} pts` : '—', 547.8, y, { f: 'b', size: 8.8, color: C.ink, align: 'right' })
    y += 23

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
    ensure(h)
    s.rrect(L + 1.1, y, CW - 1.1, h, 5, C.panel)
    s.rect(L, y, 2.25, h, C.orange)
    let ly = y + 19.5
    s.text(lead, 57.8, ly, { f: 'b', size: 8.4, color: C.ink })
    s.text(first, 57.8 + leadW + 2.4, ly, { size: 8.4, color: C.slate })
    for (const ln of rest) s.text(ln, 57.8, (ly += 12), { size: 8.4, color: C.slate })
    s.text(tail, 57.8, (ly += 12), { size: 8.4, color: C.muted })
    y += h
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
      const ry = y + 15 + Math.floor(n / 2) * 26.25
      const lw = s.text(label.toUpperCase(), x, ry, { f: 's', size: 7.2, color: C.muted, ls: 0.1 })
      s.text(s.fit(value, colW - lw - 12, 's', 9), x + colW, ry + 1.5, { f: 's', size: 9, color: C.ink, align: 'right' })
      s.hline(x, ry + 9.4, colW, C.line, 0.75)
    })
    y += 15 + Math.ceil(pairs.length / 2) * 26.25
  }

  // ─────────────────────────────── Main KPIs ───────────────────────────────
  function drawKpis() {
    if (!seq) return
    const w = 122.25
    const gap = 7.5
    seq.mainKpis.forEach((k, n) => {
      const col = n % 4
      const rowTop = y + Math.floor(n / 4) * 70.5
      if (col === 0) ensure(64)
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
    y += Math.ceil(seq.mainKpis.length / 4) * 70.5 + 2
    ensure(14)
    const legend: [Rgb, string][] = [
      [C.green, `Score / compliance ≥ ${bands[0]?.min ?? 90}%`],
      [C.blue, `${bands[1]?.min ?? 80}–${bands[0]?.min ?? 90}%`],
      [C.amber, `${bands[2]?.min ?? 70}–${bands[1]?.min ?? 80}%`],
      [C.red, `Below ${bands[2]?.min ?? 70}%`],
      [C.neutral, 'Timing, satisfaction or not recorded'],
    ]
    let lx = L
    for (const [c, label] of legend) {
      s.circle(lx + 3.4, y + 9.4, 3.4, c)
      lx += 11 + s.text(label, lx + 11, y + 11.5, { size: 7.4, color: C.slate }) + 13
    }
    y += 20
  }

  // ─────────────────────────────── Summary & priorities ───────────────────────────────
  function drawSummary() {
    // Executive summary.
    const lines = s.wrap(i.summary, 482, 'r', 9.6)
    const h = 42 + (lines.length - 1) * 15 + 17.2
    s.rrect(L, y, CW, h, 7, C.panel)
    s.text('EXECUTIVE SUMMARY', 56.9, y + 21, { f: 'b', size: 8, color: C.ink, ls: 0.1 })
    lines.forEach((ln, n) => s.text(ln, 56.9, y + 42 + n * 15, { size: 9.6, color: C.ink }))
    y += h + 27.8

    // Priority improvements.
    if (improvements.length) {
      ensure(60)
      s.text('Priority improvements', L, y, { f: 'b', size: 11, color: C.ink })
      const cols = [
        { label: '#', x: 48.4 },
        { label: 'STANDARD', x: 70.7 },
        { label: 'ANSWER', x: 286.5 },
        { label: 'SHOPPER COMMENT', x: 337.4 },
      ]
      const head = () => {
        y = tableHead(cols, y + 21) + 16
      }
      head()
      improvements.forEach((r, n) => {
        const std = s.wrap(strip(r.q.text), 208, 'r', 8.5)
        const com = r.a?.comment?.trim() ? s.wrap(`“${r.a.comment.trim()}”`, 210, 'r', 8.5) : ['—']
        const lines = Math.max(std.length, com.length)
        const rh = lines * 12 + 12.7
        ensure(rh, head)
        s.text(String(n + 1), 48.4, y, { size: 8.5, color: C.muted })
        std.forEach((ln, k) => s.text(ln, 70.7, y + k * 12, { size: 8.5, color: C.ink }))
        s.text(answerText(r.q, r.a!.value, r.a!.na), 286.5, y, { f: 's', size: 8.5, color: C.red })
        com.forEach((ln, k) => s.text(ln, 337.4, y + k * 12, { f: com[0] === '—' ? 'r' : 'i', size: 8.5, color: C.slate }))
        s.hline(L, y + (lines - 1) * 12 + 7.2, CW, C.line, 0.75)
        y += rh
      })
      y += 12
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
    if (ensure(ph)) y = TOP
    if (posItems.length) {
      s.rrect(L, y, 249.75, ph, 7, C.panel)
      s.text('POSITIVE OBSERVATIONS', 56.9, y + 21, { f: 'b', size: 8, color: C.green, ls: 0.1 })
      let iy = y + 43.5
      posItems.forEach((lines) => {
        check(60.6, iy - 3, C.green)
        lines.forEach((ln, k) => s.text(ln, 71.1, iy + k * 12, { size: 8.5, color: C.ink }))
        iy += lines.length * 12 + 6
      })
    }
    if (crit.length) {
      const x = posItems.length ? 303.75 : L
      s.rrect(x, y, 249.75, ph, 7, C.panel)
      s.text('CRITICAL FAILURE CHECKLIST', x + 14.25, y + 21, { f: 'b', size: 8, color: C.ink, ls: 0.1 })
      let iy = y + 42
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
    y += ph + 14.5

    // The shopper's own account.
    if (visit.narrative?.trim()) {
      const paras = visit.narrative
        .split(/\n\s*\n|\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => s.wrap(p, 476, 'r', 9.2))
      const h = 42 + paras.reduce((n, p) => n + p.length * 14.7 + 5.5, 0) - 5.5 + 2
      ensure(Math.min(h, BOTTOM - TOP))
      s.rrect(L + 1.1, y, CW - 1.1, h, 6, C.panel)
      s.rect(L, y, 2.25, h, C.navy)
      s.text('SHOPPER NARRATIVE', 59.2, y + 21, { f: 'b', size: 8, color: C.ink, ls: 0.1 })
      let py = y + 42
      for (const p of paras) {
        for (const ln of p) {
          s.text(ln, 59.2, py, { size: 9.2, color: C.ink })
          py += 14.7
        }
        py += 5.5
      }
      y += h
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
      y = tableHead(cols, y + 7.5)
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
      s.text('Every scored standard received full marks.', 48.4, y + 18, { size: 8.6, color: C.green })
      y += 30
      return
    }
    for (const g of groups) {
      ensure(24 + 30, head)
      s.rect(L, y + 0.75, CW, 23.25, C.panel)
      s.text(`${g.n + 1}. ${g.r.sec.title}`, 48.4, y + 15.8, { f: 'b', size: 8.4, color: C.ink })
      s.text(`${round(g.r.points.got)}/${round(g.r.points.max)} pts · ${pct0(g.r.score)}`, 547.8, y + 15.8, { size: 8.4, color: C.muted, align: 'right' })
      y += 24 + 15
      for (const x of g.items) {
        const std = s.wrap(x.q.text, 236, 'r', 8.4)
        const shown = answerText(x.q, x.a!.value, x.a!.na)
        const note = x.a?.comment?.trim() ? `“${x.a.comment.trim()}”` : ANSWER_WORTH_SHOWING.has(x.q.type) ? `Recorded: ${shown}` : '—'
        const com = s.wrap(note, 178, 'r', 8.4)
        const lines = Math.max(std.length, com.length)
        const rh = lines * 12 + 12.75
        ensure(rh, () => {
          head()
          y += 15
        })
        s.text(x.q.code, 48.4, y, { f: 's', size: 8.4, color: C.navy })
        std.forEach((ln, k) => s.text(ln, 88.7, y + k * 12, { size: 8.4, color: C.ink }))
        s.text(`${round(x.a!.score! * x.q.weight)} / ${round(x.q.weight)}`, 361.5, y, { f: 's', size: 8.4, color: C.ink, align: 'right' })
        com.forEach((ln, k) => s.text(ln, 372.9, y + k * 12, { f: note.startsWith('“') ? 'i' : 'r', size: 8.4, color: C.slate }))
        s.hline(L, y + (lines - 1) * 12 + 7.5, CW, C.line, 0.75)
        y += rh
      }
      y -= 15
    }
  }

  // ─────────────────────────────── Detailed findings ───────────────────────────────
  function drawFindings() {
    newPage()
    const firstPage = page()
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
    y = 91.5

    const cols = [
      { label: 'REF.', x: 67.4 },
      { label: 'AUDIT QUESTION', x: 107.1 },
      { label: 'MAX', x: 486.1, align: 'right' as const },
      { label: 'SCORE', x: 548.5, align: 'right' as const },
    ]
    const contHead = () => {
      y = tableHead(cols, 41.5, 6.6) + 15.8
    }

    scored.forEach((r, n) => {
      // A section opens with its heading and at least one question on the same page.
      if (y + 100.5 + 34 > BOTTOM) newPage()
      if (n === 0) contents.push({ group: 'B', label: r.sec.title, page: firstPage, num: String(n + 1).padStart(2, '0'), score: r.score })
      else contents.push({ group: 'B', label: r.sec.title, page: page(), num: String(n + 1).padStart(2, '0'), score: r.score })
      const top = y
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
      y = tableHead(cols, top + 78, 6.6) + 15.8

      for (const row of rowsOf(r.qs)) questionRow(row, contHead)
      y += 26
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

    ensure(rowH - 6, contHead)
    const base = y
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
    y = base + rowH
  }

  // ─────────────────────────────── Evidence ───────────────────────────────
  function drawEvidence() {
    chapter('Evidence', 'Evidence photographs', 'Visual documentation captured during the visit, in audit-section order', 'C')
    const w = 249.75
    const imgH = 153.75
    const cardH = 201.75
    photos.forEach((p, n) => {
      const col = n % 2
      if (col === 0 && n > 0) {
        y += cardH + 10.5
        if (y + cardH > BOTTOM + 10) {
          newPage()
          y = TOP - 10
        }
      }
      const x = col === 0 ? 43.1 : 303.4
      const e = p.e
      s.rrect(x + 0.4, y + 0.35, w - 0.8, imgH, 5, C.photoDark)
      s.rect(x + 0.4, y + 6, w - 0.8, imgH - 5.65, C.photoDark)
      const img = assets.photos.get(e.id)
      if (!s.image(img, 'JPEG', x + 0.4, y + 0.35, w - 0.8, imgH)) {
        s.text(e.type === 'Video' ? 'VIDEO ON FILE' : 'CAPTURE ON FILE', x + w / 2, y + imgH / 2 + 3, { f: 'b', size: 7.5, color: C.faint, align: 'center', ls: 0.16 })
      }
      s.rrectStroke(x, y, w, cardH, 6, C.line, 0.75)
      s.pill(`E${n + 1}`, x + 6.4, y + 6.3, { f: 'b', size: 7, fg: C.white, bg: C.orange, h: 12, padX: 5 })
      const q = p.qid ? i.questions.find((x) => x.id === p.qid) : undefined
      const sec = q ? scored.findIndex((r) => r.sec.id === q.sectionId) : -1
      const secLabel = sec >= 0 ? `${sec + 1}. ${scored[sec].sec.title}`.toUpperCase() : 'GENERAL'
      s.text(s.fit(secLabel, w - 18, 'b', 6.4), x + 8.9, y + imgH + 12, { f: 'b', size: 6.4, color: C.orange, ls: 0.1 })
      s.text(s.fit(e.title || q?.text || e.type, w - 18, 'b', 8.3), x + 8.9, y + imgH + 24.75, { f: 'b', size: 8.3, color: C.ink })
      const meta = `${e.type} · ${dayTime(e.photoTakenAt ?? e.capturedAt)}${q ? ' · ' : ' · No question reference'}`
      const mw = s.text(meta, x + 8.9, y + imgH + 36.75, { size: 7, color: C.muted })
      if (q) s.text(q.code, x + 8.9 + mw, y + imgH + 36.75, { f: 'b', size: 7, color: C.navy })
    })
    y += cardH
  }

  // ─────────────────────────────── Back cover ───────────────────────────────
  function drawBack() {
    s.rect(0, 0, PAGE_W, PAGE_H, C.navy)
    for (let k = 0; k < 14; k++) s.circle(PAGE_W + 20, -40, 430 - k * 26, mix(C.navy, C.white, 0.012 + k * 0.0045))
    s.rect(0, 0, 14.25, PAGE_H, C.orange)
    s.rrect(51, 467.25, 42.75, 42.75, 7, C.white)
    s.image(assets.clientMark, 'PNG', 55.5, 471.75, 33.75, 33.75)
    const gw = s.text('Get in ', 51, 579, { f: 'b', size: 44, color: C.white, ls: -0.02 })
    s.text('touch', 51 + gw, 579, { f: 'b', size: 44, color: C.orange, ls: -0.02 })
    s.text(CLIENT.brand.name, 51, 627.8, { f: 'b', size: 13, color: C.white })
    const start = format(new Date(CLIENT.org.engagementStart), 'MMM yyyy')
    const end = format(new Date(CLIENT.org.engagementEnd), 'MMM yyyy')
    ;[engagement, `Programme period ${start} – ${end}`, `${CLIENT.org.timezone} · reporting in ${CLIENT.org.currency}`].forEach((ln, n) =>
      s.text(ln, 51, 646.5 + n * 18.75, { size: 11, color: mix(C.navy, C.white, 0.85) }),
    )
    s.hline(51, 717, 261.75, mix(C.navy, C.white, 0.25), 0.75)
    s.text('Issued by INSIGHT360 · Mystery Shopping Intelligence Platform', 51, 741, { size: 8.5, color: mix(C.navy, C.white, 0.65) })
    s.text('This report is confidential and intended for the named client only.', 51, 756.8, { size: 8.5, color: mix(C.navy, C.white, 0.65) })
  }

  // ─────────────────────────────── Contents ───────────────────────────────
  function drawContents() {
    doc.setPage(contentsPage)
    s.text('CONTENTS', L, 52.5, { f: 'b', size: 7, color: C.orange, ls: 0.16 })
    s.text('What’s in this report', L, 77.25, { f: 'b', size: 21, color: C.ink })
    s.text('Every entry is clickable.', L, 94.5, { size: 9, color: C.slate })
    s.hline(L, 109.5, CW, C.ink, 1.5)
    const groups: { key: ContentsEntry['group']; title: string }[] = [
      { key: 'A', title: 'OVERVIEW' },
      { key: 'B', title: `DETAILED FINDINGS · ${scored.length} AUDIT SECTIONS` },
      { key: 'C', title: 'EVIDENCE & APPENDIX' },
    ]
    const total = contents.length
    // Rows tighten when a questionnaire has more sections than one page holds at the designed pitch.
    const pitch = Math.min(1, 620 / (total * 21.5 + groups.length * 40))
    let cy = 127.5
    for (const g of groups) {
      const entries = contents.filter((c) => c.group === g.key)
      if (!entries.length) continue
      s.rrect(L, cy, 14.25, 14.25, 3, C.navy)
      s.text(g.key, L + 7.1, cy + 9.75, { f: 'b', size: 7, color: C.white, align: 'center' })
      s.text(g.title, 62.6, cy + 9.75, { f: 'b', size: 8, color: C.navy, ls: 0.1 })
      cy += 29.25 * pitch
      for (const e of entries) {
        const rowH = (g.key === 'B' ? 20.6 : 23.25) * pitch
        if (e.num) {
          s.text(e.num, L, cy, { size: 6.9, color: C.muted })
          s.text(s.fit(e.label, 400, 'r', 6.9), 62.6, cy, { size: 6.9, color: C.slate })
          const t = TONE[toneOf(e.score)]
          s.pill(e.score === null || e.score === undefined ? '—' : pct0(e.score), 528, cy - 5.25, { f: 'b', size: 7, fg: e.score === null ? C.muted : t.fg, bg: e.score === null ? C.chip : t.bg, h: 12, w: 31.5, align: 'right' })
          s.text(String(e.page), R, cy + 3.75, { f: 'b', size: 8.6, color: C.navy, align: 'right' })
        } else {
          s.text(e.label, L, cy, { size: 6.9, color: C.slate })
          s.text(String(e.page), R, cy + 3.75, { f: 'b', size: 9.5, color: C.navy, align: 'right' })
        }
        doc.link(L, cy - rowH + 8, CW, rowH, { pageNumber: e.page })
        s.hline(L, cy + 8.25 * pitch + 3.75, CW, C.line, 0.75)
        cy += rowH
      }
      cy += 12 * pitch
    }
  }

  // ─────────────────────────────── Footers ───────────────────────────────
  function drawFooters() {
    const n = page()
    const right = `${CLIENT.brand.name.toUpperCase()} · ${engagement} · ${visit.code}`
    for (let p = 1; p <= n; p++) {
      if (plain.has(p)) continue
      doc.setPage(p)
      s.hline(L - 0.25, 805.6, CW - 0.5, C.line, 0.6)
      s.text(`Confidential · ${issued}`, L - 0.25, 817.9, { size: 6.8, color: C.muted })
      s.text(right, 514.8, 817.9, { size: 6.8, color: C.muted, align: 'right' })
      s.rrect(522.75, 809.4, 30, 13, 3, C.orange)
      s.text(String(p), 537.75, 818.4, { f: 'b', size: 7, color: C.white, align: 'center' })
    }
  }
}
