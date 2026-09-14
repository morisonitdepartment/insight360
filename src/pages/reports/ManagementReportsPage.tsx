import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { endOfMonth, isAfter, isBefore } from 'date-fns'
import { AlertOctagon, ArrowRight, BookOpenCheck, CheckCircle2, ClipboardList, Download, Eye, FileBarChart2, FileText, Lightbulb, Loader2, Printer, ShieldAlert, Sparkles, Table2, TrendingUp, Wand2, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import type { Alert, CategoryKey, CorrectiveAction, Dataset, Finding, ManagementReport, Outlet, ReportType, Visit, VisitType } from '@/types'
import { logExport } from '@/services/actions'
import { benchmarksFor, capaStats, categoryAverages, generateInsights, kpiSummary, mainVsFollowUp, monthlyTrend, outletVisitHistory, rankedOutlets, type CapaStats, type Insight, type KpiSummary, type MonthPoint } from '@/services/analytics'
import { isFollowUp, isMainAudit, isOpenFinding, isScored } from '@/services/derive'
import { CATEGORY_KEYS, CATEGORY_LABELS, CATEGORY_SHORT } from '@/utils/scoring'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge, StatusBadge, type Tone } from '@/components/ui/Badge'
import { AutomatedLabel } from '@/components/ui/Misc'
import { Input } from '@/components/ui/Form'
import { TrendChart, CHART_COLORS, SERIES_COLORS } from '@/components/charts'
import { exportCsv, exportElementToPdf, printPage } from '@/utils/export'
import { avg, fmtDate, fmtDateTime, fmtDelta, fmtPct, round, toDate } from '@/utils/format'
import { cn } from '@/utils/cn'

// ───────────────────────────── Constants ─────────────────────────────

const REPORT_TYPES: ReportType[] = ['Executive Summary', 'Main Audit Report', 'Follow-up Report', 'Quarterly Performance', 'Outlet Performance', 'Risk & Compliance', 'Corrective Action', 'Trend Analysis']

const TYPE_TONE: Record<ReportType, Tone> = {
  'Executive Summary': 'navy',
  'Main Audit Report': 'teal',
  'Follow-up Report': 'blue',
  'Quarterly Performance': 'violet',
  'Outlet Performance': 'slate',
  'Risk & Compliance': 'red',
  'Corrective Action': 'amber',
  'Trend Analysis': 'green',
}

type SectionKey = 'cover' | 'summary' | 'trends' | 'categoryTrends' | 'improvement' | 'insights' | 'rankings' | 'outlet' | 'risk' | 'alerts' | 'recommendations' | 'best' | 'capa' | 'capaTable'

const SECTIONS_BY_TYPE: Record<ReportType, SectionKey[]> = {
  'Executive Summary': ['cover', 'summary', 'trends', 'insights', 'rankings', 'risk', 'capa', 'recommendations'],
  'Main Audit Report': ['cover', 'summary', 'trends', 'insights', 'rankings', 'risk', 'recommendations', 'best', 'capa'],
  'Follow-up Report': ['cover', 'summary', 'improvement', 'trends', 'insights', 'rankings', 'risk', 'capa', 'recommendations', 'best'],
  'Quarterly Performance': ['cover', 'summary', 'trends', 'rankings', 'insights', 'risk', 'recommendations', 'best', 'capa'],
  'Outlet Performance': ['cover', 'summary', 'outlet', 'trends', 'risk', 'capa', 'recommendations', 'best'],
  'Risk & Compliance': ['cover', 'summary', 'risk', 'alerts', 'capa', 'insights', 'rankings', 'recommendations'],
  'Corrective Action': ['cover', 'summary', 'capa', 'capaTable', 'risk', 'recommendations'],
  'Trend Analysis': ['cover', 'summary', 'trends', 'categoryTrends', 'improvement', 'insights', 'rankings', 'recommendations'],
}

interface Deliverable {
  key: string
  label: string
  visitType: VisitType
  reportType: ReportType
  ordinal: 1 | 2
}

const DELIVERABLES: Deliverable[] = [
  { key: 'ma1', label: 'Main Audit 1 Report', visitType: 'Main Audit 1', reportType: 'Main Audit Report', ordinal: 1 },
  { key: 'fu1', label: 'Follow-up 1 Summary', visitType: 'Follow-up 1', reportType: 'Follow-up Report', ordinal: 1 },
  { key: 'ma2', label: 'Main Audit 2 Report', visitType: 'Main Audit 2', reportType: 'Main Audit Report', ordinal: 2 },
  { key: 'fu2', label: 'Follow-up 2 Summary', visitType: 'Follow-up 2', reportType: 'Follow-up Report', ordinal: 2 },
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

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

interface Period {
  from: Date
  to: Date
}

/** Tolerant parser for period labels such as "Oct – Dec 2025", "Aug 2026", "Q1 2026", "01 Jan 2026 – 31 Mar 2026". */
function parsePeriod(period: string): Period | null {
  const parts = period
    .split(/\s*[–—]\s*|\s+-\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!parts.length || parts.length > 2) return null
  const parsePart = (s: string, defaultYear?: number) => {
    let day: number | undefined
    let month: number | undefined
    let year: number | undefined
    let quarter: number | undefined
    for (const t of s.split(/\s+/)) {
      if (/^\d{4}$/.test(t)) year = Number(t)
      else if (/^\d{1,2}$/.test(t)) day = Number(t)
      else if (/^q[1-4]$/i.test(t)) quarter = Number(t.slice(1))
      else {
        const m = MONTHS.indexOf(t.slice(0, 3).toLowerCase())
        if (m >= 0) month = m
      }
    }
    if (quarter !== undefined) month = (quarter - 1) * 3
    if (month === undefined) return null
    return { day, month, year: year ?? defaultYear, quarter }
  }
  const right = parsePart(parts[parts.length - 1])
  if (!right || right.year === undefined) return null
  const left = parts.length === 2 ? parsePart(parts[0], right.year) : right
  if (!left || left.year === undefined) return null
  const from = new Date(left.year, left.month, left.day ?? 1)
  const to = right.quarter ? endOfMonth(new Date(right.year, right.month + 2, 1)) : right.day ? new Date(right.year, right.month, right.day, 23, 59, 59) : endOfMonth(new Date(right.year, right.month, 1))
  return { from, to }
}

function inPeriod(dateStr: string | null, period: Period | null): boolean {
  if (!period) return true
  const d = toDate(dateStr)
  if (!d) return false
  return !isBefore(d, period.from) && !isAfter(d, period.to)
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

function strongestCategory(o: Outlet): { key: CategoryKey; value: number } | null {
  if (!o.categoryScores) return null
  let best: { key: CategoryKey; value: number } | null = null
  for (const k of CATEGORY_KEYS) {
    const v = o.categoryScores[k]
    if (typeof v === 'number' && !Number.isNaN(v) && (!best || v > best.value)) best = { key: k, value: v }
  }
  return best
}

// ───────────────────────────── Report model ─────────────────────────────

interface ReportModel {
  report: ManagementReport
  sections: SectionKey[]
  period: Period | null
  outlets: Outlet[]
  visits: Visit[]
  findings: Finding[]
  actions: CorrectiveAction[]
  alerts: Alert[]
  kpi: KpiSummary
  portfolioScore: number | null
  cycleScore: number | null
  trend: MonthPoint[]
  insights: Insight[]
  ranked: Outlet[]
  riskFindings: Finding[]
  recommendations: string[]
  bestPractice: { outlet: Outlet; category: CategoryKey; value: number }[]
  capa: CapaStats
  cycles: ReturnType<typeof mainVsFollowUp>
  improvers: { outlet: Outlet; main: number; follow: number; delta: number }[]
}

function buildModel(data: Dataset, report: ManagementReport, scopedOutlets: Outlet[], scopedVisits: Visit[], now: Date): ReportModel {
  const period = parsePeriod(report.period)
  const scopeIds = new Set(report.outletIds)
  const outlets = report.outletIds.length ? scopedOutlets.filter((o) => scopeIds.has(o.id)) : scopedOutlets
  const ids = new Set(outlets.map((o) => o.id))
  const allVisits = scopedVisits.filter((v) => ids.has(v.outletId))
  const ordinal = /\b(?:Main Audit|Follow-up)\s*(\d)/i.exec(report.title)?.[1]

  let visits = allVisits
  if (report.type === 'Main Audit Report') visits = visits.filter((v) => (ordinal ? v.type === `Main Audit ${ordinal}` : isMainAudit(v)))
  if (report.type === 'Follow-up Report') visits = visits.filter((v) => (ordinal ? v.type === `Follow-up ${ordinal}` : isFollowUp(v)))
  if (period && ['Main Audit Report', 'Follow-up Report', 'Quarterly Performance', 'Risk & Compliance'].includes(report.type)) {
    const within = visits.filter((v) => inPeriod(v.visitDate ?? v.scheduledDate, period))
    if (within.length) visits = within
  }

  const findings = data.findings.filter((f) => ids.has(f.outletId))
  const actions = data.correctiveActions.filter((a) => ids.has(a.outletId))
  const alerts = data.alerts.filter((a) => ids.has(a.outletId))
  const kpi = kpiSummary(data, outlets)
  const portfolioScore = avg(outlets.map((o) => o.overallScore))
  const scored = visits.filter(isScored)
  const cycleScore = avg(scored.map((v) => v.score))

  const trend = report.type === 'Quarterly Performance' && period ? monthlyTrend(allVisits, findings, actions, period.to, 3) : monthlyTrend(allVisits, findings, actions, now, 12)
  const insights = generateInsights(data, outlets, now)
  const ranked = report.type === 'Risk & Compliance' ? [...rankedOutlets(outlets)].sort((a, b) => b.criticalFindings - a.criticalFindings || b.openIssues - a.openIssues || (a.overallScore ?? 0) - (b.overallScore ?? 0)) : rankedOutlets(outlets)
  const sevOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 }
  const riskFindings = findings
    .filter((f) => isOpenFinding(f) && (f.severity === 'Critical' || f.severity === 'High'))
    .sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || b.createdAt.localeCompare(a.createdAt))
  const capa = capaStats(actions, now)
  const cycles = mainVsFollowUp(allVisits)

  // Rule-based recommendations
  const recommendations: string[] = []
  const targets = new Map(data.kpiConfig.map((k) => [k.key, k.target]))
  const cats = categoryAverages(outlets)
    .filter((c) => c.value !== null)
    .sort((a, b) => (a.value ?? 0) - (b.value ?? 0))
  for (const c of cats.slice(0, 2)) {
    const target = targets.get(c.key) ?? 85
    if ((c.value ?? 0) < target) recommendations.push(`Prioritise ${c.label}: the average of ${c.value?.toFixed(1)}% sits ${(target - (c.value ?? 0)).toFixed(1)} points below the ${target}% target — ${KPI_HINTS[c.key]}.`)
  }
  const below70 = outlets.filter((o) => o.overallScore !== null && o.overallScore < 70)
  if (below70.length) recommendations.push(`Launch intervention plans for ${below70.map((o) => o.name).join(', ')}: scores below 70% require an operations-manager site review within 14 days and a re-audit at the next follow-up.`)
  const openCritical = findings.filter((f) => isOpenFinding(f) && f.severity === 'Critical')
  if (openCritical.length) recommendations.push(`Acknowledge and resolve ${openCritical.length} open critical finding${openCritical.length === 1 ? '' : 's'} within the ${data.organization.escalationSlaHours}-hour escalation SLA; attach closure evidence before verification.`)
  if (capa.overdue) recommendations.push(`Clear ${capa.overdue} overdue corrective action${capa.overdue === 1 ? '' : 's'}; escalate owners whose target dates are exceeded by more than seven days.`)
  if (capa.awaitingVerification) recommendations.push(`Schedule verification of ${capa.awaitingVerification} corrective action${capa.awaitingVerification === 1 ? '' : 's'} awaiting sign-off during the next follow-up cycle.`)
  const repeated = findings.filter((f) => f.repeated && isOpenFinding(f))
  if (repeated.length) {
    const names = [...new Set(repeated.map((f) => data.outlets.find((o) => o.id === f.outletId)?.name ?? ''))].filter(Boolean).slice(0, 4)
    recommendations.push(`Conduct root-cause reviews for ${repeated.length} repeated finding${repeated.length === 1 ? '' : 's'} (${names.join(', ')}${repeated.length > 4 ? ', …' : ''}) — recurring issues indicate a process gap rather than a one-off lapse.`)
  }
  if (!recommendations.length) recommendations.push('Performance is on target across all KPIs; sustain current standards and continue the follow-up verification cadence.')

  const bestPractice = ranked
    .slice(0, 3)
    .map((o) => {
      const s = strongestCategory(o)
      return s ? { outlet: o, category: s.key, value: s.value } : null
    })
    .filter((x): x is { outlet: Outlet; category: CategoryKey; value: number } => !!x)

  // Per-outlet improvement for follow-up reports
  const fuType: VisitType | null = report.type === 'Follow-up Report' ? (ordinal === '2' ? 'Follow-up 2' : 'Follow-up 1') : null
  const mainType: VisitType | null = fuType ? (fuType === 'Follow-up 2' ? 'Main Audit 2' : 'Main Audit 1') : null
  const improvers: ReportModel['improvers'] = []
  if (fuType && mainType) {
    for (const o of outlets) {
      const m = allVisits.find((v) => v.outletId === o.id && v.type === mainType && isScored(v))
      const f = allVisits.find((v) => v.outletId === o.id && v.type === fuType && isScored(v))
      if (m?.score !== null && m?.score !== undefined && f?.score !== null && f?.score !== undefined) improvers.push({ outlet: o, main: m.score, follow: f.score, delta: f.score - m.score })
    }
    improvers.sort((a, b) => b.delta - a.delta)
  }

  return { report, sections: SECTIONS_BY_TYPE[report.type], period, outlets, visits, findings, actions, alerts, kpi, portfolioScore, cycleScore, trend, insights, ranked, riskFindings, recommendations, bestPractice, capa, cycles, improvers }
}

// ───────────────────────────── Document primitives (always light — print / PDF surface) ─────────────────────────────

function DocSection({ title, icon: Icon, children, subtitle }: { title: string; icon?: typeof FileText; children: ReactNode; subtitle?: string }) {
  return (
    <section className="break-inside-avoid border-t border-slate-200 pt-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-navy-800">
            {Icon && <Icon className="h-4 w-4 text-teal-700" aria-hidden />}
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function DocStat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: 'critical' | 'warn' | 'good' }) {
  return (
    <div className={cn('rounded-lg border px-3 py-2.5', tone === 'critical' ? 'border-red-200 bg-red-50/60' : tone === 'warn' ? 'border-amber-200 bg-amber-50/60' : tone === 'good' ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50')}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  )
}

function DocTable<T>({ rows, columns, rowKey, empty = 'No records' }: { rows: T[]; columns: { header: string; render: (r: T) => ReactNode; align?: 'right' | 'center'; width?: string }[]; rowKey: (r: T) => string; empty?: string }) {
  if (!rows.length) return <p className="text-xs text-slate-500">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-300 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {columns.map((c) => (
              <th key={c.header} className={cn('py-1.5 pr-3 font-semibold', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')} style={c.width ? { width: c.width } : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className="border-b border-slate-100 text-slate-800">
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
  const tone = score === null || score === undefined ? 'text-slate-400' : score >= 90 ? 'text-emerald-700' : score >= 80 ? 'text-blue-700' : score >= 70 ? 'text-amber-700' : 'text-red-700'
  return <span className={cn('font-semibold tabular-nums', tone)}>{fmtPct(score)}</span>
}

function SeverityCell({ severity }: { severity: string }) {
  const cls = severity === 'Critical' ? 'bg-red-100 text-red-800' : severity === 'High' ? 'bg-amber-100 text-amber-800' : severity === 'Medium' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
  return <span className={cn('inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold', cls)}>{severity}</span>
}

// ───────────────────────────── Report preview ─────────────────────────────

function ReportPreview({ model, data, now, compact }: { model: ReportModel; data: Dataset; now: Date; compact: boolean }) {
  const { report, kpi, capa } = model
  const outletName = (id: string) => data.outlets.find((o) => o.id === id)?.name ?? '—'
  const has = (k: SectionKey) => model.sections.includes(k)
  const rankN = compact ? 3 : 5
  const top = model.ranked.slice(0, rankN)
  const bottom = [...model.ranked].reverse().slice(0, rankN)
  const scoredVisits = model.visits.filter(isScored)
  const trendSeries = [{ key: 'overall', label: 'Overall score', color: CHART_COLORS.navy }]
  const categorySeries = CATEGORY_KEYS.map((k, i) => ({ key: k, label: CATEGORY_SHORT[k], color: SERIES_COLORS[i] }))
  const openAlerts = model.alerts.filter((a) => a.status !== 'Resolved' && a.status !== 'Closed')
  const openActions = model.actions.filter((a) => a.status !== 'Closed').sort((a, b) => a.targetDate.localeCompare(b.targetDate))

  return (
    <div className="space-y-6 text-slate-900">
      {/* Cover */}
      {has('cover') && (
        <header className="rounded-lg bg-navy-900 px-6 py-7 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-300">{report.type}</p>
              <h2 className="mt-1.5 text-2xl font-semibold tracking-tight">{report.title}</h2>
              <p className="mt-1 text-sm text-slate-300">{data.organization.name}</p>
              <p className="text-xs text-slate-400">{data.organization.engagementName}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:text-right">
              <div>
                <p className="text-slate-400">Period</p>
                <p className="font-medium">{report.period}</p>
              </div>
              <div>
                <p className="text-slate-400">Scope</p>
                <p className="font-medium">{report.scope}</p>
              </div>
              <div>
                <p className="text-slate-400">Generated by</p>
                <p className="font-medium">{report.generatedBy}</p>
              </div>
              <div>
                <p className="text-slate-400">Generated at</p>
                <p className="font-medium">{fmtDateTime(report.generatedAt)}</p>
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
            <span className="rounded border border-white/20 px-1.5 py-0.5">{report.code}</span>
            <span className="rounded border border-white/20 px-1.5 py-0.5">{report.status}</span>
            <span className="rounded border border-white/20 px-1.5 py-0.5">{model.outlets.length} outlet{model.outlets.length === 1 ? '' : 's'}</span>
            <span className="rounded border border-white/20 px-1.5 py-0.5">Rendered {fmtDateTime(now)}</span>
          </div>
        </header>
      )}

      {/* Executive summary */}
      {has('summary') && (
        <DocSection title="Executive Summary" icon={BookOpenCheck}>
          <p className="text-sm leading-relaxed text-slate-700">{report.summary}</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            Across {model.outlets.length} outlet{model.outlets.length === 1 ? '' : 's'} in scope the current portfolio score is <strong>{fmtPct(model.portfolioScore)}</strong>
            {kpi.overallDelta !== null && <> ({fmtDelta(kpi.overallDelta)} pts versus the previous assessment)</>}
            {model.cycleScore !== null && scoredVisits.length > 0 && (
              <>
                ; the {scoredVisits.length} scored visit{scoredVisits.length === 1 ? '' : 's'} covered by this report averaged <strong>{fmtPct(model.cycleScore)}</strong>
              </>
            )}
            . {kpi.criticalIssues > 0 ? `${kpi.criticalIssues} critical issue${kpi.criticalIssues === 1 ? '' : 's'} remain${kpi.criticalIssues === 1 ? 's' : ''} open and require${kpi.criticalIssues === 1 ? 's' : ''} immediate attention.` : 'No critical issues are currently open.'}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <DocStat label="Portfolio score" value={fmtPct(model.portfolioScore)} sub={`${model.ranked.length} assessed`} tone={model.portfolioScore !== null && model.portfolioScore < 70 ? 'critical' : undefined} />
            <DocStat label="Visits completed" value={`${kpi.visitsCompleted} / ${kpi.visitsPlanned}`} sub={`${kpi.visitsAwaiting} awaiting approval`} />
            <DocStat label="Open critical" value={kpi.criticalIssues} tone={kpi.criticalIssues ? 'critical' : 'good'} />
            <DocStat label="Open high" value={kpi.highIssues} tone={kpi.highIssues ? 'warn' : 'good'} />
            <DocStat label="Open medium" value={kpi.mediumIssues} />
            <DocStat label="CAPA closure" value={fmtPct(capa.closureRate, 0)} sub={`${capa.open} open · ${capa.overdue} overdue`} tone={capa.overdue ? 'warn' : undefined} />
          </div>
        </DocSection>
      )}

      {/* Improvement (follow-up) */}
      {has('improvement') && (
        <DocSection title="Main Audit vs Follow-up Improvement" icon={TrendingUp} subtitle="Average score of the main audit compared with the verification follow-up in each cycle">
          <DocTable
            rows={model.cycles}
            rowKey={(c) => c.cycle}
            columns={[
              { header: 'Cycle', render: (c) => <span className="font-medium">{c.cycle}</span> },
              { header: 'Main audit', render: (c) => <ScoreCell score={c.mainAudit} />, align: 'right' },
              { header: 'Follow-up', render: (c) => <ScoreCell score={c.followUp} />, align: 'right' },
              { header: 'Change', render: (c) => (c.mainAudit !== null && c.followUp !== null ? <span className={cn('font-semibold tabular-nums', c.followUp - c.mainAudit >= 0 ? 'text-emerald-700' : 'text-red-700')}>{fmtDelta(c.followUp - c.mainAudit, 1, ' pts')}</span> : '—'), align: 'right' },
              { header: 'Visits', render: (c) => `${c.mainCount} / ${c.followCount}`, align: 'right' },
            ]}
          />
          {model.improvers.length > 0 && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Largest improvements</p>
                <DocTable
                  rows={model.improvers.slice(0, rankN)}
                  rowKey={(r) => r.outlet.id}
                  columns={[
                    { header: 'Outlet', render: (r) => r.outlet.name },
                    { header: 'Main', render: (r) => <ScoreCell score={r.main} />, align: 'right' },
                    { header: 'Follow-up', render: (r) => <ScoreCell score={r.follow} />, align: 'right' },
                    { header: 'Δ', render: (r) => <span className="font-semibold text-emerald-700">{fmtDelta(r.delta)}</span>, align: 'right' },
                  ]}
                />
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-red-700">Declines requiring attention</p>
                <DocTable
                  rows={[...model.improvers].reverse().filter((r) => r.delta < 0).slice(0, rankN)}
                  rowKey={(r) => r.outlet.id}
                  empty="No outlet declined between the main audit and follow-up."
                  columns={[
                    { header: 'Outlet', render: (r) => r.outlet.name },
                    { header: 'Main', render: (r) => <ScoreCell score={r.main} />, align: 'right' },
                    { header: 'Follow-up', render: (r) => <ScoreCell score={r.follow} />, align: 'right' },
                    { header: 'Δ', render: (r) => <span className="font-semibold text-red-700">{fmtDelta(r.delta)}</span>, align: 'right' },
                  ]}
                />
              </div>
            </div>
          )}
        </DocSection>
      )}

      {/* Trends */}
      {has('trends') && (
        <DocSection title="Performance Trends" icon={TrendingUp} subtitle={`Average approved visit score by month · ${model.trend[0]?.label} – ${model.trend[model.trend.length - 1]?.label}`}>
          <div style={{ height: compact ? 200 : 240 }}>
            <TrendChart data={model.trend as unknown as Record<string, unknown>[]} series={trendSeries} target={data.kpiConfig[0]?.target ?? 85} showLegend={false} area />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3 text-xs text-slate-600 sm:grid-cols-6">
            {model.trend.slice(-6).map((p) => (
              <div key={p.key} className="rounded border border-slate-200 px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{p.label}</p>
                <p className="font-semibold tabular-nums text-slate-900">{fmtPct(p.overall)}</p>
                <p className="text-[10px] text-slate-500">{p.count} visits</p>
              </div>
            ))}
          </div>
        </DocSection>
      )}

      {has('categoryTrends') && (
        <DocSection title="KPI Category Trends" icon={FileBarChart2} subtitle="Monthly average by weighted KPI category">
          <div style={{ height: 260 }}>
            <TrendChart data={model.trend as unknown as Record<string, unknown>[]} series={categorySeries} yDomain={[40, 100]} />
          </div>
        </DocSection>
      )}

      {/* Insights */}
      {has('insights') && (
        <DocSection title="Key Insights & Gaps" icon={Sparkles}>
          <ul className="space-y-2">
            {model.insights.slice(0, compact ? 4 : 8).map((i) => (
              <li key={i.id} className="flex items-start gap-2.5 text-sm text-slate-700">
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', i.tone === 'critical' ? 'bg-red-500' : i.tone === 'warning' ? 'bg-amber-500' : i.tone === 'positive' ? 'bg-emerald-500' : 'bg-navy-500')} aria-hidden />
                <span>
                  <span className="sr-only">{i.tone}: </span>
                  {i.text} <AutomatedLabel />
                </span>
              </li>
            ))}
            {!model.insights.length && <li className="text-xs text-slate-500">Insufficient data to generate insights for this scope.</li>}
          </ul>
        </DocSection>
      )}

      {/* Rankings */}
      {has('rankings') && (
        <DocSection title={model.report.type === 'Risk & Compliance' ? 'Highest-risk outlets' : 'Outlet Rankings'} icon={Table2}>
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">{model.report.type === 'Risk & Compliance' ? 'Most open critical findings' : `Top ${rankN} performers`}</p>
              <DocTable
                rows={top}
                rowKey={(o) => o.id}
                columns={[
                  { header: '#', render: (o) => o.rank ?? '—', width: '32px' },
                  { header: 'Outlet', render: (o) => <span className="font-medium">{o.name}</span> },
                  { header: 'Segment', render: (o) => o.segment },
                  { header: 'Score', render: (o) => <ScoreCell score={o.overallScore} />, align: 'right' },
                  { header: 'Issues', render: (o) => (o.criticalFindings ? <span className="font-semibold text-red-700">{o.openIssues} ({o.criticalFindings} crit.)</span> : o.openIssues), align: 'right' },
                ]}
              />
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-red-700">{model.report.type === 'Risk & Compliance' ? 'Lowest risk' : `Bottom ${rankN} performers`}</p>
              <DocTable
                rows={bottom}
                rowKey={(o) => o.id}
                columns={[
                  { header: '#', render: (o) => o.rank ?? '—', width: '32px' },
                  { header: 'Outlet', render: (o) => <span className="font-medium">{o.name}</span> },
                  { header: 'Segment', render: (o) => o.segment },
                  { header: 'Score', render: (o) => <ScoreCell score={o.overallScore} />, align: 'right' },
                  { header: 'Issues', render: (o) => (o.criticalFindings ? <span className="font-semibold text-red-700">{o.openIssues} ({o.criticalFindings} crit.)</span> : o.openIssues), align: 'right' },
                ]}
              />
            </div>
          </div>
        </DocSection>
      )}

      {/* Outlet performance detail */}
      {has('outlet') &&
        model.outlets.slice(0, 3).map((o) => {
          const bench = benchmarksFor(o, data.outlets)
          const history = outletVisitHistory(model.visits, o.id)
          return (
            <DocSection key={o.id} title={`Outlet profile — ${o.name}`} icon={ClipboardList} subtitle={`${o.code} · ${o.brand} · ${o.subcategory} · ${o.location} · Manager ${o.manager}`}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <DocStat label="Current score" value={fmtPct(o.overallScore)} sub={o.riskRating} tone={o.riskRating === 'Critical' ? 'critical' : o.riskRating === 'Needs Improvement' ? 'warn' : o.riskRating === 'Excellent' ? 'good' : undefined} />
                <DocStat label="Previous" value={fmtPct(o.previousScore)} sub={o.previousScore !== null && o.overallScore !== null ? fmtDelta(o.overallScore - o.previousScore, 1, ' pts') : undefined} />
                <DocStat label="Rank" value={o.rank ? `#${o.rank}` : '—'} sub={`of ${data.outlets.filter((x) => x.overallScore !== null).length}`} />
                <DocStat label="Open issues" value={o.openIssues} sub={`${o.criticalFindings} critical`} tone={o.criticalFindings ? 'critical' : undefined} />
              </div>
              <div className="mt-4 grid gap-5 lg:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Benchmarks</p>
                  <DocTable
                    rows={bench}
                    rowKey={(b) => b.label}
                    columns={[
                      { header: 'Benchmark', render: (b) => b.label },
                      { header: 'Average', render: (b) => <ScoreCell score={b.value} />, align: 'right' },
                      { header: 'Gap', render: (b) => (b.gap === null ? '—' : <span className={cn('font-semibold tabular-nums', b.gap >= 0 ? 'text-emerald-700' : 'text-red-700')}>{fmtDelta(b.gap)}</span>), align: 'right' },
                    ]}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Assessment history</p>
                  <DocTable
                    rows={history}
                    rowKey={(v) => v.id}
                    columns={[
                      { header: 'Visit', render: (v) => v.type },
                      { header: 'Date', render: (v) => fmtDate(v.visitDate ?? v.scheduledDate) },
                      { header: 'Status', render: (v) => v.status },
                      { header: 'Score', render: (v) => <ScoreCell score={v.score} />, align: 'right' },
                    ]}
                  />
                </div>
              </div>
              {o.categoryScores && (
                <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {CATEGORY_KEYS.map((k) => (
                    <div key={k} className="rounded border border-slate-200 px-2 py-1.5">
                      <p className="truncate text-[10px] uppercase tracking-wider text-slate-500">{CATEGORY_SHORT[k]}</p>
                      <ScoreCell score={o.categoryScores?.[k]} />
                    </div>
                  ))}
                </div>
              )}
            </DocSection>
          )
        })}

      {/* Risk & compliance */}
      {has('risk') && (
        <DocSection title="Risk & Compliance Issues" icon={ShieldAlert} subtitle={`${model.riskFindings.length} open critical / high findings in scope`}>
          <DocTable
            rows={model.riskFindings.slice(0, compact ? 6 : 12)}
            rowKey={(f) => f.id}
            empty="No open critical or high findings in scope."
            columns={[
              { header: 'Code', render: (f) => <span className="font-medium">{f.code}</span>, width: '90px' },
              { header: 'Outlet', render: (f) => outletName(f.outletId) },
              { header: 'Finding', render: (f) => f.title },
              { header: 'Category', render: (f) => CATEGORY_SHORT[f.category] },
              { header: 'Severity', render: (f) => <SeverityCell severity={f.severity} /> },
              { header: 'Status', render: (f) => f.status },
            ]}
          />
          {model.riskFindings.length > (compact ? 6 : 12) && <p className="mt-1.5 text-[11px] text-slate-500">Showing {compact ? 6 : 12} of {model.riskFindings.length} findings. The full register is available in the Findings module.</p>}
        </DocSection>
      )}

      {has('alerts') && (
        <DocSection title="Alerts & Escalations" icon={AlertOctagon} subtitle={`${openAlerts.length} open alert${openAlerts.length === 1 ? '' : 's'} · ${data.organization.escalationSlaHours}-hour escalation SLA`}>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DocStat label="Open" value={openAlerts.length} tone={openAlerts.length ? 'warn' : 'good'} />
            <DocStat label="Critical" value={openAlerts.filter((a) => a.severity === 'Critical').length} tone={openAlerts.some((a) => a.severity === 'Critical') ? 'critical' : undefined} />
            <DocStat label="Past escalation" value={openAlerts.filter((a) => isBefore(new Date(a.escalationDue), now)).length} tone={openAlerts.some((a) => isBefore(new Date(a.escalationDue), now)) ? 'critical' : 'good'} />
            <DocStat label="Resolved" value={model.alerts.filter((a) => a.status === 'Resolved' || a.status === 'Closed').length} tone="good" />
          </div>
          <DocTable
            rows={openAlerts.slice(0, 10)}
            rowKey={(a) => a.id}
            empty="No open alerts."
            columns={[
              { header: 'Code', render: (a) => <span className="font-medium">{a.code}</span>, width: '90px' },
              { header: 'Outlet', render: (a) => outletName(a.outletId) },
              { header: 'Alert', render: (a) => a.title },
              { header: 'Severity', render: (a) => <SeverityCell severity={a.severity} /> },
              { header: 'Status', render: (a) => a.status },
              { header: 'Escalation due', render: (a) => fmtDateTime(a.escalationDue) },
            ]}
          />
        </DocSection>
      )}

      {/* CAPA */}
      {has('capa') && (
        <DocSection title="Corrective Action Status" icon={CheckCircle2}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <DocStat label="Total" value={capa.total} />
            <DocStat label="Open" value={capa.open} />
            <DocStat label="Overdue" value={capa.overdue} tone={capa.overdue ? 'critical' : 'good'} />
            <DocStat label="Due in 7 days" value={capa.dueSoon} tone={capa.dueSoon ? 'warn' : undefined} />
            <DocStat label="Awaiting verification" value={capa.awaitingVerification} />
            <DocStat label="Closed" value={capa.closed} tone="good" />
            <DocStat label="Closure rate" value={fmtPct(capa.closureRate, 0)} sub={capa.avgClosureDays !== null ? `${round(capa.avgClosureDays, 0)} days avg` : undefined} />
          </div>
        </DocSection>
      )}

      {has('capaTable') && (
        <DocSection title="Open Corrective Actions" icon={ClipboardList} subtitle="Sorted by target date">
          <DocTable
            rows={openActions.slice(0, 15)}
            rowKey={(a) => a.id}
            empty="No open corrective actions."
            columns={[
              { header: 'Code', render: (a) => <span className="font-medium">{a.code}</span>, width: '90px' },
              { header: 'Outlet', render: (a) => outletName(a.outletId) },
              { header: 'Action', render: (a) => a.title },
              { header: 'Owner', render: (a) => a.ownerName },
              { header: 'Priority', render: (a) => <SeverityCell severity={a.priority} /> },
              { header: 'Target', render: (a) => <span className={cn(isBefore(new Date(a.targetDate), now) && a.status !== 'Closed' && 'font-semibold text-red-700')}>{fmtDate(a.targetDate)}</span> },
              { header: 'Status', render: (a) => a.status },
            ]}
          />
          {openActions.length > 15 && <p className="mt-1.5 text-[11px] text-slate-500">Showing 15 of {openActions.length} open actions.</p>}
        </DocSection>
      )}

      {/* Recommendations */}
      {has('recommendations') && (
        <DocSection title="Improvement Recommendations" icon={Lightbulb}>
          <ol className="space-y-2">
            {model.recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-800 text-[11px] font-semibold text-white">{i + 1}</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[11px] text-slate-500">
            Recommendations are rule-based, derived from KPI targets, score thresholds and corrective-action status. <AutomatedLabel />
          </p>
        </DocSection>
      )}

      {/* Best practice */}
      {has('best') && (
        <DocSection title="Best Practice Insights" icon={Sparkles} subtitle="Strongest KPI category of the top-ranked outlets — candidates for peer-learning visits">
          <div className="grid gap-3 sm:grid-cols-3">
            {model.bestPractice.map((b) => (
              <div key={b.outlet.id} className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2.5">
                <p className="text-sm font-semibold text-slate-900">{b.outlet.name}</p>
                <p className="text-[11px] text-slate-500">
                  #{b.outlet.rank} · {b.outlet.brand} · overall {fmtPct(b.outlet.overallScore)}
                </p>
                <p className="mt-1.5 text-xs text-emerald-800">
                  Strongest in <strong>{CATEGORY_LABELS[b.category]}</strong> at {fmtPct(b.value)}
                </p>
              </div>
            ))}
            {!model.bestPractice.length && <p className="text-xs text-slate-500">No assessed outlets in scope.</p>}
          </div>
        </DocSection>
      )}

      <footer className="border-t border-slate-200 pt-3 text-[10px] text-slate-500">
        {report.code} · {report.title} · Generated from live programme data on {fmtDateTime(now)} · Confidential — prepared for {data.organization.name}
      </footer>
    </div>
  )
}

// ───────────────────────────── Page ─────────────────────────────

export default function ManagementReportsPage() {
  useDocumentTitle('Management Reports')
  const navigate = useNavigate()
  const now = useNow()
  const { can } = useAuth()
  const { data, dispatch, scopedOutlets, scopedVisits } = useData()
  const [params, setParams] = useSearchParams()

  const [typeFilter, setTypeFilter] = useState<ReportType | 'all'>('all')
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState<'pdf' | 'print' | null>(null)
  const [exporting, setExporting] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)

  const sortedReports = useMemo(() => [...data.reports].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)), [data.reports])
  const selectedId = params.get('report')
  const selected = useMemo(() => (selectedId === 'latest' ? (sortedReports[0] ?? null) : (data.reports.find((r) => r.id === selectedId) ?? null)), [selectedId, data.reports, sortedReports])

  const select = useCallback(
    (id: string | null) => {
      setParams(
        (p) => {
          const next = new URLSearchParams(p)
          if (id) next.set('report', id)
          else next.delete('report')
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  useEffect(() => {
    if (selected) viewerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selected])

  const model = useMemo(() => (selected ? buildModel(data, selected, scopedOutlets, scopedVisits, now) : null), [data, selected, scopedOutlets, scopedVisits, now])

  // Deliverables tracker
  const deliverables = useMemo(
    () =>
      DELIVERABLES.map((d) => {
        const ofType = [...data.reports].filter((r) => r.type === d.reportType).sort((a, b) => a.generatedAt.localeCompare(b.generatedAt))
        const byTitle = ofType.find((r) => new RegExp(`\\b${d.visitType.replace('-', '[- ]')}\\b`, 'i').test(r.title))
        const report = byTitle ?? ofType[d.ordinal - 1] ?? null
        const visits = scopedVisits.filter((v) => v.type === d.visitType)
        const completed = visits.filter((v) => v.status === 'Approved' || v.status === 'Closed').length
        const dates = visits.map((v) => v.visitDate ?? v.scheduledDate).sort()
        const period = report?.period ?? (dates.length ? `${fmtDate(dates[0], 'MMM yyyy')} – ${fmtDate(dates[dates.length - 1], 'MMM yyyy')}` : '—')
        return { ...d, report, status: report?.status ?? 'Not started', period, completed, total: visits.length }
      }),
    [data.reports, scopedVisits],
  )

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sortedReports.filter((r) => (typeFilter === 'all' || r.type === typeFilter) && (!q || [r.code, r.title, r.period, r.scope, r.generatedBy].some((f) => f.toLowerCase().includes(q))))
  }, [sortedReports, typeFilter, search])

  const typeCounts = useMemo(() => {
    const m = new Map<ReportType, number>()
    for (const r of data.reports) m.set(r.type, (m.get(r.type) ?? 0) + 1)
    return m
  }, [data.reports])

  // Actions
  const downloadPdf = useCallback(async () => {
    if (!previewRef.current || !selected) return
    setExporting(true)
    const t = toast.loading('Rendering PDF…')
    try {
      await exportElementToPdf(previewRef.current, `${selected.code}-${slug(selected.title)}`)
      await dispatch((d, ctx) => logExport(d, ctx, `${selected.code} · ${selected.title}`, 'PDF'))
      toast.success('PDF downloaded', { id: t })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'PDF export failed', { id: t })
    } finally {
      setExporting(false)
    }
  }, [selected, dispatch])

  const print = useCallback(async () => {
    if (!selected) return
    printPage()
    await dispatch((d, ctx) => logExport(d, ctx, `${selected.code} · ${selected.title}`, 'Print'))
  }, [selected, dispatch])

  const exportRankings = async () => {
    if (!model || !selected) return
    exportCsv(
      model.ranked.map((o) => ({
        Rank: o.rank ?? '',
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
      `${selected.code}-rankings`,
    )
    await dispatch((d, ctx) => logExport(d, ctx, `${selected.code} rankings (${model.ranked.length} outlets)`, 'CSV'))
    toast.success('Rankings exported to CSV')
  }

  // Row-level PDF / Print: open the viewer first, then run once the preview has rendered.
  useEffect(() => {
    if (!pending || !selected || !previewRef.current) return
    const t = setTimeout(() => {
      if (pending === 'pdf') void downloadPdf()
      else void print()
      setPending(null)
    }, 600)
    return () => clearTimeout(t)
  }, [pending, selected, downloadPdf, print])

  const openWith = (r: ManagementReport, action: 'pdf' | 'print') => {
    select(r.id)
    setPending(action)
  }

  const columns: Column<ManagementReport>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-medium text-slate-900 dark:text-white">{r.code}</span>, width: '120px' },
    {
      key: 'title',
      header: 'Title',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800 dark:text-slate-100">{r.title}</p>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{r.summary}</p>
        </div>
      ),
    },
    { key: 'type', header: 'Type', render: (r) => <Badge tone={TYPE_TONE[r.type]}>{r.type}</Badge> },
    { key: 'period', header: 'Period', render: (r) => <span className="whitespace-nowrap">{r.period}</span> },
    { key: 'scope', header: 'Scope', render: (r) => <span className="text-slate-600 dark:text-slate-300">{r.scope}</span> },
    {
      key: 'generatedAt',
      header: 'Generated',
      render: (r) => (
        <div className="whitespace-nowrap">
          <p>{fmtDate(r.generatedAt)}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">by {r.generatedBy}</p>
        </div>
      ),
    },
    { key: 'pages', header: 'Pages', align: 'right', render: (r) => <span className="tabular-nums">{r.pages}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      sortable: false,
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <button type="button" className="btn-ghost btn-sm" onClick={() => select(r.id)} aria-label={`View ${r.code}`}>
            <Eye className="h-3.5 w-3.5" aria-hidden /> View
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => openWith(r, 'pdf')} aria-label={`Download ${r.code} as PDF`}>
            <Download className="h-3.5 w-3.5" aria-hidden /> PDF
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => openWith(r, 'print')} aria-label={`Print ${r.code}`}>
            <Printer className="h-3.5 w-3.5" aria-hidden /> Print
          </button>
        </div>
      ),
    },
  ]

  const viewerOpen = !!selected && !!model
  const hideWhenViewing = viewerOpen ? 'no-print' : undefined

  return (
    <div className="space-y-5">
      <PageHeader
        className={hideWhenViewing}
        title="Management Reports"
        subtitle="2 main audit reports + 2 follow-up summary reports per engagement year, plus quarterly and thematic packs"
        badge={<Badge tone="slate">{data.reports.length} reports</Badge>}
        actions={
          can('reports.build') ? (
            <button type="button" className="btn-primary" onClick={() => navigate('/reports/builder')}>
              <Wand2 className="h-4 w-4" aria-hidden /> Generate report
            </button>
          ) : undefined
        }
      />

      {/* Report viewer */}
      {viewerOpen && selected && model && (
        <div ref={viewerRef} className="scroll-mt-4">
          <Card className="print-area overflow-hidden">
            <CardHeader
              className="no-print"
              title={
                <span className="inline-flex items-center gap-2">
                  {selected.title}
                  <StatusBadge status={selected.status} />
                </span>
              }
              subtitle={`${selected.code} · ${selected.type} · ${selected.period} · live preview generated from the current dataset`}
              actions={
                <>
                  {can('reports.export') && (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => void exportRankings()}>
                      <Table2 className="h-3.5 w-3.5" aria-hidden /> Export data
                    </button>
                  )}
                  <button type="button" className="btn-secondary btn-sm" onClick={() => void print()}>
                    <Printer className="h-3.5 w-3.5" aria-hidden /> Print
                  </button>
                  <button type="button" className="btn-primary btn-sm" onClick={() => void downloadPdf()} disabled={exporting}>
                    {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />} Download PDF
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => select(null)} aria-label="Close report viewer">
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </>
              }
            />
            <div className="bg-slate-100 p-3 dark:bg-navy-950 sm:p-6">
              {/* Document surface is intentionally always light: it is the PDF / print artefact. */}
              <div ref={previewRef} className="print-area mx-auto max-w-4xl rounded-lg bg-white p-6 text-slate-900 shadow-sm ring-1 ring-slate-200 sm:p-8" style={{ backgroundColor: '#ffffff', colorScheme: 'light' }}>
                <ReportPreview model={model} data={data} now={now} compact={selected.type === 'Executive Summary'} />
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Engagement deliverables */}
      <Card className={hideWhenViewing}>
        <CardHeader title="Engagement deliverables" subtitle={`${data.organization.engagementName} · ${fmtDate(data.organization.engagementStart, 'MMM yyyy')} – ${fmtDate(data.organization.engagementEnd, 'MMM yyyy')}`} />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {deliverables.map((d, i) => {
              const done = d.status === 'Published' || d.status === 'Final'
              const started = d.status === 'Draft'
              const clickable = !!d.report || can('reports.build')
              return (
                <button
                  key={d.key}
                  type="button"
                  disabled={!clickable}
                  onClick={() => (d.report ? select(d.report.id) : navigate(`/reports/builder?type=${encodeURIComponent(d.reportType)}&visitType=${encodeURIComponent(d.visitType)}`))}
                  className={cn(
                    'card p-4 text-left transition-shadow',
                    clickable && 'hover:shadow-card-hover hover:border-teal-300 dark:hover:border-teal-700',
                    selected?.id === d.report?.id && d.report && 'ring-2 ring-teal-500',
                    done ? 'border-l-4 border-l-emerald-500' : started ? 'border-l-4 border-l-amber-500' : 'border-l-4 border-l-slate-300 dark:border-l-navy-700',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Deliverable {i + 1}</p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-white">{d.label}</p>
                    </div>
                    <StatusBadge status={String(d.status) === 'Not started' ? 'Not Started' : d.status} size="xs" />
                  </div>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{d.period}</p>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>
                      {d.completed}/{d.total} visits approved
                    </span>
                    <span className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400">
                      {d.report ? 'Open' : can('reports.build') ? 'Generate' : 'Pending'}
                      {clickable && <ArrowRight className="h-3 w-3" aria-hidden />}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </CardBody>
      </Card>

      {/* Filters */}
      <div className={cn('card no-print flex flex-col gap-3 p-3', hideWhenViewing)}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reports…" aria-label="Search reports" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Report type">
            <button type="button" aria-pressed={typeFilter === 'all'} onClick={() => setTypeFilter('all')} className={cn('rounded-full border px-2.5 py-1 text-xs font-medium transition-colors', typeFilter === 'all' ? 'border-navy-800 bg-navy-800 text-white dark:border-teal-600 dark:bg-teal-600' : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-700 dark:text-slate-300 dark:hover:bg-navy-800')}>
              All types
            </button>
            {REPORT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={typeFilter === t}
                onClick={() => setTypeFilter((cur) => (cur === t ? 'all' : t))}
                className={cn('rounded-full border px-2.5 py-1 text-xs font-medium transition-colors', typeFilter === t ? 'border-navy-800 bg-navy-800 text-white dark:border-teal-600 dark:bg-teal-600' : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-700 dark:text-slate-300 dark:hover:bg-navy-800')}
              >
                {t}
                <span className="ml-1 opacity-60 tabular-nums">{typeCounts.get(t) ?? 0}</span>
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs tabular-nums text-slate-500 dark:text-slate-400">{rows.length} results</span>
        </div>
      </div>

      <Card tour="reports-list" className={hideWhenViewing}>
        <CardHeader title="Report library" subtitle="Generated packs are rendered live from the current dataset — figures always reflect the latest approvals" />
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => select(r.id)} selectedKey={selected?.id ?? null} initialSort={{ key: 'generatedAt', dir: 'desc' }} caption="Management reports" emptyTitle="No reports" emptyMessage="No reports match the current type filter or search." />
      </Card>
    </div>
  )
}
