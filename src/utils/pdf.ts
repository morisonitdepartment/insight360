import { uploadedBrandLogo, uploadedOrganizationLogo } from '@/utils/logos'
import type { jsPDF } from 'jspdf'
import { format } from 'date-fns'
import { CLIENT } from '@/config/client'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Report documents
 *
 * Reports used to be exported by photographing the screen: html2canvas rendered
 * the page to a bitmap and the bitmap was sliced across A4 pages. It produced a
 * picture of a web page — text that could not be selected or searched, tables
 * cut through the middle of a row at every page break, screen furniture like
 * buttons and scrollbars baked in, and several megabytes for a dozen pages.
 *
 * These build the document instead. Every page is laid out for paper: a full
 * cover, a banded header that repeats and says "(cont.)" when a section runs on,
 * real headings, tables that break between rows, vector gauges and score bars,
 * and a footer band carrying the programme and the page number. The text is
 * text, so a reader can search it, a reviewer can copy a finding out of it, and
 * the file stays small enough to email.
 *
 * The layout follows the client's own Service Excellence report: a cover in the
 * brand colour carrying one number, a performance spread with a banded gauge,
 * score cards, visit details, then a page per section whose rows are tinted by
 * result with the shopper's observation underneath.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Rgb = [number, number, number]

const hexToRgb = (hex: string): Rgb => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** The palette the on-screen report uses, so paper and screen agree. */
const PALETTE = {
  /** The band colour: covers, header and footer bands, table headers. */
  brand: [30, 75, 163] as Rgb,
  brandDeep: [26, 66, 150] as Rgb,
  brandWash: [233, 239, 250] as Rgb,
  ink: [25, 32, 44] as Rgb,
  body: [64, 76, 94] as Rgb,
  muted: [128, 140, 158] as Rgb,
  hairline: [222, 228, 236] as Rgb,
  /** The tint every content page is laid on, and the card shadow on it. */
  page: [245, 247, 251] as Rgb,
  shade: [216, 223, 234] as Rgb,
  zebra: [247, 249, 251] as Rgb,
  track: [219, 226, 237] as Rgb,
  white: [255, 255, 255] as Rgb,
  good: [22, 163, 100] as Rgb,
  fair: [30, 108, 200] as Rgb,
  warn: [233, 122, 24] as Rgb,
  bad: [223, 65, 66] as Rgb,
  goodWash: [233, 248, 240] as Rgb,
  warnWash: [254, 246, 233] as Rgb,
  badWash: [253, 238, 238] as Rgb,
  obsWash: [254, 249, 240] as Rgb,
  accent: hexToRgb(CLIENT.accent.chart),
}

/** Score → colour, on the same thresholds the application scores against. */
export function scoreTone(v: number | null | undefined): 'good' | 'warn' | 'bad' | 'muted' {
  if (v === null || v === undefined || Number.isNaN(v)) return 'muted'
  if (v >= 80) return 'good'
  if (v >= 70) return 'warn'
  return 'bad'
}

const TONE_COLOR: Record<string, Rgb> = {
  good: PALETTE.good,
  warn: PALETTE.warn,
  bad: PALETTE.bad,
  muted: PALETTE.muted,
  default: PALETTE.ink,
}
const TONE_WASH: Record<string, Rgb> = {
  good: PALETTE.goodWash,
  warn: PALETTE.warnWash,
  bad: PALETTE.badWash,
}

/**
 * Band colours by rating name, so the gauge, the legend and every score chip in
 * the document agree with the rating the application awarded.
 */
const BAND_COLOR: Record<string, Rgb> = {
  Excellent: PALETTE.good,
  Good: PALETTE.fair,
  'Needs Improvement': PALETTE.warn,
  Critical: PALETTE.bad,
}
export const bandColor = (label: string): Rgb => BAND_COLOR[label] ?? PALETTE.muted

export type CellTone = 'default' | 'good' | 'warn' | 'bad' | 'muted'

export interface PdfColumn<R> {
  header: string
  /** Relative share of the table width. Columns without one share what is left. */
  width?: number
  align?: 'left' | 'right' | 'center'
  render: (row: R) => string
  tone?: (row: R) => CellTone
  /** Draws the cell in bold — for a row's subject column. */
  strong?: boolean
}

export interface MetaPair {
  label: string
  value: string
}

export interface BarItem {
  label: string
  value: number | null
  note?: string
}

export interface TileItem {
  label: string
  value: string
  note?: string
  tone?: CellTone
}

export interface ScoreBand {
  label: string
  min: number
  max: number
}

/** A section of a questionnaire as the report prints it. */
export interface ScoreCardItem {
  title: string
  score: number | null
  points?: { got: number; max: number }
  note?: string
}

/** One question as the report prints it, with the shopper's observation. */
export interface QuestionRow {
  code: string
  text: string
  answer: string
  /** 0..1, or null when the question was not scored (N/A, informational, skipped). */
  score: number | null
  points?: { got: number; max: number }
  observation?: string
  /** The answer itself, where the figure matters: "22 min", "Rated 2 / 5", "Average". */
  answerNote?: string
  critical?: boolean
  skipped?: boolean
}

const A4 = { w: 210, h: 297 }
const MARGIN = 14
const CONTENT_W = A4.w - MARGIN * 2
const HEADER_H = 26
/** First line of content on a banded page. */
const TOP = HEADER_H + 11
/** Space the footer band needs; nothing may be drawn below this line. */
const FOOT_LIMIT = A4.h - 17

/**
 * A report document under construction.
 *
 * The caller adds blocks in reading order and the builder decides where pages
 * break, so no block is ever split across a page in a way that loses its header.
 */
export class ReportDoc {
  private doc: jsPDF
  /** Current vertical pen position, in millimetres from the top of the page. */
  private y = TOP
  /** The band redrawn at the top of every page until the next `section()`. */
  private running: { title: string; subtitle?: string; chip?: { value: string; note?: string; tone?: Rgb } } | null = null
  /** Pages that carry no header or footer band: the covers. */
  private plain = new Set<number>()
  private started = false

  private constructor(doc: jsPDF) {
    this.doc = doc
  }

  static async create(): Promise<ReportDoc> {
    const { jsPDF: Ctor } = await import('jspdf')
    const doc = new Ctor({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
    doc.setFont('helvetica', 'normal')
    return new ReportDoc(doc)
  }

  // ── primitives ────────────────────────────────────────────────────────────

  private fill(c: Rgb) {
    this.doc.setFillColor(c[0], c[1], c[2])
  }
  private stroke(c: Rgb) {
    this.doc.setDrawColor(c[0], c[1], c[2])
  }
  private ink(c: Rgb) {
    this.doc.setTextColor(c[0], c[1], c[2])
  }
  private font(size: number, weight: 'normal' | 'bold' = 'normal') {
    this.doc.setFont('helvetica', weight)
    this.doc.setFontSize(size)
  }
  private line1(text: string, width: number): string {
    return (this.doc.splitTextToSize(text, width) as string[])[0] ?? ''
  }

  /**
   * The ribbon of waves along the foot of a page.
   *
   * Four sine curves at different phases and amplitudes, sampled every few
   * millimetres. It is the one piece of decoration in the document, and it is
   * drawn in the page tint so it reads as texture rather than content.
   */
  private waves(baseY: number, color: Rgb, width = 0.35) {
    this.stroke(color)
    this.doc.setLineWidth(width)
    for (let w = 0; w < 4; w++) {
      const amp = 4 + w * 1.6
      const period = 62 + w * 11
      const phase = w * 1.3
      const yOff = baseY + w * 5
      let px = -4
      let py = yOff + Math.sin(phase) * amp
      for (let x = 0; x <= A4.w + 6; x += 3) {
        const y = yOff + Math.sin((x / period) * Math.PI * 2 + phase) * amp
        this.doc.line(px, py, x, y)
        px = x
        py = y
      }
    }
  }

  /**
   * A thick arc, as one filled ring sector.
   *
   * jsPDF has no arc primitive. Stroking a run of short segments leaves a visible
   * stripe where each segment's square ends overlap its neighbours, so the band
   * is built instead as a single closed path — out along the outer edge, back
   * along the inner one — and filled. A full ring is swept to 359.5° rather than
   * 360°, which leaves a hairline slit that keeps the path simple and closes up
   * invisibly at any size.
   */
  private arc(cx: number, cy: number, radius: number, thickness: number, fromDeg: number, toDeg: number, color: Rgb) {
    const outer = radius + thickness / 2
    const inner = radius - thickness / 2
    const rad = (d: number) => (d * Math.PI) / 180
    const sweep = Math.min(359.5, toDeg - fromDeg)
    if (sweep <= 0) return
    const end = fromDeg + sweep
    const step = Math.max(1, sweep / Math.ceil(sweep / 2))
    const pts: [number, number][] = []
    for (let a = fromDeg; a < end + step / 2; a += step) {
      const aa = Math.min(a, end)
      pts.push([cx + Math.cos(rad(aa)) * outer, cy + Math.sin(rad(aa)) * outer])
    }
    for (let a = end; a > fromDeg - step / 2; a -= step) {
      const aa = Math.max(a, fromDeg)
      pts.push([cx + Math.cos(rad(aa)) * inner, cy + Math.sin(rad(aa)) * inner])
    }
    const deltas = pts.slice(1).map((p, idx) => [p[0] - pts[idx][0], p[1] - pts[idx][1]] as [number, number])
    this.fill(color)
    this.doc.lines(deltas, pts[0][0], pts[0][1], [1, 1], 'F', true)
  }

  /** A rounded card with a soft shadow, the way the screen draws the same panel. */
  private card(x: number, y: number, w: number, h: number, radius = 2.4) {
    this.fill(PALETTE.shade)
    this.doc.roundedRect(x + 0.9, y + 1.1, w, h, radius, radius, 'F')
    this.fill(PALETTE.white)
    this.doc.roundedRect(x, y, w, h, radius, radius, 'F')
  }

  /** A filled pill with centred text — the score chips and band labels. */
  private pill(x: number, y: number, w: number, h: number, bg: Rgb, text: string, size: number, fg: Rgb = PALETTE.white) {
    this.fill(bg)
    this.doc.roundedRect(x, y, w, h, 1.4, 1.4, 'F')
    this.font(size, 'bold')
    this.ink(fg)
    this.doc.text(text, x + w / 2, y + h / 2 + size * 0.17, { align: 'center' })
  }

  // ── page chrome ───────────────────────────────────────────────────────────

  /** Paints the page tint and the wave ribbon. Every content page starts here. */
  private paint() {
    this.fill(PALETTE.page)
    this.doc.rect(0, 0, A4.w, A4.h, 'F')
    this.waves(A4.h - 48, PALETTE.shade, 0.3)
  }

  /** The band at the top of a content page: accent tab, title, score chip. */
  private band(cont: boolean) {
    const r = this.running
    if (!r) return
    this.fill(PALETTE.brand)
    this.doc.rect(0, 0, A4.w, HEADER_H, 'F')
    // The accent tab at the left edge and the rule beneath, as the client's own
    // report marks every section.
    this.fill(PALETTE.accent)
    this.doc.rect(0, 0, 5, HEADER_H + 1.8, 'F')
    this.doc.rect(5, HEADER_H, A4.w - 5, 1.8, 'F')

    const chipW = r.chip ? 34 : 0
    this.font(12.5, 'bold')
    this.ink(PALETTE.white)
    this.doc.text(this.line1(cont ? `${r.title} (cont.)` : r.title, CONTENT_W - chipW - 6), MARGIN, 13.5)
    if (r.subtitle) {
      this.font(7.4)
      this.ink([168, 190, 228])
      this.doc.text(this.line1(r.subtitle, CONTENT_W - chipW - 6), MARGIN, 19.5)
    }
    if (r.chip) {
      const h = 17
      const x = A4.w - MARGIN - chipW
      this.fill(r.chip.tone ?? PALETTE.accent)
      this.doc.roundedRect(x, 4.5, chipW, h, 2, 2, 'F')
      this.font(13, 'bold')
      this.ink(PALETTE.white)
      this.doc.text(r.chip.value, x + chipW / 2, 12.6, { align: 'center' })
      if (r.chip.note) {
        this.font(5.8)
        this.doc.text(this.line1(r.chip.note, chipW - 3), x + chipW / 2, 17.2, { align: 'center' })
      }
    }
  }

  /** Starts a page carrying the running header. */
  private newPage(cont = true) {
    this.doc.addPage()
    this.paint()
    this.band(cont)
    this.y = this.running ? TOP : MARGIN
  }

  /** Starts a new page when `needed` millimetres will not fit below the pen. */
  private ensure(needed: number) {
    if (this.y + needed <= FOOT_LIMIT) return
    this.newPage()
  }

  /** Vertical gap. */
  gap(mm = 4) {
    this.y += mm
    return this
  }

  // ── covers ────────────────────────────────────────────────────────────────

  /**
   * Page one: the whole page in the brand colour, the title, and the single
   * number the reader opened the file for.
   */
  coverPage(opts: {
    eyebrow: string
    title: string[]
    subtitle?: string
    logo?: string | null
    /** The assessed company's own logo, set in the top-right corner. */
    brandLogo?: string | null
    score?: { value: number | null; caption: string; band?: string; bandTone?: Rgb; narrative?: string }
    meta?: MetaPair[]
  }) {
    this.plain.add(this.doc.getNumberOfPages())
    this.started = true
    this.fill(PALETTE.brandDeep)
    this.doc.rect(0, 0, A4.w, A4.h, 'F')
    this.waves(A4.h - 76, [52, 92, 176], 0.4)

    let top = 18
    if (opts.brandLogo) {
      try {
        this.doc.addImage(opts.brandLogo, 'PNG', A4.w - MARGIN - 20, 13, 20, 20)
      } catch {
        /* as below: a logo that will not decode never fails the export */
      }
    }
    if (opts.logo) {
      try {
        this.doc.addImage(opts.logo, 'PNG', MARGIN, top - 5, 13, 13)
        top += 14
      } catch {
        /* a mark that will not decode is not worth failing an export over */
      }
    }
    this.font(7.6, 'bold')
    this.ink([158, 184, 226])
    this.doc.text(opts.eyebrow.toUpperCase(), MARGIN, top, { charSpace: 1.1 })
    this.fill(PALETTE.accent)
    this.doc.rect(MARGIN, top + 4, 22, 2.2, 'F')

    // The title runs big and the last line takes the accent, as on the cover the
    // client sent: "Service Excellence" in white, "Report" in orange.
    let ty = top + 32
    opts.title.forEach((lineText, idx) => {
      this.font(32, 'bold')
      this.ink(idx === opts.title.length - 1 && opts.title.length > 1 ? PALETTE.accent : PALETTE.white)
      this.doc.text(this.line1(lineText, CONTENT_W), MARGIN, ty)
      ty += 22
    })
    if (opts.subtitle) {
      this.font(10)
      this.ink([178, 199, 232])
      const sub = (this.doc.splitTextToSize(opts.subtitle, CONTENT_W - 6) as string[]).slice(0, 2)
      this.doc.text(sub, MARGIN, ty - 7)
      ty += sub.length * 5
    }

    if (opts.score) {
      const h = 76
      const y = Math.max(ty + 4, 136)
      this.fill([40, 85, 173])
      this.doc.roundedRect(MARGIN, y, CONTENT_W, h, 3.5, 3.5, 'F')

      // Donut: the track, then the achieved sweep clockwise from twelve o'clock.
      const cx = MARGIN + 36
      const cy = y + h / 2
      const value = opts.score.value
      this.arc(cx, cy, 20, 8, 0, 360, [30, 62, 128])
      if (value !== null && value > 0) {
        this.arc(cx, cy, 20, 8, -90, -90 + (Math.min(100, value) / 100) * 360, PALETTE.accent)
      }
      this.font(19, 'bold')
      this.ink(PALETTE.white)
      this.doc.text(value === null ? '—' : `${value.toFixed(0)}%`, cx, cy + 1.5, { align: 'center' })
      this.font(6.2, 'bold')
      this.ink([168, 190, 228])
      this.doc.text(opts.score.caption.toUpperCase(), cx, cy + 7.5, { align: 'center', charSpace: 0.8 })

      const tx = MARGIN + 74
      const tw = CONTENT_W - 74 - 10
      let cyText = y + 16
      if (opts.score.band) {
        const label = this.line1(opts.score.band, tw - 12)
        this.font(8.5, 'bold')
        const pw = Math.min(tw, this.doc.getTextWidth(label) + 12)
        this.pill(tx, cyText - 6, pw, 9.5, opts.score.bandTone ?? PALETTE.accent, label, 8.5)
        cyText += 13
      }
      if (opts.score.narrative) {
        this.font(8)
        this.ink([198, 214, 238])
        const lines = (this.doc.splitTextToSize(opts.score.narrative, tw) as string[]).slice(0, 6)
        this.doc.text(lines, tx, cyText, { lineHeightFactor: 1.5 })
      }
    }

    if (opts.meta?.length) {
      const cols = Math.min(4, opts.meta.length)
      const colW = CONTENT_W / cols
      const baseY = A4.h - 44
      this.stroke([72, 110, 188])
      this.doc.setLineWidth(0.3)
      this.doc.line(MARGIN, baseY - 10, A4.w - MARGIN, baseY - 10)
      opts.meta.slice(0, 8).forEach((m, idx) => {
        const x = MARGIN + (idx % cols) * colW
        const yy = baseY + Math.floor(idx / cols) * 14
        this.font(6, 'bold')
        this.ink([150, 178, 222])
        this.doc.text(m.label.toUpperCase(), x, yy, { charSpace: 0.8 })
        this.font(9.5, 'bold')
        this.ink(PALETTE.white)
        this.doc.text(this.line1(m.value || '—', colW - 4), x, yy + 6)
      })
    }
    return this
  }

  /** The last page: how to reach the people who produced the report. */
  backCover(opts: { lead: string; title: string; blocks: string[][] }) {
    this.doc.addPage()
    this.plain.add(this.doc.getNumberOfPages())
    this.fill(PALETTE.brandDeep)
    this.doc.rect(0, 0, A4.w, A4.h, 'F')
    this.waves(A4.h - 60, [52, 92, 176], 0.4)
    this.font(26, 'bold')
    this.ink(PALETTE.accent)
    this.doc.text(opts.lead, MARGIN, 48)
    this.font(40, 'bold')
    this.ink(PALETTE.white)
    this.doc.text(opts.title.toUpperCase(), MARGIN, 82)
    let y = 106
    for (const block of opts.blocks) {
      this.font(10)
      this.ink([206, 222, 244])
      for (const l of block) {
        this.doc.text(l, MARGIN, y)
        y += 8.5
      }
      y += 9
    }
    return this
  }

  // ── sections ──────────────────────────────────────────────────────────────

  /**
   * Opens a part of the report on its own page, under a banded header that
   * repeats — marked "(cont.)" — for as long as the part runs.
   */
  section(title: string, subtitle?: string, chip?: { value: string; note?: string; tone?: CellTone | Rgb }) {
    const tone: Rgb | undefined =
      chip?.tone === undefined ? undefined : Array.isArray(chip.tone) ? (chip.tone as Rgb) : TONE_COLOR[chip.tone as string]
    this.running = { title, subtitle, chip: chip ? { value: chip.value, note: chip.note, tone } : undefined }
    if (this.started) this.doc.addPage()
    this.started = true
    this.paint()
    this.band(false)
    this.y = TOP
    return this
  }

  // ── blocks ────────────────────────────────────────────────────────────────

  /** A heading inside a page: an accent tick, the title, and a hairline. */
  heading(title: string) {
    this.ensure(14)
    this.fill(PALETTE.accent)
    this.doc.rect(MARGIN, this.y - 3.1, 1.6, 4.2, 'F')
    this.font(10.5, 'bold')
    this.ink(PALETTE.ink)
    this.doc.text(title, MARGIN + 4, this.y)
    this.y += 2.6
    this.stroke(PALETTE.hairline)
    this.doc.setLineWidth(0.2)
    this.doc.line(MARGIN, this.y, A4.w - MARGIN, this.y)
    this.y += 5
    return this
  }

  paragraph(text: string, opts: { size?: number; tone?: CellTone } = {}) {
    const size = opts.size ?? 8.5
    this.font(size)
    this.ink(opts.tone ? TONE_COLOR[opts.tone] ?? PALETTE.body : PALETTE.body)
    const lines = this.doc.splitTextToSize(text, CONTENT_W) as string[]
    const lh = size * 0.46
    for (const line of lines) {
      this.ensure(lh + 1)
      this.doc.text(line, MARGIN, this.y)
      this.y += lh
    }
    this.y += 2
    return this
  }

  /** Label-over-value pairs in a light grid — the facts at the top of a report. */
  meta(pairs: MetaPair[], columns = 4) {
    const colW = CONTENT_W / columns
    const rows = Math.ceil(pairs.length / columns)
    this.ensure(rows * 10 + 2)
    pairs.forEach((p, i) => {
      const col = i % columns
      const row = Math.floor(i / columns)
      const x = MARGIN + col * colW
      const y = this.y + row * 10
      this.font(6.5, 'bold')
      this.ink(PALETTE.muted)
      this.doc.text(p.label.toUpperCase(), x, y, { charSpace: 0.3 })
      this.font(8.5, 'bold')
      this.ink(PALETTE.ink)
      this.doc.text(this.line1(p.value || '—', colW - 3), x, y + 4.2)
    })
    this.y += rows * 10 + 2
    return this
  }

  /**
   * Label-and-value cards, two across — the visit's own particulars.
   *
   * The same pairs as `meta`, given room to breathe on a page of their own.
   */
  detailCards(pairs: MetaPair[], columns = 2) {
    const gap = 4
    const colW = (CONTENT_W - gap * (columns - 1)) / columns
    const h = 17
    pairs.forEach((p, i) => {
      const col = i % columns
      if (col === 0) this.ensure(h + gap)
      const x = MARGIN + col * (colW + gap)
      const y = this.y
      this.card(x, y, colW, h)
      this.fill(PALETTE.brand)
      this.doc.circle(x + 6, y + h / 2 - 1.5, 2.3, 'F')
      this.font(6.2, 'bold')
      this.ink(PALETTE.muted)
      this.doc.text(this.line1(p.label.toUpperCase(), colW - 14), x + 11.5, y + 6.2, { charSpace: 0.4 })
      this.font(9.5, 'bold')
      this.ink(PALETTE.ink)
      this.doc.text(this.line1(p.value || '—', colW - 14), x + 11.5, y + 12.4)
      if (col === columns - 1 || i === pairs.length - 1) this.y += h + gap
    })
    this.y += 1
    return this
  }

  /** Boxed figures, three or four across — KPIs and headline numbers. */
  tiles(items: TileItem[], columns = 4) {
    const gap = 3
    const colW = (CONTENT_W - gap * (columns - 1)) / columns
    const tileH = 17
    items.forEach((t, i) => {
      const col = i % columns
      if (col === 0) this.ensure(tileH + gap)
      const x = MARGIN + col * (colW + gap)
      const y = this.y
      const wash = TONE_WASH[t.tone ?? '']
      this.card(x, y, colW, tileH, 1.8)
      if (wash) {
        this.fill(wash)
        this.doc.roundedRect(x, y, colW, tileH, 1.8, 1.8, 'F')
      }
      this.font(6.3, 'bold')
      this.ink(PALETTE.muted)
      this.doc.text(this.line1(t.label.toUpperCase(), colW - 4), x + 2.5, y + 5, { charSpace: 0.3 })
      this.font(12, 'bold')
      this.ink(TONE_COLOR[t.tone ?? 'default'] ?? PALETTE.ink)
      this.doc.text(this.line1(t.value, colW - 4), x + 2.5, y + 11.4)
      if (t.note) {
        this.font(6.2)
        this.ink(PALETTE.muted)
        this.doc.text(this.line1(t.note, colW - 4), x + 2.5, y + 15)
      }
      if (col === columns - 1 || i === items.length - 1) this.y += tileH + gap
    })
    this.y += 1
    return this
  }

  /** Horizontal score bars — the category and stage breakdowns. */
  bars(items: BarItem[], opts: { columns?: 1 | 2 } = {}) {
    const columns = opts.columns ?? 1
    const gap = 8
    const colW = (CONTENT_W - gap * (columns - 1)) / columns
    const rowH = 9.5
    items.forEach((it, i) => {
      const col = i % columns
      if (col === 0) this.ensure(rowH)
      const x = MARGIN + col * (colW + gap)
      const y = this.y
      this.font(7.6)
      this.ink(PALETTE.body)
      const labelW = colW - 20
      const labelLine = this.line1(it.label, labelW)
      this.doc.text(labelLine, x, y)
      if (it.note) {
        // Measure the label in the label’s own size. Measuring it after switching
        // to the smaller note font put the note a few millimetres too far left,
        // on top of the last word of the label.
        const lw = this.doc.getTextWidth(labelLine)
        this.font(6.4)
        this.ink(PALETTE.muted)
        this.doc.text(this.line1(it.note, Math.max(6, colW - lw - 22)), x + lw + 2.5, y)
      }
      const tone = scoreTone(it.value)
      this.font(7.6, 'bold')
      this.ink(TONE_COLOR[tone])
      this.doc.text(it.value === null ? '—' : `${it.value.toFixed(1)}%`, x + colW, y, { align: 'right' })
      const barY = y + 1.6
      this.fill(PALETTE.track)
      this.doc.roundedRect(x, barY, colW, 1.8, 0.9, 0.9, 'F')
      if (it.value !== null && it.value > 0) {
        this.fill(TONE_COLOR[tone])
        this.doc.roundedRect(x, barY, Math.max(1.8, (colW * Math.min(100, it.value)) / 100), 1.8, 0.9, 0.9, 'F')
      }
      if (col === columns - 1 || i === items.length - 1) this.y += rowH
    })
    this.y += 1
    return this
  }

  /**
   * The banded dial: the score as a needle across the rating bands.
   *
   * The bands are the client's own configured ranges, so the picture cannot
   * disagree with the rating printed beside it.
   */
  gauge(value: number | null, bands: ScoreBand[], caption: string) {
    const h = 62
    this.ensure(h + 6)
    const cx = A4.w / 2 - 16
    const cy = this.y + h - 14
    const radius = 33
    const thickness = 13
    // Bands run right to left across the top half: 0% at nine o'clock, drawn in
    // the negative half-plane because PDF's y axis points down.
    const ordered = [...bands].sort((a, b) => a.min - b.min)
    for (const b of ordered) {
      const from = -180 + (b.min / 100) * 180
      const to = -180 + (Math.min(100, b.max + 0.01) / 100) * 180
      this.arc(cx, cy, radius, thickness, Math.min(from, to), Math.max(from, to), bandColor(b.label))
    }
    this.font(6.2, 'bold')
    this.ink(PALETTE.muted)
    for (const t of [0, 25, 50, 75, 100]) {
      const a = ((-180 + (t / 100) * 180) * Math.PI) / 180
      const r = radius + thickness / 2 + 5
      this.doc.text(`${t}%`, cx + Math.cos(a) * r, cy + Math.sin(a) * r + 1, { align: 'center' })
    }
    if (value !== null) {
      const a = ((-180 + (Math.max(0, Math.min(100, value)) / 100) * 180) * Math.PI) / 180
      this.stroke(PALETTE.ink)
      this.doc.setLineWidth(1.3)
      this.doc.line(cx, cy, cx + Math.cos(a) * (radius + 3), cy + Math.sin(a) * (radius + 3))
      this.fill(PALETTE.ink)
      this.doc.circle(cx, cy, 2.6, 'F')
    }
    // The reading, in a card beside the dial.
    const cw = 40
    const cx2 = A4.w - MARGIN - cw
    const cy2 = this.y + 18
    this.card(cx2, cy2, cw, 26, 2)
    this.fill(value === null ? PALETTE.muted : bandColor(caption))
    this.doc.roundedRect(cx2, cy2, cw, 2.6, 1.3, 1.3, 'F')
    this.font(16, 'bold')
    this.ink(value === null ? PALETTE.muted : bandColor(caption))
    this.doc.text(value === null ? '—' : `${value.toFixed(0)}%`, cx2 + cw / 2, cy2 + 14, { align: 'center' })
    this.font(6, 'bold')
    this.ink(PALETTE.muted)
    this.doc.text(this.line1(caption.toUpperCase(), cw - 4), cx2 + cw / 2, cy2 + 20, { align: 'center', charSpace: 0.3 })
    this.y += h + 4
    return this
  }

  /** The rating bands, two across, each with its colour swatch. */
  bandLegend(bands: ScoreBand[]) {
    const gap = 4
    const colW = (CONTENT_W - gap) / 2
    const h = 9
    bands.forEach((b, i) => {
      const col = i % 2
      if (col === 0) this.ensure(h + 2)
      const x = MARGIN + col * (colW + gap)
      const y = this.y
      this.card(x, y, colW, h, 1.6)
      this.fill(bandColor(b.label))
      this.doc.roundedRect(x + 3, y + 2.4, 7, 4.2, 1, 1, 'F')
      this.font(7.2, 'bold')
      this.ink(PALETTE.ink)
      const range = b.min === 0 ? `Below ${Math.ceil(b.max)}%` : `${b.min}% – ${Math.ceil(b.max)}%`
      this.doc.text(range, x + 13, y + 5.8)
      const rw = this.doc.getTextWidth(range)
      this.font(7.2)
      this.ink(PALETTE.muted)
      this.doc.text(`· ${b.label}`, x + 15 + rw, y + 5.8)
      if (col === 1 || i === bands.length - 1) this.y += h + 2
    })
    this.y += 2
    return this
  }

  /**
   * The section-score panel: a banded title row, then a bar per section with
   * its points and percentage on the right.
   */
  scoreBars(items: ScoreCardItem[], opts: { title?: string; total?: ScoreCardItem; valueHeader?: string } = {}) {
    const headH = 9
    const rowH = 10
    this.ensure(headH + 2 + rowH * 2)
    this.fill(PALETTE.brand)
    this.doc.roundedRect(MARGIN, this.y, CONTENT_W, headH, 2, 2, 'F')
    this.fill(PALETTE.accent)
    this.doc.roundedRect(MARGIN - 1, this.y - 1, 5, headH + 2, 1.4, 1.4, 'F')
    this.font(8, 'bold')
    this.ink(PALETTE.white)
    this.doc.text((opts.title ?? 'Section scores').toUpperCase(), MARGIN + 8, this.y + 5.9, { charSpace: 0.4 })
    this.font(6.6, 'bold')
    this.ink([168, 190, 228])
    this.doc.text((opts.valueHeader ?? 'Points  ·  %').toUpperCase(), A4.w - MARGIN - 4, this.y + 5.9, { align: 'right', charSpace: 0.3 })
    this.y += headH + 2

    const labelW = 54
    const valueW = 26
    const barW = CONTENT_W - labelW - valueW - 8
    const draw = (it: ScoreCardItem, isTotal: boolean) => {
      this.ensure(rowH)
      const y = this.y
      if (isTotal) {
        this.fill(PALETTE.brandWash)
        this.doc.roundedRect(MARGIN, y - 1.5, CONTENT_W, rowH, 1.6, 1.6, 'F')
      }
      this.font(7.6, 'bold')
      this.ink(isTotal ? PALETTE.brand : PALETTE.ink)
      this.doc.text(this.line1(it.title, labelW - 2), MARGIN + labelW - 2, y + 4.4, { align: 'right' })
      const bx = MARGIN + labelW + 2
      this.fill(PALETTE.track)
      this.doc.roundedRect(bx, y + 1.2, barW, 5.4, 2.7, 2.7, 'F')
      const tone = scoreTone(it.score)
      if (it.score !== null && it.score > 0) {
        this.fill(TONE_COLOR[tone])
        this.doc.roundedRect(bx, y + 1.2, Math.max(5.4, (barW * Math.min(100, it.score)) / 100), 5.4, 2.7, 2.7, 'F')
      }
      this.font(7.4, 'bold')
      this.ink(TONE_COLOR[tone])
      const pctText = it.score === null ? '—' : `${it.score.toFixed(0)}%`
      this.doc.text(it.points ? `${Math.round(it.points.got)}  ·  ${pctText}` : pctText, A4.w - MARGIN - 2, y + 4.4, { align: 'right' })
      this.y += rowH
    }
    items.forEach((it) => draw(it, false))
    if (opts.total) draw(opts.total, true)
    this.y += 3
    return this
  }

  /**
   * One card per section: its number, its points, a bar and its percentage —
   * the spread a manager reads before anything else.
   */
  scoreCards(items: ScoreCardItem[]) {
    const h = 23
    const gap = 3.5
    items.forEach((it, i) => {
      this.ensure(h + gap)
      const y = this.y
      const tone = scoreTone(it.score)
      this.card(MARGIN, y, CONTENT_W, h)
      // A coloured spine on the left, keyed to the result.
      this.fill(TONE_COLOR[tone])
      this.doc.roundedRect(MARGIN, y, 3, h, 1.5, 1.5, 'F')
      this.fill(PALETTE.brand)
      this.doc.circle(MARGIN + 15, y + h / 2, 6.6, 'F')
      this.font(9, 'bold')
      this.ink(PALETTE.white)
      this.doc.text(String(i + 1), MARGIN + 15, y + h / 2 + 3, { align: 'center' })

      const tx = MARGIN + 26
      this.font(9.2, 'bold')
      this.ink(PALETTE.ink)
      this.doc.text(this.line1(it.title, CONTENT_W - 72), tx, y + 8)
      this.font(7)
      this.ink(PALETTE.muted)
      const sub = it.points ? `${Math.round(it.points.got)} of ${Math.round(it.points.max)} pts${it.note ? ` · ${it.note}` : ''}` : it.note ?? ''
      this.doc.text(this.line1(sub, CONTENT_W - 72), tx, y + 13.2)
      const barW = CONTENT_W - 26 - 44
      this.fill(PALETTE.track)
      this.doc.roundedRect(tx, y + 16.5, barW, 3.2, 1.6, 1.6, 'F')
      if (it.score !== null && it.score > 0) {
        this.fill(TONE_COLOR[tone])
        this.doc.roundedRect(tx, y + 16.5, Math.max(3.2, (barW * Math.min(100, it.score)) / 100), 3.2, 1.6, 1.6, 'F')
      }
      this.pill(A4.w - MARGIN - 24, y + 5, 20, 13, TONE_COLOR[tone], it.score === null ? '—' : `${it.score.toFixed(0)}%`, 10)
      this.y += h + gap
    })
    return this
  }

  /** The closing band of a score spread: the headline figure and what it means. */
  totalBand(opts: { label: string; value: string; note?: string; body?: string }) {
    this.font(7.6)
    const bodyLines = opts.body ? (this.doc.splitTextToSize(opts.body, CONTENT_W - 24) as string[]) : []
    const h = 20 + (opts.note ? 4 : 0) + (bodyLines.length ? bodyLines.length * 4.4 + 6 : 0)
    this.ensure(h + 4)
    const y = this.y
    this.fill(PALETTE.brand)
    this.doc.roundedRect(MARGIN, y, CONTENT_W, h, 2.4, 2.4, 'F')
    this.fill(PALETTE.accent)
    this.doc.roundedRect(MARGIN - 1, y, 5, h, 2, 2, 'F')
    this.font(12, 'bold')
    this.ink(PALETTE.white)
    this.doc.text(opts.label.toUpperCase(), MARGIN + 12, y + 11)
    this.font(19, 'bold')
    this.ink(PALETTE.accent)
    this.doc.text(opts.value, A4.w - MARGIN - 8, y + 12.5, { align: 'right' })
    if (opts.note) {
      this.font(7.4)
      this.ink([168, 190, 228])
      this.doc.text(this.line1(opts.note, CONTENT_W - 60), MARGIN + 12, y + 16.5)
    }
    if (bodyLines.length) {
      this.stroke([72, 110, 188])
      this.doc.setLineWidth(0.3)
      this.doc.line(MARGIN + 12, y + 20.5, A4.w - MARGIN - 8, y + 20.5)
      this.font(7.6)
      this.ink([206, 222, 244])
      this.doc.text(bodyLines, MARGIN + 12, y + 25.5, { lineHeightFactor: 1.5 })
    }
    this.y += h + 4
    return this
  }

  /**
   * The questionnaire as the client prints it: a row per question tinted by
   * result, with the shopper's observation in a band underneath.
   *
   * A failed question is set in red and in bold, so a reader can find every lost
   * point by flicking through the document.
   */
  questionTable(rows: QuestionRow[], opts: { pointsColumn?: boolean } = {}) {
    const showPoints = opts.pointsColumn !== false
    const numW = 13
    const maxW = showPoints ? 16 : 0
    const scoreW = showPoints ? 18 : 24
    const textW = CONTENT_W - numW - maxW - scoreW

    const header = () => {
      this.ensure(9 + 12)
      this.fill(PALETTE.brand)
      this.doc.roundedRect(MARGIN, this.y, CONTENT_W, 9, 1.6, 1.6, 'F')
      this.font(6.6, 'bold')
      this.ink(PALETTE.white)
      this.doc.text('No.', MARGIN + numW / 2, this.y + 5.8, { align: 'center', charSpace: 0.3 })
      this.doc.text('AUDIT QUESTION', MARGIN + numW + 3, this.y + 5.8, { charSpace: 0.3 })
      if (showPoints) this.doc.text('MAX', MARGIN + numW + textW + maxW / 2, this.y + 5.8, { align: 'center', charSpace: 0.3 })
      this.doc.text('SCORE', A4.w - MARGIN - scoreW / 2, this.y + 5.8, { align: 'center', charSpace: 0.3 })
      this.y += 9
    }
    header()

    rows.forEach((r) => {
      const failed = !r.skipped && r.score !== null && r.score < 0.5
      const partial = !r.skipped && r.score !== null && r.score >= 0.5 && r.score < 1
      const wash = r.skipped || r.score === null ? PALETTE.zebra : failed ? PALETTE.badWash : partial ? PALETTE.warnWash : PALETTE.goodWash
      const colour = r.skipped || r.score === null ? PALETTE.muted : failed ? PALETTE.bad : partial ? PALETTE.warn : PALETTE.good

      this.font(7.4, failed ? 'bold' : 'normal')
      const textLines = this.doc.splitTextToSize(r.text, textW - 6) as string[]
      const rowH = Math.max(9.5, textLines.length * 3.6 + 5 + (r.critical ? 3 : 0) + (r.answerNote ? 3.4 : 0))
      this.font(7)
      const obsLines = r.observation ? (this.doc.splitTextToSize(r.observation, CONTENT_W - 14) as string[]) : []
      const obsH = obsLines.length ? obsLines.length * 3.4 + 9 : 0
      // Keep a question and its observation together: a split would orphan the
      // explanation from the answer it explains.
      if (this.y + rowH + obsH > FOOT_LIMIT) {
        this.newPage()
        header()
      }

      const y = this.y
      this.fill(wash)
      this.doc.rect(MARGIN, y, CONTENT_W, rowH, 'F')
      this.stroke(PALETTE.white)
      this.doc.setLineWidth(0.5)
      this.doc.line(MARGIN, y + rowH, A4.w - MARGIN, y + rowH)

      this.font(6.8, 'bold')
      this.ink(failed ? PALETTE.bad : PALETTE.brand)
      this.doc.text(r.code, MARGIN + numW / 2, y + rowH / 2 + 1.2, { align: 'center' })

      this.font(7.4, failed ? 'bold' : 'normal')
      this.ink(failed ? PALETTE.bad : PALETTE.ink)
      this.doc.text(textLines, MARGIN + numW + 3, y + 4.6)
      if (r.answerNote) {
        // A score of 3 out of 5 says how much was earned, not what was seen. For a
        // timing or a rating, what was seen is the part a manager can act on.
        this.font(6.4, 'bold')
        this.ink(failed ? PALETTE.bad : PALETTE.muted)
        this.doc.text(this.line1(r.answerNote, textW - 6), MARGIN + numW + 3, y + 4.6 + textLines.length * 3.6 + 1.4)
      }
      if (r.critical) {
        this.font(5.8, 'bold')
        this.ink(PALETTE.bad)
        this.doc.text('CRITICAL STANDARD', MARGIN + numW + 3, y + rowH - 2.4, { charSpace: 0.3 })
      }

      if (showPoints) {
        this.font(7.4)
        this.ink(PALETTE.muted)
        this.doc.text(r.points ? String(Math.round(r.points.max)) : '—', MARGIN + numW + textW + maxW / 2, y + rowH / 2 + 1.2, { align: 'center' })
      }
      // A question that carries no score still carries an answer — a clock stamp,
      // a photograph, a comment — and the column is where the reader looks for it.
      const unscored = r.skipped ? 'skip' : r.answer && r.answer !== '—' ? r.answer : 'n/a'
      this.font(r.score === null ? 7.2 : 8.4, 'bold')
      this.ink(colour)
      const scoreText = r.score === null || r.skipped ? unscored : r.points ? String(Math.round(r.points.got)) : `${Math.round(r.score * 100)}%`
      this.doc.text(this.line1(scoreText, scoreW - 2), A4.w - MARGIN - scoreW / 2, y + rowH / 2 + 1.4, { align: 'center' })
      this.y += rowH

      if (obsLines.length) {
        const oy = this.y
        this.fill(PALETTE.obsWash)
        this.doc.rect(MARGIN, oy, CONTENT_W, obsH, 'F')
        this.fill(PALETTE.accent)
        this.doc.rect(MARGIN, oy, 2, obsH, 'F')
        this.font(6.2, 'bold')
        this.ink(PALETTE.accent)
        this.doc.text(r.answer ? `Observation · answered ${r.answer}` : 'Observation', MARGIN + 6, oy + 4.6)
        this.font(7)
        this.ink(PALETTE.body)
        this.doc.text(obsLines, MARGIN + 6, oy + 9)
        this.stroke(PALETTE.white)
        this.doc.setLineWidth(0.5)
        this.doc.line(MARGIN, oy + obsH, A4.w - MARGIN, oy + obsH)
        this.y += obsH
      }
    })
    this.y += 4
    return this
  }

  /**
   * A table that belongs on paper: the header repeats on every page it runs
   * onto, rows never split, and a row only starts if it fits whole.
   */
  table<R>(columns: PdfColumn<R>[], rows: R[], opts: { zebra?: boolean; footer?: string[] } = {}) {
    const declared = columns.reduce((n, c) => n + (c.width ?? 0), 0)
    const free = columns.filter((c) => !c.width).length
    const unit = CONTENT_W / (declared + free * (declared ? declared / columns.length : 1) || columns.length)
    const widths = columns.map((c) => (c.width ? c.width : declared ? declared / columns.length : 1) * unit)
    const total = widths.reduce((a, b) => a + b, 0)
    const w = widths.map((v) => (v / total) * CONTENT_W)

    this.font(6.8, 'bold')
    // splitTextToSize measures without the letter-spacing the header is drawn
    // with, so the budget has to allow for it — otherwise a long header is
    // measured as fitting and then drawn wide enough to run into its neighbour.
    const HEADER_TRACKING = 0.3
    const headerCells = columns.map((c, i) => {
      const text = c.header.toUpperCase()
      const budget = Math.max(8, w[i] - 4 - text.length * HEADER_TRACKING)
      return (this.doc.splitTextToSize(text, budget) as string[]).slice(0, 2)
    })
    const headerLines = Math.max(1, ...headerCells.map((l) => l.length))
    const headerH = 4.2 + headerLines * 3.1

    const drawHeader = () => {
      this.ensure(headerH + 6)
      this.fill(PALETTE.brand)
      this.doc.rect(MARGIN, this.y, CONTENT_W, headerH, 'F')
      this.font(6.8, 'bold')
      this.ink(PALETTE.white)
      let x = MARGIN
      columns.forEach((c, i) => {
        const align = c.align ?? 'left'
        const tx = align === 'right' ? x + w[i] - 2 : align === 'center' ? x + w[i] / 2 : x + 2
        this.doc.text(headerCells[i], tx, this.y + 3.9, { align, charSpace: HEADER_TRACKING })
        x += w[i]
      })
      this.y += headerH
    }

    drawHeader()

    rows.forEach((row, ri) => {
      const cells = columns.map((c, i) => {
        this.font(7.3, c.strong ? 'bold' : 'normal')
        return this.doc.splitTextToSize(c.render(row) || '—', w[i] - 4) as string[]
      })
      const lines = Math.max(1, ...cells.map((l) => l.length))
      const rowH = Math.max(6.4, lines * 3.5 + 3)

      if (this.y + rowH > FOOT_LIMIT) {
        this.newPage()
        drawHeader()
      }

      this.fill(opts.zebra !== false && ri % 2 === 1 ? PALETTE.zebra : PALETTE.white)
      this.doc.rect(MARGIN, this.y, CONTENT_W, rowH, 'F')

      let x = MARGIN
      columns.forEach((c, i) => {
        const tone = c.tone?.(row) ?? 'default'
        this.font(7.3, c.strong ? 'bold' : 'normal')
        this.ink(TONE_COLOR[tone] ?? PALETTE.ink)
        const align = c.align ?? 'left'
        const tx = align === 'right' ? x + w[i] - 2 : align === 'center' ? x + w[i] / 2 : x + 2
        this.doc.text(cells[i], tx, this.y + 4.2, { align })
        x += w[i]
      })

      this.stroke(PALETTE.hairline)
      this.doc.setLineWidth(0.15)
      this.doc.line(MARGIN, this.y + rowH, A4.w - MARGIN, this.y + rowH)
      this.y += rowH
    })

    if (opts.footer) {
      const rowH = 7
      this.ensure(rowH)
      this.fill(PALETTE.brandWash)
      this.doc.rect(MARGIN, this.y, CONTENT_W, rowH, 'F')
      this.font(7.3, 'bold')
      this.ink(PALETTE.brand)
      let x = MARGIN
      columns.forEach((c, i) => {
        const align = c.align ?? 'left'
        const tx = align === 'right' ? x + w[i] - 2 : align === 'center' ? x + w[i] / 2 : x + 2
        this.doc.text(opts.footer![i] ?? '', tx, this.y + 4.6, { align })
        x += w[i]
      })
      this.y += rowH
    }

    this.y += 3
    return this
  }

  /** A list with a coloured marker — observations, recommendations, checklists. */
  bullets(items: string[], tone: CellTone = 'default', marker = '•') {
    if (!items.length) {
      this.paragraph('None recorded.', { size: 8 })
      return this
    }
    for (const it of items) {
      this.font(8)
      const lines = this.doc.splitTextToSize(it, CONTENT_W - 5) as string[]
      this.ensure(lines.length * 3.9 + 1.5)
      this.ink(TONE_COLOR[tone] ?? PALETTE.accent)
      this.font(8, 'bold')
      this.doc.text(marker, MARGIN, this.y)
      this.font(8)
      this.ink(PALETTE.body)
      this.doc.text(lines, MARGIN + 4, this.y)
      this.y += lines.length * 3.9 + 1.4
    }
    this.y += 1.5
    return this
  }

  /** A tinted panel for something that must not be skimmed past. */
  callout(title: string, body: string[], tone: Exclude<CellTone, 'default' | 'muted'> = 'bad') {
    this.font(8)
    const wrapped = body.flatMap((b) => this.doc.splitTextToSize(b, CONTENT_W - 10) as string[])
    const h = 9 + wrapped.length * 4 + 3
    this.ensure(h)
    this.fill(TONE_WASH[tone] ?? PALETTE.zebra)
    this.stroke(TONE_COLOR[tone])
    this.doc.setLineWidth(0.3)
    this.doc.roundedRect(MARGIN, this.y, CONTENT_W, h, 1.5, 1.5, 'FD')
    this.fill(TONE_COLOR[tone])
    this.doc.rect(MARGIN, this.y, 1.4, h, 'F')
    this.font(8.6, 'bold')
    this.ink(TONE_COLOR[tone])
    this.doc.text(title, MARGIN + 5, this.y + 6)
    this.font(8)
    this.ink(PALETTE.body)
    this.doc.text(wrapped, MARGIN + 5, this.y + 11.5)
    this.y += h + 4
    return this
  }

  /** A pull quote — the shopper's own account of the visit. */
  quote(text: string) {
    this.font(8.4)
    const lines = this.doc.splitTextToSize(text, CONTENT_W - 12) as string[]
    const h = lines.length * 4.1 + 9
    this.ensure(h)
    this.card(MARGIN, this.y, CONTENT_W, h, 2)
    this.fill(PALETTE.accent)
    this.doc.roundedRect(MARGIN, this.y, 2.4, h, 1.2, 1.2, 'F')
    this.ink(PALETTE.body)
    this.font(8.4)
    this.doc.text(lines, MARGIN + 7, this.y + 6.5)
    this.y += h + 3
    return this
  }

  /**
   * Evidence, two to a row.
   *
   * Captures that decode are placed as images; anything else keeps its slot as a
   * labelled plate, so the reader can still see what was collected and when.
   */
  photoGrid(items: { image?: string | null; title: string; caption?: string }[], columns = 2) {
    const gap = 5
    const colW = (CONTENT_W - gap * (columns - 1)) / columns
    const imgH = 56
    const h = imgH + 14
    items.forEach((it, i) => {
      const col = i % columns
      if (col === 0) this.ensure(h + gap)
      const x = MARGIN + col * (colW + gap)
      const y = this.y
      this.card(x, y, colW, h, 2)
      let placed = false
      if (it.image) {
        try {
          this.doc.addImage(it.image, 'JPEG', x + 2, y + 2, colW - 4, imgH)
          placed = true
        } catch {
          placed = false
        }
      }
      if (!placed) {
        this.fill(PALETTE.brandWash)
        this.doc.roundedRect(x + 2, y + 2, colW - 4, imgH, 1.6, 1.6, 'F')
        this.font(7, 'bold')
        this.ink(PALETTE.brand)
        this.doc.text('CAPTURE ON FILE', x + colW / 2, y + imgH / 2 + 2, { align: 'center', charSpace: 0.5 })
      }
      this.font(7.4, 'bold')
      this.ink(PALETTE.ink)
      this.doc.text(this.line1(it.title, colW - 6), x + 3, y + imgH + 6.5)
      if (it.caption) {
        this.font(6.4)
        this.ink(PALETTE.muted)
        this.doc.text(this.line1(it.caption, colW - 6), x + 3, y + imgH + 11)
      }
      if (col === columns - 1 || i === items.length - 1) this.y += h + gap
    })
    return this
  }

  /**
   * Stamps the footer band on every page and writes the file.
   *
   * Drawn last because it carries "page n of m", and m is only known once the
   * last block has been laid out. The covers are skipped: they carry their own.
   */
  save(filename: string, opts: { confidential?: boolean } = {}) {
    const pages = this.doc.getNumberOfPages()
    const stamp = format(new Date(), 'd MMM yyyy')
    const mark = `${CLIENT.brand.name.toUpperCase()}  ·  ${CLIENT.org.engagementName}`
    for (let p = 1; p <= pages; p++) {
      this.doc.setPage(p)
      const bare = this.plain.has(p)
      const y = A4.h - 11
      if (!bare) {
        this.fill(PALETTE.brand)
        this.doc.rect(0, y, A4.w, 11, 'F')
        this.fill(PALETTE.accent)
        this.doc.rect(0, y, 5, 11, 'F')
        this.font(6.4)
        this.ink([188, 208, 238])
        this.doc.text(mark, A4.w / 2, y + 6.6, { align: 'center', charSpace: 0.3 })
        this.font(6.2)
        this.doc.text(`${opts.confidential === false ? '' : 'Confidential · '}${stamp}`, MARGIN, y + 6.6)
        // The page number rides an accent chip at the outside edge.
        this.fill(PALETTE.accent)
        this.doc.roundedRect(A4.w - MARGIN - 12, y + 2.4, 12, 6.2, 1.4, 1.4, 'F')
        this.font(6.8, 'bold')
        this.ink(PALETTE.white)
        this.doc.text(String(p), A4.w - MARGIN - 6, y + 6.8, { align: 'center' })
      }
    }
    this.doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
  }
}

/**
 * The client mark as a data URL, for the cover.
 *
 * Returns null on any failure — a missing logo should cost the reader a small
 * square of colour, never the report.
 */
/** The organisation's mark for a report cover: the logo uploaded in Settings, else the built-in one. */
export async function loadClientMark(): Promise<string | null> {
  return loadMark(uploadedOrganizationLogo() ?? `${import.meta.env.BASE_URL}${CLIENT.brand.markFile}`)
}

/** A company's uploaded logo for a report cover, or null when none was uploaded. */
export async function loadBrandMark(brandName: string): Promise<string | null> {
  const src = uploadedBrandLogo(brandName)
  return src ? loadMark(src) : null
}

/** Any image (URL or data URL) squared onto a white tile, as a PNG data URL jsPDF can place. */
async function loadMark(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // The cover is dark and marks are often transparent PNGs, so the mark is
    // matted onto white rather than disappearing into it.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    const scale = Math.min(size / bitmap.width, size / bitmap.height)
    const w = bitmap.width * scale
    const h = bitmap.height * scale
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}
