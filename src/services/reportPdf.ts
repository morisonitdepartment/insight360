import { format } from 'date-fns'
import type {
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
import { CATEGORY_KEYS, CATEGORY_LABELS } from '@/utils/scoring'
import { ReportDoc, loadBrandMark, loadClientMark, scoreTone, type CellTone, type PdfColumn } from '@/utils/pdf'
import { CLIENT } from '@/config/client'
import { T } from '@/config/terms'
import { getRepository } from '@/repositories'
import { INTER_FILES, PHOTO_RATIO, buildVisitReport, type InterFonts } from './visitReportPdf'
import { buildOutletReport } from './outletReportPdf'

/**
 * The photograph behind a piece of evidence, cropped to the report's frame and
 * encoded as JPEG for the PDF — or null for a video, a PDF attachment, seeded
 * sample evidence, or a file that cannot be fetched (the frame then reads
 * "CAPTURE ON FILE", as before).
 *
 * Cropped rather than squeezed: the grid's frames are a fixed landscape shape,
 * and jsPDF stretches whatever it is given to fill one, which turns a portrait
 * phone photo into a smear.
 */
async function evidenceImage(e: Evidence, ratio: number): Promise<string | null> {
  if (e.type === 'Video' || e.fileName?.toLowerCase().endsWith('.pdf')) return null
  const url = await getRepository().evidenceUrl(e).catch(() => null)
  if (!url) return null
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    const W = 1000
    const H = Math.round(W / ratio)
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight)
    const dw = img.naturalWidth * scale
    const dh = img.naturalHeight * scale
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
    return canvas.toDataURL('image/jpeg', 0.8)
  } catch {
    return null
  }
}

/**
 * The documents the programme issues.
 *
 * Each builder takes what the page already has on screen and lays it out for
 * paper. Nothing is recomputed here: a printed report that disagreed with the
 * screen it was exported from would be worse than no report at all.
 */

const pct = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${v.toFixed(1)}%`)

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
const riskTone = (risk: string | null | undefined): CellTone =>
  risk === 'Excellent' || risk === 'Good' ? 'good' : risk === 'Needs Improvement' ? 'warn' : risk === 'Critical' ? 'bad' : 'muted'

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
  const evidence = i.evidence ?? []
  const [{ jsPDF }, fonts, clientMark, brandMark, images] = await Promise.all([
    import('jspdf'),
    loadInterFonts(),
    loadClientMark(),
    loadBrandMark(i.outlet.brand),
    Promise.all(evidence.map((e) => evidenceImage(e, PHOTO_RATIO))),
  ])
  const doc = buildVisitReport(jsPDF, i, {
    fonts,
    clientMark,
    brandMark,
    photos: new Map(evidence.map((e, n) => [e.id, images[n]])),
    issued: new Date(),
  })
  doc.save(`${i.visit.code}-visit-report.pdf`)
}

/**
 * Inter, which the visit report is set in, fetched once per session from the
 * site's own /fonts folder and kept for the next export.
 */
let interCache: Promise<InterFonts> | null = null
function loadInterFonts(): Promise<InterFonts> {
  interCache ??= Promise.all(
    Object.entries(INTER_FILES).map(async ([key, file]) => {
      const res = await fetch(`${import.meta.env.BASE_URL}fonts/${file}`)
      if (!res.ok) throw new Error(`Could not load the report font (${file})`)
      const bytes = new Uint8Array(await res.arrayBuffer())
      let bin = ''
      for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000))
      return [key, btoa(bin)] as const
    }),
  )
    .then((pairs) => Object.fromEntries(pairs) as InterFonts)
    .catch((e) => {
      interCache = null
      throw e
    })
  return interCache
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
  thresholds?: ScoreThreshold[]
}

export async function exportOutletReportPdf(i: OutletPdfInput): Promise<void> {
  const [{ jsPDF }, fonts, clientMark, brandMark] = await Promise.all([import('jspdf'), loadInterFonts(), loadClientMark(), loadBrandMark(i.outlet.brand)])
  const doc = buildOutletReport(jsPDF, i, { fonts, clientMark, brandMark, issued: new Date() })
  doc.save(`${i.outlet.code}-${T.outlet}-report.pdf`)
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
