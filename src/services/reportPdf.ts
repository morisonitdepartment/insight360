import type {
  AuditTemplate,
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
import { uploadedBrandLogo, uploadedOrganizationLogo } from '@/utils/logos'
import { CLIENT } from '@/config/client'
import { T } from '@/config/terms'
import { getRepository } from '@/repositories'
import { INTER_FILES, PHOTO_RATIO, buildVisitReport, type InterFonts } from './visitReportPdf'
import { buildOutletReport } from './outletReportPdf'
import { buildCompareReport, buildSummaryReport } from './portfolioReportsPdf'

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
  thresholds?: ScoreThreshold[]
}

export async function exportComparePdf(i: ComparePdfInput): Promise<void> {
  const [{ jsPDF }, fonts, clientMark] = await Promise.all([import('jspdf'), loadInterFonts(), loadClientMark()])
  const doc = buildCompareReport(jsPDF, i, { fonts, clientMark, issued: new Date() })
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
  /** The portfolio score for the cover ring. */
  score?: number | null
  /** Up to three figures beside the ring. */
  stats?: { v: string; l: string }[]
  /** Printed in every footer, e.g. the report number. */
  reference?: string
  thresholds?: ScoreThreshold[]
}

export async function exportSummaryPdf(i: SummaryPdfInput): Promise<void> {
  const [{ jsPDF }, fonts, clientMark] = await Promise.all([import('jspdf'), loadInterFonts(), loadClientMark()])
  const doc = buildSummaryReport(jsPDF, i, { fonts, clientMark, issued: new Date() })
  doc.save(i.filename)
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
