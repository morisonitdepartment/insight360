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
 * These build the document instead. Every page is laid out for paper: a branded
 * header, real headings, tables that break between rows and repeat their header,
 * vector score bars, and a footer carrying the client, the page number and the
 * confidentiality mark. The text is text, so a reader can search it, a reviewer
 * can copy a finding out of it, and the file stays small enough to email.
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
  navy: [15, 32, 56] as Rgb,
  navySoft: [42, 62, 92] as Rgb,
  ink: [25, 32, 44] as Rgb,
  body: [64, 76, 94] as Rgb,
  muted: [128, 140, 158] as Rgb,
  hairline: [222, 228, 236] as Rgb,
  zebra: [247, 249, 251] as Rgb,
  white: [255, 255, 255] as Rgb,
  good: [13, 136, 97] as Rgb,
  warn: [181, 118, 14] as Rgb,
  bad: [191, 48, 48] as Rgb,
  goodWash: [236, 249, 244] as Rgb,
  warnWash: [254, 248, 235] as Rgb,
  badWash: [253, 240, 240] as Rgb,
  accent: hexToRgb(CLIENT.accent.chart),
}

/** Score → colour, on the same thresholds the application scores against. */
export function scoreTone(v: number | null | undefined): 'good' | 'warn' | 'bad' | 'muted' {
  if (v === null || v === undefined || Number.isNaN(v)) return 'muted'
  if (v >= 90) return 'good'
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
  /** 0-100, or null when the measure was not assessed. */
  value: number | null
  /** Shown to the right of the label, e.g. "weight 15%". */
  note?: string
}

export interface TileItem {
  label: string
  value: string
  note?: string
  tone?: CellTone
}

const A4 = { w: 210, h: 297 }
const MARGIN = 14
const CONTENT_W = A4.w - MARGIN * 2
/** Space the footer needs; nothing may be drawn below this line. */
const FOOT_LIMIT = A4.h - 16

/**
 * A report document under construction.
 *
 * The caller adds blocks in reading order and the builder decides where pages
 * break, so no block is ever split across a page in a way that loses its header.
 */
export class ReportDoc {
  private doc: jsPDF
  /** Current vertical pen position, in millimetres from the top of the page. */
  private y = MARGIN

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

  /** Starts a new page when `needed` millimetres will not fit below the pen. */
  private ensure(needed: number) {
    if (this.y + needed <= FOOT_LIMIT) return
    this.doc.addPage()
    this.y = MARGIN
  }

  /** Vertical gap. */
  gap(mm = 4) {
    this.y += mm
    return this
  }

  // ── blocks ────────────────────────────────────────────────────────────────

  /**
   * The band at the top of page one: who the report is about, what it is, and
   * the single number the reader is looking for.
   */
  cover(opts: { eyebrow: string; title: string; subtitle?: string; stat?: { value: string; label: string; tone?: CellTone }; logo?: string | null }) {
    const h = 42
    this.fill(PALETTE.navy)
    this.doc.rect(0, 0, A4.w, h, 'F')
    // A thin accent rule in the client's colour, so the page is recognisably theirs.
    this.fill(PALETTE.accent)
    this.doc.rect(0, h, A4.w, 1.4, 'F')

    if (opts.logo) {
      try {
        this.doc.addImage(opts.logo, 'PNG', MARGIN, 9, 11, 11)
      } catch {
        /* a mark that will not decode is not worth failing an export over */
      }
    }
    const textLeft = opts.logo ? MARGIN + 15 : MARGIN

    this.font(7.5, 'bold')
    this.ink([150, 170, 198])
    this.doc.text(opts.eyebrow.toUpperCase(), textLeft, 14, { charSpace: 0.5 })

    this.font(17, 'bold')
    this.ink(PALETTE.white)
    const titleW = opts.stat ? CONTENT_W - 46 : CONTENT_W
    const titleLines = this.doc.splitTextToSize(opts.title, titleW) as string[]
    this.doc.text(titleLines.slice(0, 2), textLeft, 23)

    if (opts.subtitle) {
      this.font(8.5)
      this.ink([172, 186, 206])
      this.doc.text(this.doc.splitTextToSize(opts.subtitle, titleW) as string[], textLeft, titleLines.length > 1 ? 36 : 31)
    }

    if (opts.stat) {
      const c = TONE_COLOR[opts.stat.tone ?? 'default'] ?? PALETTE.white
      this.font(24, 'bold')
      this.ink(opts.stat.tone && opts.stat.tone !== 'default' ? c : PALETTE.white)
      this.doc.text(opts.stat.value, A4.w - MARGIN, 24, { align: 'right' })
      this.font(7)
      this.ink([150, 170, 198])
      this.doc.text(opts.stat.label.toUpperCase(), A4.w - MARGIN, 30, { align: 'right', charSpace: 0.4 })
    }

    this.y = h + 9
    return this
  }

  /** A section heading: an accent tick, the title, and a hairline under both. */
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
    this.ink(TONE_COLOR[opts.tone ?? 'default'] ?? PALETTE.body)
    if (!opts.tone) this.ink(PALETTE.body)
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
      this.doc.text(this.doc.splitTextToSize(p.value || '—', colW - 3)[0] ?? '—', x, y + 4.2)
    })
    this.y += rows * 10 + 2
    return this
  }

  /** Boxed figures, three or four across — KPIs and headline numbers. */
  tiles(items: TileItem[], columns = 4) {
    const gap = 3
    const colW = (CONTENT_W - gap * (columns - 1)) / columns
    const rows = Math.ceil(items.length / columns)
    const tileH = 17
    this.ensure(rows * (tileH + gap))
    items.forEach((t, i) => {
      const col = i % columns
      const row = Math.floor(i / columns)
      const x = MARGIN + col * (colW + gap)
      const y = this.y + row * (tileH + gap)
      const wash = TONE_WASH[t.tone ?? '']
      this.fill(wash ?? PALETTE.zebra)
      this.stroke(PALETTE.hairline)
      this.doc.setLineWidth(0.2)
      this.doc.roundedRect(x, y, colW, tileH, 1.5, 1.5, 'FD')
      this.font(6.3, 'bold')
      this.ink(PALETTE.muted)
      this.doc.text((this.doc.splitTextToSize(t.label.toUpperCase(), colW - 4) as string[])[0] ?? '', x + 2.5, y + 5, { charSpace: 0.3 })
      this.font(12, 'bold')
      this.ink(TONE_COLOR[t.tone ?? 'default'] ?? PALETTE.ink)
      this.doc.text(t.value, x + 2.5, y + 11.4)
      if (t.note) {
        this.font(6.2)
        this.ink(PALETTE.muted)
        this.doc.text((this.doc.splitTextToSize(t.note, colW - 4) as string[])[0] ?? '', x + 2.5, y + 15)
      }
    })
    this.y += rows * (tileH + gap) + 3
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
      this.doc.text((this.doc.splitTextToSize(it.label, labelW) as string[])[0] ?? '', x, y)
      if (it.note) {
        this.font(6.4)
        this.ink(PALETTE.muted)
        const lw = this.doc.getTextWidth((this.doc.splitTextToSize(it.label, labelW) as string[])[0] ?? '')
        this.doc.text(it.note, x + lw + 2, y)
      }
      const tone = scoreTone(it.value)
      this.font(7.6, 'bold')
      this.ink(TONE_COLOR[tone])
      this.doc.text(it.value === null ? '—' : `${it.value.toFixed(1)}%`, x + colW, y, { align: 'right' })
      // Track, then the filled portion.
      const barY = y + 1.6
      this.fill(PALETTE.hairline)
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
   * A table that belongs on paper: the header repeats on every page it runs
   * onto, rows never split, and a row only starts if it fits whole.
   */
  table<R>(columns: PdfColumn<R>[], rows: R[], opts: { zebra?: boolean; footer?: string[] } = {}) {
    const declared = columns.reduce((n, c) => n + (c.width ?? 0), 0)
    const free = columns.filter((c) => !c.width).length
    const unit = CONTENT_W / (declared + free * (declared ? declared / columns.length : 1) || columns.length)
    const widths = columns.map((c) => (c.width ? c.width : declared ? declared / columns.length : 1) * unit)
    // Normalise so rounding never overflows the text column.
    const total = widths.reduce((a, b) => a + b, 0)
    const w = widths.map((v) => (v / total) * CONTENT_W)

    // A header is wrapped inside its own column — a long one used to run across
    // its neighbour and off the edge of the page.
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
      this.fill(PALETTE.navy)
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
      // Measure first: a row's height is set by its tallest wrapped cell.
      const cells = columns.map((c, i) => {
        this.font(7.3, c.strong ? 'bold' : 'normal')
        return this.doc.splitTextToSize(c.render(row) || '—', w[i] - 4) as string[]
      })
      const lines = Math.max(1, ...cells.map((l) => l.length))
      const rowH = Math.max(6.4, lines * 3.5 + 3)

      if (this.y + rowH > FOOT_LIMIT) {
        this.doc.addPage()
        this.y = MARGIN
        drawHeader()
      }

      if (opts.zebra !== false && ri % 2 === 1) {
        this.fill(PALETTE.zebra)
        this.doc.rect(MARGIN, this.y, CONTENT_W, rowH, 'F')
      }

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
      this.fill([238, 242, 247])
      this.doc.rect(MARGIN, this.y, CONTENT_W, rowH, 'F')
      this.font(7.3, 'bold')
      this.ink(PALETTE.ink)
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
    // A solid edge on the left, the way the screen marks the same panel.
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
    const lines = this.doc.splitTextToSize(text, CONTENT_W - 8) as string[]
    const h = lines.length * 4.1 + 7
    this.ensure(h)
    this.fill(PALETTE.zebra)
    this.doc.rect(MARGIN, this.y, CONTENT_W, h, 'F')
    this.fill(PALETTE.accent)
    this.doc.rect(MARGIN, this.y, 1.4, h, 'F')
    this.ink(PALETTE.body)
    this.doc.text(lines, MARGIN + 5, this.y + 5.5)
    this.y += h + 3
    return this
  }

  /**
   * Stamps the footer on every page and writes the file.
   *
   * The footer is drawn last because it carries "page n of m", and m is only
   * known once the last block has been laid out.
   */
  save(filename: string, opts: { confidential?: boolean } = {}) {
    const pages = this.doc.getNumberOfPages()
    const stamp = format(new Date(), 'd MMM yyyy')
    for (let p = 1; p <= pages; p++) {
      this.doc.setPage(p)
      this.stroke(PALETTE.hairline)
      this.doc.setLineWidth(0.2)
      this.doc.line(MARGIN, A4.h - 12, A4.w - MARGIN, A4.h - 12)
      this.font(6.4)
      this.ink(PALETTE.muted)
      this.doc.text(`${CLIENT.brand.name} · INSIGHT360 Mystery Shopping Programme`, MARGIN, A4.h - 8)
      const right = `${opts.confidential === false ? '' : 'Confidential · '}${stamp} · Page ${p} of ${pages}`
      this.doc.text(right, A4.w - MARGIN, A4.h - 8, { align: 'right' })
    }
    this.doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
  }
}

/**
 * The client mark as a data URL, for the cover.
 *
 * Returns null on any failure — a missing logo should cost the reader a small
 * square of navy, never the report.
 */
export async function loadClientMark(): Promise<string | null> {
  try {
    const url = `${import.meta.env.BASE_URL}${CLIENT.brand.markFile}`
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
    // The cover band is dark and marks are often transparent PNGs, so the mark
    // is matted onto white rather than disappearing into the navy.
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
