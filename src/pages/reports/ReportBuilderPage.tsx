import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { format, isBefore, subMonths } from 'date-fns'
import { AlertTriangle, BookOpenCheck, Camera, CheckCircle2, ClipboardList, Download, FileText, Lightbulb, Loader2, Printer, Save, Search, ShieldAlert, Table2, TrendingUp, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import type { CategoryKey, CorrectiveAction, Finding, Outlet, ReportType, Segment, VisitType } from '@/types'
import { createReport, logExport } from '@/services/actions'
import { kpiSummary, monthlyTrend, rankedOutlets } from '@/services/analytics'
import { isOpenFinding, isScored } from '@/services/derive'
import { CATEGORY_SHORT } from '@/utils/scoring'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { Badge, SeverityBadge, StatusBadge } from '@/components/ui/Badge'
import { Checkbox, Field, Input, Select, Toggle } from '@/components/ui/Form'
import { EvidenceCard } from '@/components/ui/EvidenceThumb'
import { AutomatedLabel } from '@/components/ui/Misc'
import { TrendChart, CHART_COLORS, SERIES_COLORS } from '@/components/charts'
import { exportCsv, exportElementToPdf, printPage } from '@/utils/export'
import { avg, fmtDate, fmtDateTime, fmtDelta, fmtPct, SEVERITY_ORDER } from '@/utils/format'
import { cn } from '@/utils/cn'

// ───────────────────────────── Constants ─────────────────────────────

const REPORT_TYPES: ReportType[] = ['Executive Summary', 'Main Audit Report', 'Follow-up Report', 'Quarterly Performance', 'Outlet Performance', 'Risk & Compliance', 'Corrective Action', 'Trend Analysis']
const VISIT_TYPES: VisitType[] = ['Main Audit 1', 'Follow-up 1', 'Main Audit 2', 'Follow-up 2']
const SEGMENTS: Segment[] = ['F&B', 'Entertainment']

type SectionKey = 'summary' | 'kpis' | 'trends' | 'rankings' | 'issues' | 'recommendations' | 'evidence' | 'actions'

interface SectionDef {
  key: SectionKey
  label: string
  description: string
}

const SECTION_DEFS: SectionDef[] = [
  { key: 'summary', label: 'Executive Summary', description: 'Narrative overview of scope and headline results' },
  { key: 'kpis', label: 'KPI Cards', description: 'Overall score and each selected KPI with change' },
  { key: 'trends', label: 'Trend Charts', description: 'Monthly score trend for the last 12 months' },
  { key: 'rankings', label: 'Rankings', description: 'Top and bottom performing outlets' },
  { key: 'issues', label: 'Issues', description: 'Open findings by severity' },
  { key: 'recommendations', label: 'Recommendations', description: 'Rule-based improvement actions' },
  { key: 'evidence', label: 'Evidence', description: 'Sample of captured visit evidence' },
  { key: 'actions', label: 'Corrective Actions', description: 'CAPA register with owners and target dates' },
]

const KPI_HINTS: Record<CategoryKey, string> = {
  customer_experience: 'refresh greeting and farewell standards and coach floor staff using approved visit evidence',
  service_speed: 'review peak-period staffing and introduce order-to-serve time tracking',
  operational_compliance: 're-brief SOP checklists and schedule weekly manager spot-checks',
  product_environment: 'tighten pre-service cleaning and presentation checks',
  upselling_sales: 'run a suggestive-selling refresher and set daily upsell prompts',
  safety_entertainment: 're-run safety briefings and verify equipment checks are logged every shift',
}

// ───────────────────────────── Helpers ─────────────────────────────

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

function toggleIn<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

/** Prints with the light theme so the document surface is always paper-white. */
function printLight() {
  const root = document.documentElement
  const wasDark = root.classList.contains('dark')
  if (wasDark) root.classList.remove('dark')
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    if (wasDark) root.classList.add('dark')
    window.removeEventListener('afterprint', restore)
  }
  window.addEventListener('afterprint', restore)
  printPage()
  setTimeout(restore, 1200)
}

// ───────────────────────────── Document primitives ─────────────────────────────

function DocSection({ title, icon: Icon, subtitle, children }: { title: string; icon?: typeof FileText; subtitle?: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid border-t border-slate-200 pt-5 dark:border-navy-800">
      <div className="mb-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-navy-800 dark:text-slate-100">
          {Icon && <Icon className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />}
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function DocTable<T>({ rows, columns, rowKey, empty = 'No records' }: { rows: T[]; columns: { header: string; render: (r: T) => ReactNode; align?: 'right' | 'center'; width?: string }[]; rowKey: (r: T) => string; empty?: string }) {
  if (!rows.length) return <p className="text-xs text-slate-500 dark:text-slate-400">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-300 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:border-navy-700 dark:text-slate-400">
            {columns.map((c) => (
              <th key={c.header} className={cn('py-1.5 pr-3 font-semibold', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')} style={c.width ? { width: c.width } : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className="border-b border-slate-100 text-slate-800 dark:border-navy-800 dark:text-slate-200">
              {columns.map((c) => (
                <td key={c.header} className={cn('py-1.5 pr-3 align-top', c.align === 'right' && 'text-right tabular-nums', c.align === 'center' && 'text-center')}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ScoreCell({ score }: { score: number | null | undefined }) {
  const tone =
    score === null || score === undefined
      ? 'text-slate-400'
      : score >= 90
        ? 'text-emerald-700 dark:text-emerald-300'
        : score >= 80
          ? 'text-blue-700 dark:text-blue-300'
          : score >= 70
            ? 'text-amber-700 dark:text-amber-300'
            : 'text-red-700 dark:text-red-300'
  return <span className={cn('font-semibold tabular-nums', tone)}>{fmtPct(score)}</span>
}

function ConfigGroup({ title, hint, children, actions }: { title: string; hint?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <legend className="section-title">{title}</legend>
        {actions && <div className="flex items-center gap-1.5 text-xs">{actions}</div>}
      </div>
      {hint && <p className="-mt-1 mb-2 text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
      {children}
    </fieldset>
  )
}

// ───────────────────────────── Page ─────────────────────────────

export default function ReportBuilderPage() {
  useDocumentTitle('Report Builder')
  const navigate = useNavigate()
  const now = useNow()
  const { user, can } = useAuth()
  const { data, dispatch, scopedOutlets, scopedVisits } = useData()
  const [params] = useSearchParams()
  const previewRef = useRef<HTMLDivElement>(null)

  // ── Configuration state (query-string presets from the deliverables tracker are honoured) ──
  const presetType = params.get('type')
  const presetVisitType = params.get('visitType')
  const initialType: ReportType = REPORT_TYPES.includes(presetType as ReportType) ? (presetType as ReportType) : 'Executive Summary'
  const initialVisitType: VisitType | null = VISIT_TYPES.includes(presetVisitType as VisitType) ? (presetVisitType as VisitType) : null

  const [title, setTitle] = useState(initialVisitType ? `${initialVisitType} Report` : 'Custom Performance Report')
  const [type, setType] = useState<ReportType>(initialType)
  const [from, setFrom] = useState(() => format(subMonths(now, 12), 'yyyy-MM-dd'))
  const [to, setTo] = useState(() => format(now, 'yyyy-MM-dd'))
  const [outletSearch, setOutletSearch] = useState('')
  const [outletIds, setOutletIds] = useState<Set<string>>(() => new Set(scopedOutlets.map((o) => o.id)))
  const [brandIds, setBrandIds] = useState<Set<string>>(() => new Set(data.brands.map((b) => b.id)))
  const [segments, setSegments] = useState<Set<Segment>>(() => new Set(SEGMENTS))
  const [visitTypes, setVisitTypes] = useState<Set<VisitType>>(() => new Set(initialVisitType ? [initialVisitType] : VISIT_TYPES))
  const [kpis, setKpis] = useState<Set<CategoryKey>>(() => new Set(data.kpiConfig.map((k) => k.key)))
  const [sections, setSections] = useState<Record<SectionKey, boolean>>({ summary: true, kpis: true, trends: true, rankings: true, issues: true, recommendations: true, evidence: false, actions: true })
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  // ── Derived scope ──
  const visibleOutlets = useMemo(() => {
    const q = outletSearch.trim().toLowerCase()
    return q ? scopedOutlets.filter((o) => [o.name, o.code, o.brand, o.location].some((f) => f.toLowerCase().includes(q))) : scopedOutlets
  }, [scopedOutlets, outletSearch])

  const filteredOutlets = useMemo(() => scopedOutlets.filter((o) => outletIds.has(o.id) && brandIds.has(o.brandId) && segments.has(o.segment)), [scopedOutlets, outletIds, brandIds, segments])
  const outletIdSet = useMemo(() => new Set(filteredOutlets.map((o) => o.id)), [filteredOutlets])

  const filteredVisits = useMemo(
    () =>
      scopedVisits.filter((v) => {
        if (!outletIdSet.has(v.outletId) || !visitTypes.has(v.type)) return false
        const d = (v.visitDate ?? v.scheduledDate).slice(0, 10)
        return (!from || d >= from) && (!to || d <= to)
      }),
    [scopedVisits, outletIdSet, visitTypes, from, to],
  )
  const visitIdSet = useMemo(() => new Set(filteredVisits.map((v) => v.id)), [filteredVisits])

  const findings = useMemo(() => data.findings.filter((f) => outletIdSet.has(f.outletId)), [data.findings, outletIdSet])
  const actions = useMemo(() => data.correctiveActions.filter((a) => outletIdSet.has(a.outletId)), [data.correctiveActions, outletIdSet])
  const kpi = useMemo(() => kpiSummary(data, filteredOutlets), [data, filteredOutlets])
  const trend = useMemo(() => monthlyTrend(filteredVisits, findings, actions, now, 12), [filteredVisits, findings, actions, now])
  const ranked = useMemo(() => rankedOutlets(filteredOutlets), [filteredOutlets])
  const top = ranked.slice(0, 5)
  const bottom = [...ranked].reverse().slice(0, 5)

  const openIssues = useMemo(() => findings.filter(isOpenFinding).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.createdAt.localeCompare(a.createdAt)), [findings])
  const evidence = useMemo(() => data.evidence.filter((e) => visitIdSet.has(e.visitId)).slice(0, 8), [data.evidence, visitIdSet])
  const capaRows = useMemo(() => [...actions].sort((a, b) => (a.status === 'Closed' ? 1 : 0) - (b.status === 'Closed' ? 1 : 0) || a.targetDate.localeCompare(b.targetDate)), [actions])
  const overdueCapas = useMemo(() => actions.filter((a) => a.status === 'Overdue' || (a.status !== 'Closed' && isBefore(new Date(a.targetDate), now))), [actions, now])

  const selectedKpis = useMemo(() => data.kpiConfig.filter((k) => kpis.has(k.key)), [data.kpiConfig, kpis])
  const scoredVisits = useMemo(() => filteredVisits.filter(isScored), [filteredVisits])
  const cycleScore = useMemo(() => avg(scoredVisits.map((v) => v.score)), [scoredVisits])
  const outletName = useCallback((id: string) => data.outlets.find((o) => o.id === id)?.name ?? '—', [data.outlets])

  // ── Rule-based recommendations ──
  const recommendations = useMemo(() => {
    const out: string[] = []
    const cats = selectedKpis
      .map((k) => ({ key: k.key, label: k.name, target: k.target, value: kpi.categories[k.key].value }))
      .filter((c) => c.value !== null)
      .sort((a, b) => (a.value ?? 0) - (b.value ?? 0))
    const lowest = cats[0]
    if (lowest && (lowest.value ?? 0) < lowest.target) out.push(`Prioritise ${lowest.label}: the average of ${lowest.value?.toFixed(1)}% sits ${(lowest.target - (lowest.value ?? 0)).toFixed(1)} points below the ${lowest.target}% target — ${KPI_HINTS[lowest.key]}.`)
    const below70 = filteredOutlets.filter((o) => o.overallScore !== null && o.overallScore < 70)
    if (below70.length) out.push(`Launch intervention plans for ${below70.map((o) => o.name).join(', ')}: scores below 70% require an operations-manager site review within 14 days and a re-audit at the next follow-up.`)
    const repeated = findings.filter((f) => f.repeated && isOpenFinding(f))
    if (repeated.length) {
      const names = [...new Set(repeated.map((f) => outletName(f.outletId)))].slice(0, 4)
      out.push(`Conduct root-cause reviews for ${repeated.length} repeated finding${repeated.length === 1 ? '' : 's'} (${names.join(', ')}${repeated.length > 4 ? ', …' : ''}) — recurring issues indicate a process gap rather than a one-off lapse.`)
    }
    if (overdueCapas.length) out.push(`Clear ${overdueCapas.length} overdue corrective action${overdueCapas.length === 1 ? '' : 's'}; escalate owners whose target dates are exceeded by more than seven days.`)
    const openCritical = openIssues.filter((f) => f.severity === 'Critical')
    if (openCritical.length) out.push(`Acknowledge and resolve ${openCritical.length} open critical finding${openCritical.length === 1 ? '' : 's'} within the ${data.organization.escalationSlaHours}-hour escalation SLA; attach closure evidence before verification.`)
    if (!out.length) out.push('Performance is on target across the selected KPIs; sustain current standards and continue the follow-up verification cadence.')
    return out
  }, [selectedKpis, kpi, filteredOutlets, findings, overdueCapas, openIssues, outletName, data.organization.escalationSlaHours])

  // ── Report metadata ──
  const periodLabel = `${fmtDate(from)} – ${fmtDate(to)}`
  const segmentLabel = segments.size === SEGMENTS.length ? 'All segments' : [...segments].join(' + ') || 'No segment'
  const scopeLabel = `${filteredOutlets.length} outlet${filteredOutlets.length === 1 ? '' : 's'} · ${segmentLabel}`
  const enabledSections = SECTION_DEFS.filter((s) => sections[s.key])
  const estimatedPages = useMemo(() => {
    let pages = 1
    for (const s of enabledSections) {
      if (s.key === 'issues') pages += Math.max(1, Math.ceil(openIssues.length / 18))
      else if (s.key === 'actions') pages += Math.max(1, Math.ceil(capaRows.length / 18))
      else if (s.key === 'kpis' && sections.summary) pages += 0
      else pages += 1
    }
    return pages
  }, [enabledSections, openIssues.length, capaRows.length, sections.summary])

  const summaryText = useMemo(() => {
    const parts = [`${type} covering ${filteredOutlets.length} outlet${filteredOutlets.length === 1 ? '' : 's'} (${segmentLabel.toLowerCase()}) for ${periodLabel}.`]
    if (kpi.overall !== null) parts.push(`Portfolio score ${fmtPct(kpi.overall)}${kpi.overallDelta !== null ? ` (${fmtDelta(kpi.overallDelta)} pts vs previous assessment)` : ''}.`)
    if (scoredVisits.length) parts.push(`${scoredVisits.length} scored visit${scoredVisits.length === 1 ? '' : 's'} averaged ${fmtPct(cycleScore)}.`)
    parts.push(kpi.criticalIssues ? `${kpi.criticalIssues} critical issue${kpi.criticalIssues === 1 ? '' : 's'} open; ${kpi.capaOverdue} corrective action${kpi.capaOverdue === 1 ? '' : 's'} overdue.` : `No critical issues open; ${kpi.capaOpen} corrective action${kpi.capaOpen === 1 ? '' : 's'} in progress.`)
    return parts.join(' ')
  }, [type, filteredOutlets.length, segmentLabel, periodLabel, kpi, scoredVisits.length, cycleScore])

  const validation = !title.trim() ? 'Enter a report title before saving.' : !filteredOutlets.length ? 'Select at least one outlet (check the brand and segment filters) to generate a report.' : from > to ? 'The start date must be on or before the end date.' : null

  // ── Actions ──
  const saveReport = async () => {
    if (validation) {
      toast.error(validation)
      return
    }
    setSaving(true)
    try {
      await dispatch((d, ctx) => createReport(d, ctx, { title: title.trim(), type, period: periodLabel, status: 'Draft', scope: scopeLabel, outletIds: filteredOutlets.map((o) => o.id), summary: summaryText, pages: estimatedPages }))
      toast.success('Report saved as draft')
      navigate('/reports/management?report=latest')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the report')
    } finally {
      setSaving(false)
    }
  }

  const downloadPdf = async () => {
    if (!previewRef.current) return
    setExporting(true)
    const t = toast.loading('Rendering PDF…')
    try {
      await exportElementToPdf(previewRef.current, `${slug(title) || 'custom-report'}-${format(now, 'yyyyMMdd')}`)
      await dispatch((d, ctx) => logExport(d, ctx, `Report builder · ${title.trim() || 'Untitled'}`, 'PDF'))
      toast.success('PDF downloaded', { id: t })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'PDF export failed', { id: t })
    } finally {
      setExporting(false)
    }
  }

  const exportRankings = async () => {
    if (!ranked.length) {
      toast.error('No assessed outlets in scope to export')
      return
    }
    exportCsv(
      ranked.map((o, i) => ({
        Rank: i + 1,
        'Portfolio rank': o.rank ?? '',
        Outlet: o.name,
        Code: o.code,
        Brand: o.brand,
        Segment: o.segment,
        Subcategory: o.subcategory,
        Region: o.region,
        Score: o.overallScore ?? '',
        'Previous score': o.previousScore ?? '',
        Risk: o.riskRating,
        'Open issues': o.openIssues,
        'Critical findings': o.criticalFindings,
        'Last audit': o.lastAudit ?? '',
      })),
      `${slug(title) || 'custom-report'}-rankings`,
    )
    await dispatch((d, ctx) => logExport(d, ctx, `Report builder rankings (${ranked.length} outlets)`, 'CSV'))
    toast.success('Rankings exported to CSV')
  }

  const print = async () => {
    printLight()
    await dispatch((d, ctx) => logExport(d, ctx, `Report builder · ${title.trim() || 'Untitled'}`, 'Print'))
  }

  const trendSeries = useMemo(() => [{ key: 'overall', label: 'Overall', color: CHART_COLORS.navy }, ...selectedKpis.map((k, i) => ({ key: k.key, label: CATEGORY_SHORT[k.key], color: SERIES_COLORS[(i + 1) % SERIES_COLORS.length] }))], [selectedKpis])
  const trendData = useMemo(() => trend.map((p) => ({ ...p })) as Record<string, unknown>[], [trend])
  const canExport = can('reports.export')
  const canBuild = can('reports.build')

  return (
    <div className="space-y-5">
      <PageHeader
        title="Report Builder"
        subtitle="Compose a management report from live data — the preview updates as you refine the scope"
        badge={<Badge tone="teal">{enabledSections.length} of {SECTION_DEFS.length} sections</Badge>}
        actions={
          <>
            {canExport && (
              <button type="button" className="btn-secondary" onClick={() => void exportRankings()}>
                <Table2 className="h-4 w-4" aria-hidden /> Export CSV
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={() => void print()}>
              <Printer className="h-4 w-4" aria-hidden /> Print
            </button>
            {canExport && (
              <button type="button" className="btn-secondary" onClick={() => void downloadPdf()} disabled={exporting}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />} Download PDF
              </button>
            )}
            {canBuild && (
              <button type="button" className="btn-primary" onClick={() => void saveReport()} disabled={!!validation || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />} Save report
              </button>
            )}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* ───────── Configuration ───────── */}
        <Card className="no-print self-start lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <CardHeader title="Configuration" subtitle="Scope, filters and sections" />
          <CardBody className="space-y-6">
            {validation && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {validation}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Report title" htmlFor="rb-title" required className="sm:col-span-2">
                <Input id="rb-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Custom Performance Report" invalid={!title.trim()} maxLength={120} />
              </Field>
              <Field label="Report type" htmlFor="rb-type" className="sm:col-span-2">
                <Select id="rb-type" value={type} onChange={(e) => setType(e.target.value as ReportType)}>
                  {REPORT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="From" htmlFor="rb-from">
                <Input id="rb-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} invalid={from > to} />
              </Field>
              <Field label="To" htmlFor="rb-to">
                <Input id="rb-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} invalid={from > to} />
              </Field>
            </div>

            <ConfigGroup
              title="Outlets"
              actions={
                <>
                  <button type="button" className="link" onClick={() => setOutletIds((s) => new Set([...s, ...visibleOutlets.map((o) => o.id)]))}>
                    Select all
                  </button>
                  <span className="text-slate-300 dark:text-navy-600" aria-hidden>
                    ·
                  </span>
                  <button type="button" className="link" onClick={() => setOutletIds(new Set())}>
                    Clear
                  </button>
                </>
              }
            >
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
                <Input value={outletSearch} onChange={(e) => setOutletSearch(e.target.value)} placeholder="Search outlets…" aria-label="Search outlets" className="pl-8 pr-8" />
                {outletSearch && (
                  <button type="button" onClick={() => setOutletSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label="Clear search">
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
              <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-1.5 dark:border-navy-700">
                {visibleOutlets.map((o) => (
                  <Checkbox
                    key={o.id}
                    checked={outletIds.has(o.id)}
                    onChange={() => setOutletIds((s) => toggleIn(s, o.id))}
                    className="w-full rounded px-1.5 py-1 hover:bg-slate-50 dark:hover:bg-navy-800"
                    label={
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate">{o.name}</span>
                          <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {o.code} · {o.brand}
                          </span>
                        </span>
                        <span className={cn('shrink-0 text-xs font-semibold tabular-nums', o.overallScore === null ? 'text-slate-400' : o.overallScore < 70 ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300')}>{fmtPct(o.overallScore, 0)}</span>
                      </span>
                    }
                  />
                ))}
                {!visibleOutlets.length && <p className="px-2 py-3 text-center text-xs text-slate-500 dark:text-slate-400">No outlets match "{outletSearch}".</p>}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                {outletIds.size} of {scopedOutlets.length} selected · {filteredOutlets.length} in scope after brand and segment filters
              </p>
            </ConfigGroup>

            <div className="grid gap-5 sm:grid-cols-2">
              <ConfigGroup title="Brands">
                <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                  {data.brands.map((b) => (
                    <Checkbox key={b.id} checked={brandIds.has(b.id)} onChange={() => setBrandIds((s) => toggleIn(s, b.id))} label={<span className="flex items-center gap-1.5">{b.name}<span className="text-[11px] text-slate-400">({b.outletCount})</span></span>} />
                  ))}
                </div>
              </ConfigGroup>
              <div className="space-y-5">
                <ConfigGroup title="Segments">
                  <div className="space-y-1">
                    {SEGMENTS.map((s) => (
                      <Checkbox key={s} checked={segments.has(s)} onChange={() => setSegments((set) => toggleIn(set, s))} label={s} />
                    ))}
                  </div>
                </ConfigGroup>
                <ConfigGroup title="Visit types">
                  <div className="space-y-1">
                    {VISIT_TYPES.map((v) => (
                      <Checkbox key={v} checked={visitTypes.has(v)} onChange={() => setVisitTypes((set) => toggleIn(set, v))} label={v} />
                    ))}
                  </div>
                </ConfigGroup>
              </div>
            </div>

            <ConfigGroup title="KPIs" hint="Selected KPIs drive the KPI cards, trend lines and recommendations">
              <div className="grid gap-1 sm:grid-cols-2">
                {data.kpiConfig.map((k) => (
                  <Checkbox key={k.key} checked={kpis.has(k.key)} onChange={() => setKpis((s) => toggleIn(s, k.key))} label={<span className="flex items-center gap-1.5">{k.name}<span className="text-[11px] text-slate-400">{k.weight}%</span></span>} />
                ))}
              </div>
            </ConfigGroup>

            <ConfigGroup title="Sections to include" hint={`Estimated length: ${estimatedPages} page${estimatedPages === 1 ? '' : 's'}`}>
              <div className="space-y-2.5">
                {SECTION_DEFS.map((s) => (
                  <Toggle key={s.key} checked={sections[s.key]} onChange={(v) => setSections((prev) => ({ ...prev, [s.key]: v }))} label={s.label} description={s.description} />
                ))}
              </div>
            </ConfigGroup>
          </CardBody>
        </Card>

        {/* ───────── Preview ───────── */}
        <Card className="print-area min-w-0 overflow-hidden">
          <CardHeader
            className="no-print"
            title="Preview"
            subtitle={`${filteredOutlets.length} outlet${filteredOutlets.length === 1 ? '' : 's'} · ${filteredVisits.length} visit${filteredVisits.length === 1 ? '' : 's'} · ${openIssues.length} open issue${openIssues.length === 1 ? '' : 's'} · live from the current dataset`}
            actions={
              canExport ? (
                <button type="button" className="btn-secondary btn-sm" onClick={() => void downloadPdf()} disabled={exporting}>
                  {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />} PDF
                </button>
              ) : undefined
            }
          />
          <div className="bg-slate-100 p-3 dark:bg-navy-950 sm:p-6">
            <div ref={previewRef} className="print-area mx-auto max-w-4xl rounded-lg bg-white p-6 text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-navy-900 dark:text-slate-100 dark:ring-navy-700 sm:p-8">
              <div className="space-y-6">
                {/* Cover */}
                <header className="rounded-lg bg-navy-900 px-6 py-7 text-white dark:bg-navy-950 dark:ring-1 dark:ring-navy-700">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-300">{type}</p>
                      <h2 className="mt-1.5 break-words text-2xl font-semibold tracking-tight">{title.trim() || 'Untitled report'}</h2>
                      <p className="mt-1 text-sm text-slate-300">{data.organization.name}</p>
                      <p className="text-xs text-slate-400">{data.organization.engagementName}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:text-right">
                      <div>
                        <p className="text-slate-400">Period</p>
                        <p className="font-medium">{periodLabel}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Scope</p>
                        <p className="font-medium">{scopeLabel}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Generated by</p>
                        <p className="font-medium">{user?.name ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Generated at</p>
                        <p className="font-medium">{fmtDateTime(now)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                    <span className="rounded border border-white/20 px-1.5 py-0.5">Draft</span>
                    <span className="rounded border border-white/20 px-1.5 py-0.5">{[...visitTypes].length === VISIT_TYPES.length ? 'All visit types' : [...visitTypes].join(', ') || 'No visit types'}</span>
                    <span className="rounded border border-white/20 px-1.5 py-0.5">{selectedKpis.length} KPI{selectedKpis.length === 1 ? '' : 's'}</span>
                    <span className="rounded border border-white/20 px-1.5 py-0.5">~{estimatedPages} page{estimatedPages === 1 ? '' : 's'}</span>
                  </div>
                </header>

                {!filteredOutlets.length && (
                  <p className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-navy-700 dark:text-slate-400">No outlets in scope. Select outlets, brands and segments in the configuration panel to populate the report.</p>
                )}

                {/* Executive summary */}
                {sections.summary && (
                  <DocSection title="Executive Summary" icon={BookOpenCheck}>
                    <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{summaryText}</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {kpi.visitsCompleted} of {kpi.visitsPlanned} planned visit{kpi.visitsPlanned === 1 ? '' : 's'} across the scope are complete, with {kpi.visitsAwaiting} awaiting approval. Open issues total {kpi.openIssues} ({kpi.criticalIssues} critical, {kpi.highIssues} high, {kpi.mediumIssues} medium) and the corrective-action closure rate stands at {fmtPct(kpi.capaClosureRate, 0)}.
                    </p>
                  </DocSection>
                )}

                {/* KPI cards */}
                {sections.kpis && (
                  <DocSection title="Key Performance Indicators" icon={ClipboardList} subtitle="Current score versus the previous assessment for each selected KPI">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                      <KpiCard compact label="Overall score" value={fmtPct(kpi.overall)} delta={kpi.overallDelta} tone={kpi.overall === null ? 'default' : kpi.overall < 70 ? 'critical' : kpi.overall < 80 ? 'warn' : 'good'} icon={TrendingUp} sub={`${ranked.length} assessed`} />
                      {selectedKpis.map((k) => {
                        const c = kpi.categories[k.key]
                        return <KpiCard key={k.key} compact label={k.name} value={fmtPct(c.value)} delta={c.delta} tone={c.value === null ? 'default' : c.value < k.criticalThreshold ? 'critical' : c.value < k.target ? 'warn' : 'good'} sub={`Target ${k.target}%`} />
                      })}
                      {!selectedKpis.length && <p className="col-span-full text-xs text-slate-500 dark:text-slate-400">No KPIs selected — only the overall score is shown.</p>}
                    </div>
                  </DocSection>
                )}

                {/* Trend */}
                {sections.trends && (
                  <DocSection title="Performance Trends" icon={TrendingUp} subtitle={`Average scored visit result by month · ${trend[0]?.label} – ${trend[trend.length - 1]?.label}`}>
                    <div style={{ height: 260 }}>
                      <TrendChart data={trendData} series={trendSeries} target={data.kpiConfig[0]?.target ?? 85} yDomain={[40, 100]} />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
                      {trend.slice(-6).map((p) => (
                        <div key={p.key} className="rounded border border-slate-200 px-2 py-1.5 dark:border-navy-700">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{p.label}</p>
                          <p className="font-semibold tabular-nums text-slate-900 dark:text-white">{fmtPct(p.overall)}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">{p.count} visits</p>
                        </div>
                      ))}
                    </div>
                  </DocSection>
                )}

                {/* Rankings */}
                {sections.rankings && (
                  <DocSection title="Outlet Rankings" icon={Table2} subtitle={`${ranked.length} assessed outlet${ranked.length === 1 ? '' : 's'} in scope`}>
                    <div className="grid gap-5 lg:grid-cols-2">
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Top 5 performers</p>
                        <DocTable<Outlet>
                          rows={top}
                          rowKey={(o) => o.id}
                          empty="No assessed outlets."
                          columns={[
                            { header: '#', render: (o) => o.rank ?? '—', width: '32px' },
                            { header: 'Outlet', render: (o) => <span className="font-medium">{o.name}</span> },
                            { header: 'Segment', render: (o) => o.segment },
                            { header: 'Score', render: (o) => <ScoreCell score={o.overallScore} />, align: 'right' },
                            { header: 'Issues', render: (o) => o.openIssues, align: 'right' },
                          ]}
                        />
                      </div>
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">Bottom 5 performers</p>
                        <DocTable<Outlet>
                          rows={bottom}
                          rowKey={(o) => o.id}
                          empty="No assessed outlets."
                          columns={[
                            { header: '#', render: (o) => o.rank ?? '—', width: '32px' },
                            { header: 'Outlet', render: (o) => <span className="font-medium">{o.name}</span> },
                            { header: 'Segment', render: (o) => o.segment },
                            { header: 'Score', render: (o) => <ScoreCell score={o.overallScore} />, align: 'right' },
                            { header: 'Issues', render: (o) => (o.criticalFindings ? <span className="font-semibold text-red-700 dark:text-red-300">{o.openIssues} ({o.criticalFindings} crit.)</span> : o.openIssues), align: 'right' },
                          ]}
                        />
                      </div>
                    </div>
                  </DocSection>
                )}

                {/* Issues */}
                {sections.issues && (
                  <DocSection title="Open Issues" icon={ShieldAlert} subtitle={`${openIssues.length} open finding${openIssues.length === 1 ? '' : 's'} · sorted by severity`}>
                    <DocTable<Finding>
                      rows={openIssues.slice(0, 18)}
                      rowKey={(f) => f.id}
                      empty="No open findings in scope."
                      columns={[
                        { header: 'Code', render: (f) => <span className="font-medium">{f.code}</span>, width: '90px' },
                        { header: 'Outlet', render: (f) => outletName(f.outletId) },
                        { header: 'Finding', render: (f) => f.title },
                        { header: 'Category', render: (f) => CATEGORY_SHORT[f.category] },
                        { header: 'Severity', render: (f) => <SeverityBadge severity={f.severity} size="xs" /> },
                        { header: 'Status', render: (f) => <StatusBadge status={f.status} size="xs" /> },
                      ]}
                    />
                    {openIssues.length > 18 && <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">Showing 18 of {openIssues.length} open findings. The full register is available in the Findings module.</p>}
                  </DocSection>
                )}

                {/* Recommendations */}
                {sections.recommendations && (
                  <DocSection title="Improvement Recommendations" icon={Lightbulb}>
                    <ol className="space-y-2">
                      {recommendations.map((r, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-800 text-[11px] font-semibold text-white dark:bg-teal-600">{i + 1}</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      Recommendations are rule-based, derived from KPI targets, score thresholds and corrective-action status. <AutomatedLabel />
                    </p>
                  </DocSection>
                )}

                {/* Evidence */}
                {sections.evidence && (
                  <DocSection title="Evidence Sample" icon={Camera} subtitle={`First ${evidence.length} item${evidence.length === 1 ? '' : 's'} captured on visits in scope`}>
                    {evidence.length ? (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {evidence.map((e) => (
                          <EvidenceCard key={e.id} evidence={e} meta={`${outletName(e.outletId)} · ${fmtDate(e.capturedAt)}`} onClick={() => navigate(`/evidence?visit=${e.visitId}`)} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400">No evidence captured for the visits in scope.</p>
                    )}
                  </DocSection>
                )}

                {/* Corrective actions */}
                {sections.actions && (
                  <DocSection title="Corrective Actions" icon={CheckCircle2} subtitle={`${actions.length} action${actions.length === 1 ? '' : 's'} · ${overdueCapas.length} overdue · open actions first`}>
                    <DocTable<CorrectiveAction>
                      rows={capaRows.slice(0, 18)}
                      rowKey={(a) => a.id}
                      empty="No corrective actions in scope."
                      columns={[
                        { header: 'Code', render: (a) => <span className="font-medium">{a.code}</span>, width: '90px' },
                        { header: 'Outlet', render: (a) => outletName(a.outletId) },
                        { header: 'Action', render: (a) => a.title },
                        { header: 'Owner', render: (a) => a.ownerName },
                        { header: 'Status', render: (a) => <StatusBadge status={a.status} size="xs" /> },
                        { header: 'Target', render: (a) => <span className={cn(a.status !== 'Closed' && isBefore(new Date(a.targetDate), now) && 'font-semibold text-red-700 dark:text-red-300')}>{fmtDate(a.targetDate)}</span> },
                      ]}
                    />
                    {capaRows.length > 18 && <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">Showing 18 of {capaRows.length} actions.</p>}
                  </DocSection>
                )}

                <footer className="border-t border-slate-200 pt-3 text-[10px] text-slate-500 dark:border-navy-800 dark:text-slate-400">
                  {title.trim() || 'Untitled report'} · {type} · Draft generated from live INSIGHT360 data on {fmtDateTime(now)} by {user?.name ?? '—'} · Confidential — prepared for {data.organization.name}
                </footer>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
