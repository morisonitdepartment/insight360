import { format } from 'date-fns'
import type { jsPDF } from 'jspdf'
import type { AnswerValue, Question, ScoreThreshold } from '@/types'
import { DEFAULT_THRESHOLDS } from '@/utils/scoring'
import { CLIENT } from '@/config/client'

/**
 * The look every INSIGHT360 report shares: Inter on A4 in points, the navy
 * cover with the orange edge, chapter headings, tables with pill statuses, the
 * clickable contents page, the closing page and the footer band.
 *
 * Drawn to the design the client signed off on the MS-26-0002 visit report
 * (19 Nov 2026). Nothing here touches the DOM: the same code renders in the
 * browser and in a script.
 */

export type FontKey = 'r' | 'i' | 's' | 'b' | 'x'
/** The font files, base64-encoded: regular, italic, semibold, bold, extra-bold. */
export type InterFonts = Record<FontKey, string>
export const INTER_FILES: Record<FontKey, string> = { r: 'Inter-400.ttf', i: 'Inter-400i.ttf', s: 'Inter-600.ttf', b: 'Inter-700.ttf', x: 'Inter-800.ttf' }

// ─────────────────────────────── Design tokens ───────────────────────────────

export type Rgb = [number, number, number]
export const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]

export const C = {
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
export type Tone = 'good' | 'fair' | 'warn' | 'bad' | 'none'
export const TONE: Record<Tone, { fg: Rgb; bg: Rgb }> = {
  good: { fg: C.green, bg: C.greenSoft },
  fair: { fg: C.blue, bg: C.blueSoft },
  warn: { fg: C.amber, bg: C.amberSoft },
  bad: { fg: C.red, bg: C.redSoft },
  none: { fg: C.muted, bg: C.chip },
}

export const PAGE_W = 595.28
export const PAGE_H = 841.89
export const L = 42.75
export const CW = 510.75
export const R = L + CW
/** Where content starts on a page that carries no chapter heading. */
export const TOP = 45
/** The last baseline content may use before the footer. */
export const BOTTOM = 788

// ─────────────────────────────── Small helpers ───────────────────────────────

export const pct1 = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${v.toFixed(1)}%`)
export const pct0 = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${Math.round(v)}%`)
export const day = (d: string | null | undefined) => (d ? format(new Date(d), 'd MMM yyyy') : '—')
export const dayTime = (d: string | null | undefined) => (d ? format(new Date(d), 'd MMM yyyy, HH:mm') : '—')
export const clock = (d: string | null | undefined) => (d ? format(new Date(d), 'HH:mm') : '—')
export const strip = (text: string) => text.replace(/\?$/, '')
export const round = (n: number) => (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1))
/** Types whose answer says more than the score: shown as "Recorded: …" under the question. */
export const ANSWER_WORTH_SHOWING = new Set<Question['type']>(['time', 'numeric', 'rating_5', 'rating_10', 'multiple_choice'])

export function answerText(q: Question, v: AnswerValue, na: boolean): string {
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

export interface TextOpts {
  f?: FontKey
  size?: number
  color?: Rgb
  align?: 'left' | 'right' | 'center'
  /** Letter spacing, in em. */
  ls?: number
}

export class Surface {
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

// ─────────────────────────────── Rating bands ───────────────────────────────

/** Colours follow the client's rating bands: best band green, then blue, amber, red. */
export function makeTones(thresholds?: ScoreThreshold[]) {
  const bands = (thresholds?.length ? thresholds : DEFAULT_THRESHOLDS).slice().sort((a, b) => b.min - a.min)
  const bandOf = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? null : bands.find((b) => v >= b.min - 0.0001) ?? bands[bands.length - 1])
  const toneOf = (v: number | null | undefined): Tone => {
    const b = bandOf(v)
    if (!b) return 'none'
    return (['good', 'fair', 'warn', 'bad'] as Tone[])[Math.min(bands.indexOf(b), 3)]
  }
  const bandRange = (b: ScoreThreshold) => (b.min === 0 ? `below ${Math.ceil(b.max)}%` : `${b.min}–${Math.ceil(b.max)}%`)
  return { bands, bandOf, toneOf, bandRange }
}

// ─────────────────────────────── Page flow ───────────────────────────────

export interface ContentsEntry {
  group: string
  label: string
  page: number
  /** A numbered line ("01") with a score pill, as for an audit section. */
  num?: string
  score?: number | null
}

/**
 * The document and a pen that moves down the page: new pages, room checks,
 * chapter headings and the entries the contents page is built from.
 */
export class ReportFlow {
  readonly doc: jsPDF
  readonly s: Surface
  y = TOP
  /** Pages without a footer: the covers. */
  readonly plain = new Set<number>()
  readonly contents: ContentsEntry[] = []

  constructor(JsPdf: typeof jsPDF, fonts: InterFonts) {
    this.doc = new JsPdf({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true })
    for (const [key, file] of Object.entries(INTER_FILES)) {
      this.doc.addFileToVFS(file, fonts[key as FontKey])
      this.doc.addFont(file, `Inter-${key}`, 'normal')
    }
    this.s = new Surface(this.doc)
  }

  page() {
    return this.doc.getNumberOfPages()
  }
  newPage() {
    this.doc.addPage()
    this.y = TOP
  }
  /** Room for `h` more points on this page, or a fresh page; `onBreak` redraws a running header. */
  ensure(h: number, onBreak?: () => void) {
    if (this.y + h > BOTTOM) {
      this.newPage()
      onBreak?.()
      return true
    }
    return false
  }
  /** A new page with the orange eyebrow, the title, the subtitle and the dark rule. */
  chapter(eyebrow: string, title: string, subtitle: string, group: string, entry = title) {
    this.newPage()
    const s = this.s
    s.text(eyebrow.toUpperCase(), L, 52.5, { f: 'b', size: 7, color: C.orange, ls: 0.16 })
    s.text(title, L, 77.25, { f: 'b', size: 21, color: C.ink })
    s.text(s.fit(subtitle, CW, 'r', 9), L, 94.5, { size: 9, color: C.slate })
    s.hline(L, 109.5, CW, C.ink, 1.5)
    this.y = 127.5
    this.contents.push({ group, label: entry, page: this.page() })
  }
  /** Column headings of a table, with the dark rule under them. */
  tableHead(cols: { label: string; x: number; align?: 'left' | 'right' | 'center' }[], top: number, size = 6.8) {
    for (const c of cols) this.s.text(c.label, c.x, top, { f: 'b', size, color: C.muted, ls: 0.1, align: c.align })
    this.s.hline(L, top + 8.2, CW, C.ink, 0.75)
    return top + 8.2
  }
}

// ─────────────────────────────── Tables ───────────────────────────────

export interface PillCol<T> {
  label: string
  x: number
  w: number
  align?: 'right'
  text?: (r: T) => string
  strong?: boolean
  /** A reference code, in navy. */
  code?: boolean
  color?: (r: T) => Rgb | undefined
  pill?: (r: T) => { label: string; tone: Tone }
}

/** A titled table: wrapped text columns and coloured pills, carried onto new pages with its headings. */
export function pillTable<T>(f: ReportFlow, title: string, cols: PillCol<T>[], rows: T[]) {
  const s = f.s
  f.ensure(70)
  s.text(title, L, f.y + 12, { f: 'b', size: 11, color: C.ink })
  const headAt = (top: number) => {
    f.y = f.tableHead(cols.map((c) => ({ label: c.label, x: c.align === 'right' ? c.x + c.w : c.x, align: c.align })), top) + 16
  }
  headAt(f.y + 33)
  for (const r of rows) {
    const wrapped = cols.map((c) => (c.text ? s.wrap(c.text(r), c.w, c.strong || c.code ? 's' : 'r', 8.5).slice(0, 6) : []))
    const lines = Math.max(1, ...wrapped.map((w) => w.length))
    const rh = lines * 12 + 13
    f.ensure(rh, () => headAt(f.y + 7.5))
    cols.forEach((c, n) => {
      if (c.pill) {
        const p = c.pill(r)
        const t = TONE[p.tone]
        s.pill(p.label, c.x, f.y - 8.75, { f: 'b', size: 7, fg: p.tone === 'none' ? C.slate : t.fg, bg: t.bg, h: 12.75, padX: 6 })
        return
      }
      const color = c.color?.(r) ?? (c.code ? C.navy : C.ink)
      wrapped[n].forEach((ln, k) => s.text(ln, c.align === 'right' ? c.x + c.w : c.x, f.y + k * 12, { f: c.strong || c.code ? 's' : 'r', size: 8.5, color, align: c.align }))
    })
    s.hline(L, f.y + (lines - 1) * 12 + 7.5, CW, C.line, 0.75)
    f.y += rh
  }
  f.y += 6
}

export const severityTone = (v: string): Tone => (v === 'Critical' ? 'bad' : v === 'High' ? 'warn' : v === 'Medium' ? 'fair' : 'none')
export const statusTone = (v: string): Tone =>
  v === 'Closed' || v === 'Resolved' || v === 'Verified' ? 'good' : v === 'Overdue' ? 'bad' : v === 'Awaiting Evidence' || v === 'Awaiting Verification' ? 'warn' : v === 'Open' ? 'none' : 'fair'

// ─────────────────────────────── Score panel ───────────────────────────────

export interface ScorePanelOpts {
  score: number | null
  caption: string
  target: number | null | undefined
  /** The rating band the score falls in. */
  band: ScoreThreshold | null | undefined
  /** Up to four figures along the bottom of the panel. */
  stats: { v: string; l: string; c?: Rgb }[]
}

/**
 * The bordered panel that opens an overview: the score ring, the rating pill,
 * the bar of rating bands with the score and the target marked, and four figures.
 * Starts at the pen and is 155 points tall.
 */
export function drawScorePanel(f: ReportFlow, tones: ReturnType<typeof makeTones>, o: ScorePanelOpts) {
  const { s } = f
  const { bands, toneOf, bandRange } = tones
  const band = o.band
  const top = f.y
  s.rrectStroke(L + 0.35, top + 0.4, CW - 0.7, 154.5, 8, C.line, 0.75)
  const tone = TONE[toneOf(o.score)]
  s.ring(116.95, top + 75.75, 51, C.ringTrack, 10.5)
  s.arc(116.95, top + 75.75, 51, 10.5, (o.score ?? 0) / 100, tone.fg)
  s.text(pct1(o.score), 116.95, top + 78.7, { f: 'b', size: 22.5, color: C.ink2, align: 'center', ls: -0.01 })
  s.text(o.caption.toUpperCase(), 117.4, top + 93.7, { f: 's', size: 7.5, color: C.ink2, align: 'center', ls: 0.12 })

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
  const xs = o.score !== null ? xAt(o.score) : null
  const xt = o.target ? xAt(o.target) : null
  if (xs !== null) s.rect(xs - 0.75, by - 5.25, 1.5, 19.5, C.ink)
  if (xt !== null) for (let dy = 0; dy < 19.5; dy += 3.25) s.rect(xt - 0.75, by - 5.25 + dy, 1.5, 1.9, C.slate)
  const scoreLabel = pct1(o.score)
  const targetLabel = `Target ${o.target}%`
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
  o.stats.slice(0, 4).forEach((st, n) => {
    s.text(st.v, 195.7 + n * 87.1, top + 119.3, { f: 'b', size: 13.5, color: st.c ?? C.ink })
    s.text(st.l, 195.7 + n * 87.1, top + 134.3, { size: 7.4, color: C.muted })
  })

}

// ─────────────────────────────── Covers ───────────────────────────────

function coverGround(s: Surface) {
  s.rect(0, 0, PAGE_W, PAGE_H, C.navy)
  // A soft glow from the top-right corner.
  for (let k = 0; k < 14; k++) s.circle(PAGE_W + 20, -40, 430 - k * 26, mix(C.navy, C.white, 0.012 + k * 0.0045))
  s.rect(0, 0, 14.25, PAGE_H, C.orange)
}

export interface CoverOpts {
  /** The line under the programme name, e.g. "Mystery Shopping Programme 2025/26 · Main Audit 1". */
  programmeLine: string
  label: string
  title: [string, string, string]
  subtitle: string
  clientMark: string | null
  brandMark: string | null
  score: number | null
  scoreCaption: string
  band: string | null
  /** Up to three figures beside the ring: value and label. */
  stats: { v: string; l: string }[]
  summary: string
  meta: { l: string; v: string; w: number }[]
  issued: string
}

export function drawCover(f: ReportFlow, o: CoverOpts) {
  const s = f.s
  f.plain.add(f.page())
  coverGround(s)

  // Programme mark and name.
  s.rrect(51, 57, 42.75, 42, 7, C.white)
  s.image(o.clientMark, 'PNG', 55.5, 61.25, 33.75, 33.5)
  s.text(CLIENT.brand.name.toUpperCase(), 107.7, 74.2, { f: 'b', size: 8, color: C.white, ls: 0.17 })
  s.text(o.programmeLine.toUpperCase(), 107.7, 86.2, { f: 'r', size: 8, color: mix(C.navy, C.white, 0.78), ls: 0.08 })
  // The company's own logo, top right.
  if (o.brandMark) {
    s.rrect(484.5, 51, 60, 54, 8, C.white)
    s.image(o.brandMark, 'PNG', 493.5, 57, 42, 42)
  }

  // The label pill and the title.
  const lw = s.width(o.label, 'b', 7.5, 0.16)
  s.rrectStroke(51.4, 190.1, lw + 21.5, 18.8, 9.4, C.orange, 0.75)
  s.text(o.label, 61.7, 202.5, { f: 'b', size: 7.5, color: C.orange, ls: 0.16 })
  s.text(o.title[0], 51, 265.5, { f: 'b', size: 46, color: C.white, ls: -0.022 })
  s.text(o.title[1], 51, 312.75, { f: 'b', size: 46, color: C.white, ls: -0.022 })
  s.text(o.title[2], 51, 360, { f: 'b', size: 46, color: C.orange, ls: -0.022 })
  s.wrap(o.subtitle, 400, 'r', 10.5)
    .slice(0, 2)
    .forEach((ln, n) => s.text(ln, 51, 392.2 + n * 15, { size: 10.5, color: mix(C.navy, C.white, 0.85) }))

  // The score panel.
  s.rrect(51, 456.75, 493.5, 183.75, 10, mix(C.navy, C.white, 0.06))
  s.rrectStroke(51, 456.75, 493.5, 183.75, 10, mix(C.navy, C.white, 0.14), 0.75)
  s.ring(142.45, 548.25, 65.25, mix(C.navy, C.white, 0.22), 12)
  s.arc(142.45, 548.25, 65.25, 12, (o.score ?? 0) / 100, C.orange)
  s.text(o.score === null ? '—' : `${o.score.toFixed(1)}%`, 142.45, 551.2, { f: 'b', size: 28.5, color: C.white, align: 'center', ls: -0.01 })
  s.text(o.scoreCaption.toUpperCase(), 142.45 + 0.5, 570.8, { f: 's', size: 9, color: mix(C.navy, C.white, 0.85), align: 'center', ls: 0.12 })
  if (o.band) s.pill(o.band, 240, 478.5, { size: 8, fg: C.white, bg: C.orange, h: 17.25, padX: 9.5, ls: 0.1 })
  const xs = [239.6, 304.4, 402.4]
  o.stats.slice(0, 3).forEach((st, n) => {
    s.text(st.v, xs[n], 525, { f: 'b', size: 17, color: C.white })
    s.text(st.l.toUpperCase(), xs[n], 541.5, { f: 's', size: 7, color: mix(C.navy, C.white, 0.68), ls: 0.09 })
  })
  s.wrap(o.summary, 288, 'r', 8.6)
    .slice(0, 6)
    .forEach((ln, n) => s.text(ln, 239.6, 563.2 + n * 12.9, { size: 8.6, color: mix(C.navy, C.white, 0.88) }))

  // What, where and when.
  s.hline(51, 669, 493.5, mix(C.navy, C.white, 0.2), 0.75)
  let mx = 51
  for (const m of o.meta) {
    s.text(m.l.toUpperCase(), mx, 690.8, { f: 's', size: 6.5, color: mix(C.navy, C.white, 0.62), ls: 0.14 })
    s.wrap(m.v, m.w, 'b', 9.5)
      .slice(0, 3)
      .forEach((ln, n) => s.text(ln, mx, 705.8 + n * 13.4, { f: 'b', size: 9.5, color: C.white }))
    mx += m.w + 8
  }
  s.text(`Confidential · Issued ${o.issued}`, 51, 810.8, { size: 7.5, color: mix(C.navy, C.white, 0.6) })
}

/** The closing page: who runs the programme. */
export function drawBackCover(f: ReportFlow, clientMark: string | null) {
  f.newPage()
  f.plain.add(f.page())
  const s = f.s
  coverGround(s)
  s.rrect(51, 467.25, 42.75, 42.75, 7, C.white)
  s.image(clientMark, 'PNG', 55.5, 471.75, 33.75, 33.75)
  const gw = s.text('Get in ', 51, 579, { f: 'b', size: 44, color: C.white, ls: -0.02 })
  s.text('touch', 51 + gw, 579, { f: 'b', size: 44, color: C.orange, ls: -0.02 })
  s.text(CLIENT.brand.name, 51, 627.8, { f: 'b', size: 13, color: C.white })
  const start = format(new Date(CLIENT.org.engagementStart), 'MMM yyyy')
  const end = format(new Date(CLIENT.org.engagementEnd), 'MMM yyyy')
  const lines = [CLIENT.org.engagementName, `Programme period ${start} – ${end}`, `${CLIENT.org.timezone} · reporting in ${CLIENT.org.currency}`]
  lines.forEach((ln, n) => s.text(ln, 51, 646.5 + n * 18.75, { size: 11, color: mix(C.navy, C.white, 0.85) }))
  s.hline(51, 717, 261.75, mix(C.navy, C.white, 0.25), 0.75)
  s.text('Issued by INSIGHT360 · Mystery Shopping Intelligence Platform', 51, 741, { size: 8.5, color: mix(C.navy, C.white, 0.65) })
  s.text('This report is confidential and intended for the named client only.', 51, 756.8, { size: 8.5, color: mix(C.navy, C.white, 0.65) })
}

// ─────────────────────────────── Contents and footers ───────────────────────────────

/** Fills the contents page reserved earlier; every line links to its page. */
export function drawContents(f: ReportFlow, contentsPage: number, groups: { key: string; title: string }[], toneOf: (v: number | null | undefined) => Tone) {
  const { doc, s } = f
  doc.setPage(contentsPage)
  s.text('CONTENTS', L, 52.5, { f: 'b', size: 7, color: C.orange, ls: 0.16 })
  s.text('What’s in this report', L, 77.25, { f: 'b', size: 21, color: C.ink })
  s.text('Every entry is clickable.', L, 94.5, { size: 9, color: C.slate })
  s.hline(L, 109.5, CW, C.ink, 1.5)
  const total = f.contents.length
  // Rows tighten when a report has more entries than one page holds at the designed pitch.
  const pitch = Math.min(1, 620 / (total * 21.5 + groups.length * 40))
  let cy = 127.5
  for (const g of groups) {
    const entries = f.contents.filter((c) => c.group === g.key)
    if (!entries.length) continue
    s.rrect(L, cy, 14.25, 14.25, 3, C.navy)
    s.text(g.key, L + 7.1, cy + 9.75, { f: 'b', size: 7, color: C.white, align: 'center' })
    s.text(g.title, 62.6, cy + 9.75, { f: 'b', size: 8, color: C.navy, ls: 0.1 })
    cy += 29.25 * pitch
    for (const e of entries) {
      const rowH = (e.num ? 20.6 : 23.25) * pitch
      if (e.num) {
        s.text(e.num, L, cy, { size: 6.9, color: C.muted })
        s.text(s.fit(e.label, 400, 'r', 6.9), 62.6, cy, { size: 6.9, color: C.slate })
        const t = TONE[toneOf(e.score)]
        const none = e.score === null || e.score === undefined
        s.pill(none ? '—' : pct0(e.score), 528, cy - 5.25, { f: 'b', size: 7, fg: none ? C.muted : t.fg, bg: none ? C.chip : t.bg, h: 12, w: 31.5, align: 'right' })
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

/** The footer on every page but the covers: date, programme and reference, page number. */
export function drawFooters(f: ReportFlow, reference: string, issued: string) {
  const { doc, s } = f
  const right = `${CLIENT.brand.name.toUpperCase()} · ${CLIENT.org.engagementName} · ${reference}`
  for (let p = 1; p <= f.page(); p++) {
    if (f.plain.has(p)) continue
    doc.setPage(p)
    s.hline(L - 0.25, 805.6, CW - 0.5, C.line, 0.6)
    s.text(`Confidential · ${issued}`, L - 0.25, 817.9, { size: 6.8, color: C.muted })
    s.text(right, 514.8, 817.9, { size: 6.8, color: C.muted, align: 'right' })
    s.rrect(522.75, 809.4, 30, 13, 3, C.orange)
    s.text(String(p), 537.75, 818.4, { f: 'b', size: 7, color: C.white, align: 'center' })
  }
}
