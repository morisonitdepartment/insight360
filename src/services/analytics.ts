import { addMonths, differenceInCalendarDays, differenceInHours, format, startOfMonth, subMonths } from 'date-fns'
import type { CategoryKey, CategoryScores, CorrectiveAction, Dataset, Finding, Outlet, Visit, VisitType } from '@/types'
import { CATEGORY_KEYS, CATEGORY_LABELS, averageCategoryScores } from '@/utils/scoring'
import { avg, round } from '@/utils/format'
import { isCompleted, isInProgress, isOpenFinding, isScored, isAwaitingApproval } from './derive'

// ───────────────────────────── Scoping ─────────────────────────────

export function scopeOutlets(outlets: Outlet[], scopedIds: string[] | null, outletScope = 'all'): Outlet[] {
  let list = scopedIds ? outlets.filter((o) => scopedIds.includes(o.id)) : outlets
  if (outletScope !== 'all') list = list.filter((o) => o.id === outletScope)
  return list
}

export function scopeVisits(visits: Visit[], outletIds: Set<string>): Visit[] {
  return visits.filter((v) => outletIds.has(v.outletId))
}

// ───────────────────────────── Monthly trend ─────────────────────────────

export interface MonthPoint {
  key: string
  label: string
  overall: number | null
  count: number
  critical: number
  customer_experience: number | null
  service_speed: number | null
  operational_compliance: number | null
  product_environment: number | null
  upselling_sales: number | null
  safety_entertainment: number | null
  capaClosed: number
  capaOpened: number
}

export function monthlyTrend(visits: Visit[], findings: Finding[], actions: CorrectiveAction[], now: Date, months = 12): MonthPoint[] {
  const start = startOfMonth(subMonths(now, months - 1))
  const points: MonthPoint[] = []
  for (let i = 0; i < months; i++) {
    const m = addMonths(start, i)
    const key = format(m, 'yyyy-MM')
    const mv = visits.filter((v) => isScored(v) && v.visitDate?.startsWith(key))
    const cats = averageCategoryScores(mv.map((v) => v.categoryScores))
    const critical = findings.filter((f) => f.severity === 'Critical' && f.createdAt.startsWith(key)).length
    const pt: MonthPoint = {
      key,
      label: format(m, 'MMM yy'),
      overall: mv.length ? round(avg(mv.map((v) => v.score)) ?? 0) : null,
      count: mv.length,
      critical,
      customer_experience: null,
      service_speed: null,
      operational_compliance: null,
      product_environment: null,
      upselling_sales: null,
      safety_entertainment: null,
      capaClosed: actions.filter((a) => a.closureDate?.startsWith(key)).length,
      capaOpened: actions.filter((a) => a.createdAt.startsWith(key)).length,
    }
    if (cats) for (const k of CATEGORY_KEYS) pt[k] = Number.isNaN(cats[k]) ? null : round(cats[k])
    points.push(pt)
  }
  return points
}

// ───────────────────────────── KPI summary ─────────────────────────────

export interface KpiSummary {
  overall: number | null
  overallDelta: number | null
  categories: Record<CategoryKey, { value: number | null; delta: number | null }>
  entertainmentSafety: number | null
  entertainmentSafetyDelta: number | null
  visitsCompleted: number
  visitsPlanned: number
  visitsInProgress: number
  visitsAwaiting: number
  visitsScheduled: number
  visitsUnassigned: number
  criticalIssues: number
  highIssues: number
  mediumIssues: number
  openIssues: number
  capaClosureRate: number | null
  capaClosureDelta: number | null
  capaOpen: number
  capaOverdue: number
}

export function kpiSummary(data: Dataset, outlets: Outlet[]): KpiSummary {
  const ids = new Set(outlets.map((o) => o.id))
  const visits = data.visits.filter((v) => ids.has(v.outletId))
  const findings = data.findings.filter((f) => ids.has(f.outletId))
  const actions = data.correctiveActions.filter((a) => ids.has(a.outletId))
  const scored = outlets.filter((o) => o.overallScore !== null)

  // Current = latest completed visit per outlet; previous = the one before.
  const currentCats = averageCategoryScores(scored.map((o) => o.categoryScores))
  const prevVisits = outlets
    .map((o) => {
      const completed = visits.filter((v) => v.outletId === o.id && isCompleted(v)).sort((a, b) => (b.visitDate ?? '').localeCompare(a.visitDate ?? ''))
      return completed[1] ?? null
    })
    .filter((v): v is Visit => !!v)
  const prevCats = averageCategoryScores(prevVisits.map((v) => v.categoryScores))
  const overall = avg(scored.map((o) => o.overallScore))
  const prevOverall = avg(prevVisits.map((v) => v.score))

  const categories = {} as KpiSummary['categories']
  for (const k of CATEGORY_KEYS) {
    const cur = currentCats && !Number.isNaN(currentCats[k]) ? currentCats[k] : null
    const prev = prevCats && !Number.isNaN(prevCats[k]) ? prevCats[k] : null
    categories[k] = { value: cur, delta: cur !== null && prev !== null ? cur - prev : null }
  }
  const entOutlets = scored.filter((o) => o.segment === 'Entertainment')
  const entSafety = avg(entOutlets.map((o) => o.categoryScores?.safety_entertainment ?? null))
  const entPrev = avg(prevVisits.filter((v) => outlets.find((o) => o.id === v.outletId)?.segment === 'Entertainment').map((v) => v.categoryScores?.safety_entertainment ?? null))

  const open = findings.filter(isOpenFinding)
  const closed = actions.filter((a) => a.status === 'Closed').length
  // Previous-period closure rate: actions created before 60 days ago
  const cutoff = format(subMonths(new Date(data.organization.engagementEnd), 4), 'yyyy-MM-dd')
  const olderActions = actions.filter((a) => a.createdAt < cutoff)
  const olderClosed = olderActions.filter((a) => a.status === 'Closed').length
  const closureRate = actions.length ? (closed / actions.length) * 100 : null
  const prevClosureRate = olderActions.length ? (olderClosed / olderActions.length) * 100 : null

  return {
    overall,
    overallDelta: overall !== null && prevOverall !== null ? overall - prevOverall : null,
    categories,
    entertainmentSafety: entSafety,
    entertainmentSafetyDelta: entSafety !== null && entPrev !== null ? entSafety - entPrev : null,
    visitsCompleted: visits.filter(isCompleted).length,
    visitsPlanned: visits.length,
    visitsInProgress: visits.filter(isInProgress).length,
    visitsAwaiting: visits.filter(isAwaitingApproval).length,
    visitsScheduled: visits.filter((v) => v.status === 'Assigned').length,
    visitsUnassigned: visits.filter((v) => v.status === 'Planned').length,
    criticalIssues: open.filter((f) => f.severity === 'Critical').length,
    highIssues: open.filter((f) => f.severity === 'High').length,
    mediumIssues: open.filter((f) => f.severity === 'Medium').length,
    openIssues: open.length,
    capaClosureRate: closureRate,
    capaClosureDelta: closureRate !== null && prevClosureRate !== null ? closureRate - prevClosureRate : null,
    capaOpen: actions.filter((a) => a.status !== 'Closed').length,
    capaOverdue: actions.filter((a) => a.status === 'Overdue').length,
  }
}

// ───────────────────────────── Rankings & comparisons ─────────────────────────────

export function rankedOutlets(outlets: Outlet[]): Outlet[] {
  return outlets.filter((o) => o.overallScore !== null).sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0))
}

export function mainVsFollowUp(visits: Visit[]): { cycle: string; mainAudit: number | null; followUp: number | null; mainCount: number; followCount: number }[] {
  const byType = (t: VisitType) => visits.filter((v) => v.type === t && isScored(v))
  const mk = (cycle: string, m: VisitType, f: VisitType) => {
    const mv = byType(m)
    const fv = byType(f)
    return { cycle, mainAudit: round(avg(mv.map((v) => v.score)) ?? Number.NaN), followUp: fv.length ? round(avg(fv.map((v) => v.score)) ?? 0) : null, mainCount: mv.length, followCount: fv.length }
  }
  return [mk('Cycle 1', 'Main Audit 1', 'Follow-up 1'), mk('Cycle 2', 'Main Audit 2', 'Follow-up 2')].map((r) => ({ ...r, mainAudit: Number.isNaN(r.mainAudit) ? null : r.mainAudit }))
}

export function segmentComparison(outlets: Outlet[]) {
  const seg = (s: Outlet['segment']) => outlets.filter((o) => o.segment === s && o.overallScore !== null)
  const row = (label: string, list: Outlet[]) => {
    const cats = averageCategoryScores(list.map((o) => o.categoryScores))
    return {
      label,
      count: list.length,
      overall: round(avg(list.map((o) => o.overallScore)) ?? 0),
      ...Object.fromEntries(CATEGORY_KEYS.map((k) => [k, cats && !Number.isNaN(cats[k]) ? round(cats[k]) : null])),
    } as { label: string; count: number; overall: number } & Record<CategoryKey, number | null>
  }
  return [row('F&B', seg('F&B')), row('Entertainment', seg('Entertainment'))]
}

export function categoryAverages(outlets: Outlet[]): { key: CategoryKey; label: string; value: number | null }[] {
  const cats = averageCategoryScores(outlets.map((o) => o.categoryScores))
  return CATEGORY_KEYS.map((k) => ({ key: k, label: CATEGORY_LABELS[k], value: cats && !Number.isNaN(cats[k]) ? round(cats[k]) : null }))
}

export function brandScores(outlets: Outlet[]) {
  const map = new Map<string, Outlet[]>()
  for (const o of outlets) {
    if (o.overallScore === null) continue
    map.set(o.brand, [...(map.get(o.brand) ?? []), o])
  }
  return [...map.entries()]
    .map(([brand, list]) => ({ brand, segment: list[0].segment, outlets: list.length, score: round(avg(list.map((o) => o.overallScore)) ?? 0), openIssues: list.reduce((a, o) => a + o.openIssues, 0) }))
    .sort((a, b) => b.score - a.score)
}

export interface Benchmark {
  label: string
  value: number | null
  gap: number | null
}

export function benchmarksFor(outlet: Outlet, outlets: Outlet[]): Benchmark[] {
  const brand = avg(outlets.filter((o) => o.brand === outlet.brand && o.id !== outlet.id).map((o) => o.overallScore))
  const category = avg(outlets.filter((o) => o.subcategory === outlet.subcategory).map((o) => o.overallScore))
  const segment = avg(outlets.filter((o) => o.segment === outlet.segment).map((o) => o.overallScore))
  const org = avg(outlets.map((o) => o.overallScore))
  const s = outlet.overallScore
  const mk = (label: string, v: number | null): Benchmark => ({ label, value: v, gap: v !== null && s !== null ? s - v : null })
  return [mk('Brand average', brand), mk(`${outlet.subcategory} average`, category), mk(`${outlet.segment} average`, segment), mk('Organisation average', org)]
}

export function percentile(outlet: Outlet, outlets: Outlet[]): number | null {
  const scored = outlets.filter((o) => o.overallScore !== null)
  if (outlet.overallScore === null || !scored.length) return null
  const below = scored.filter((o) => (o.overallScore ?? 0) < (outlet.overallScore ?? 0)).length
  return Math.round((below / scored.length) * 100)
}

// ───────────────────────────── SLA & CAPA ─────────────────────────────

export interface SlaStats {
  compliancePct: number | null
  avgTurnaroundHours: number | null
  late: number
  dueToday: number
  atRisk: number
  submitted: number
  /** Share submitted within the 24h preferred target. */
  withinTargetPct: number | null
  withinTarget: number
}

export function slaStats(visits: Visit[], now: Date): SlaStats {
  const submitted = visits.filter((v) => v.submittedAt && v.visitEnd)
  const withinTarget = submitted.filter((v) => v.slaStatus === 'Within Target').length
  const within = submitted.filter((v) => v.slaStatus === 'Within SLA' || v.slaStatus === 'Within Target').length
  const turnaround = submitted.map((v) => differenceInHours(new Date(v.submittedAt!), new Date(v.visitEnd!)))
  const today = format(now, 'yyyy-MM-dd')
  return {
    compliancePct: submitted.length ? (within / submitted.length) * 100 : null,
    avgTurnaroundHours: turnaround.length ? turnaround.reduce((a, b) => a + b, 0) / turnaround.length : null,
    late: visits.filter((v) => v.slaStatus === 'Breached').length,
    dueToday: visits.filter((v) => !v.submittedAt && v.submissionDeadline?.startsWith(today)).length,
    atRisk: visits.filter((v) => v.slaStatus === 'At Risk').length,
    submitted: submitted.length,
    withinTarget,
    withinTargetPct: submitted.length ? (withinTarget / submitted.length) * 100 : null,
  }
}

export interface CapaStats {
  open: number
  overdue: number
  dueSoon: number
  closed: number
  total: number
  closureRate: number | null
  avgClosureDays: number | null
  awaitingVerification: number
}

export function capaStats(actions: CorrectiveAction[], now: Date): CapaStats {
  const closed = actions.filter((a) => a.status === 'Closed')
  const open = actions.filter((a) => a.status !== 'Closed')
  const dueSoon = open.filter((a) => {
    const d = differenceInCalendarDays(new Date(a.targetDate), now)
    return d >= 0 && d <= 7 && a.status !== 'Overdue'
  })
  const closureDays = closed.filter((a) => a.closureDate).map((a) => differenceInCalendarDays(new Date(a.closureDate!), new Date(a.createdAt)))
  return {
    open: open.length,
    overdue: actions.filter((a) => a.status === 'Overdue').length,
    dueSoon: dueSoon.length,
    closed: closed.length,
    total: actions.length,
    closureRate: actions.length ? (closed.length / actions.length) * 100 : null,
    avgClosureDays: closureDays.length ? closureDays.reduce((a, b) => a + b, 0) / closureDays.length : null,
    awaitingVerification: actions.filter((a) => a.status === 'Awaiting Verification').length,
  }
}

// ───────────────────────────── Heatmap ─────────────────────────────

export function heatmapRows(outlets: Outlet[]) {
  return rankedOutlets(outlets).map((o) => ({
    outletId: o.id,
    name: o.name,
    code: o.code,
    segment: o.segment,
    overall: o.overallScore,
    ...Object.fromEntries(CATEGORY_KEYS.map((k) => [k, o.categoryScores && !Number.isNaN(o.categoryScores[k]) ? round(o.categoryScores[k]) : null])),
  })) as Array<{ outletId: string; name: string; code: string; segment: string; overall: number | null } & Record<CategoryKey, number | null>>
}

// ───────────────────────────── Automated insights (rule-based) ─────────────────────────────

export interface Insight {
  id: string
  tone: 'positive' | 'warning' | 'critical' | 'info'
  text: string
  link?: string
}

export function generateInsights(data: Dataset, outlets: Outlet[], now: Date): Insight[] {
  const out: Insight[] = []
  const ids = new Set(outlets.map((o) => o.id))
  const visits = data.visits.filter((v) => ids.has(v.outletId))
  const findings = data.findings.filter((f) => ids.has(f.outletId))
  const trend = monthlyTrend(visits, findings, data.correctiveActions, now, 12)

  // Service responsiveness improvement: compare last follow-up cycle vs its main audit on service_speed
  const ma = visits.filter((v) => v.type === 'Main Audit 2' && isScored(v))
  const fu = visits.filter((v) => (v.type === 'Follow-up 1' || v.type === 'Follow-up 2') && isScored(v))
  const ma1 = visits.filter((v) => v.type === 'Main Audit 1' && isScored(v))
  const speedMa1 = avg(ma1.map((v) => v.categoryScores?.service_speed ?? null))
  const speedFu = avg(fu.map((v) => v.categoryScores?.service_speed ?? null))
  if (speedMa1 !== null && speedFu !== null) {
    const delta = ((speedFu - speedMa1) / speedMa1) * 100
    out.push({
      id: 'speed',
      tone: delta >= 0 ? 'positive' : 'warning',
      text: `Service responsiveness ${delta >= 0 ? 'improved' : 'declined'} by ${Math.abs(delta).toFixed(1)}% in follow-up cycles compared with the first main audit (${speedMa1.toFixed(1)} → ${speedFu.toFixed(1)}).`,
      link: '/performance/trends',
    })
  }

  // Repeated cleanliness findings
  const repeatedOutlets = new Set(findings.filter((f) => f.repeated).map((f) => f.outletId))
  if (repeatedOutlets.size) {
    out.push({
      id: 'repeat',
      tone: 'warning',
      text: `${repeatedOutlets.size} outlet${repeatedOutlets.size === 1 ? ' has' : 's have'} repeated cleanliness findings across two consecutive assessments. Root-cause review recommended.`,
      link: '/quality/findings?repeated=1',
    })
  }

  // Entertainment vs F&B customer engagement
  const seg = segmentComparison(outlets)
  const ent = seg[1].customer_experience
  const fnb = seg[0].customer_experience
  if (ent !== null && fnb !== null) {
    const diff = ent - fnb
    out.push({
      id: 'segment',
      tone: 'info',
      text: `${diff >= 0 ? 'Entertainment' : 'F&B'} locations outperform ${diff >= 0 ? 'F&B' : 'Entertainment'} locations in customer engagement by ${Math.abs(diff).toFixed(1)} points.`,
      link: '/performance/benchmarking',
    })
  }

  // Lowest KPI
  const cats = categoryAverages(outlets).filter((c) => c.value !== null)
  if (cats.length) {
    const lowest = [...cats].sort((a, b) => (a.value ?? 0) - (b.value ?? 0))[0]
    out.push({
      id: 'lowest',
      tone: 'warning',
      text: `${lowest.label} remains the lowest-performing KPI across the portfolio at ${lowest.value?.toFixed(1)}%.`,
      link: '/performance/kpi',
    })
  }

  // Outlets below 70
  const critical = outlets.filter((o) => o.overallScore !== null && o.overallScore < 70)
  if (critical.length) {
    out.push({
      id: 'below70',
      tone: 'critical',
      text: `${critical.length === 1 ? 'One outlet requires' : `${numberWord(critical.length)} outlets require`} immediate intervention due to scores below 70%: ${critical.map((o) => o.name).join(', ')}.`,
      link: '/performance/outlets?risk=Critical',
    })
  }

  // Main audit vs follow-up improvement
  const fu1 = visits.filter((v) => v.type === 'Follow-up 1' && isScored(v))
  const ma1Avg = avg(ma1.map((v) => v.score))
  const fu1Avg = avg(fu1.map((v) => v.score))
  if (ma1Avg !== null && fu1Avg !== null) {
    out.push({
      id: 'cycle',
      tone: fu1Avg >= ma1Avg ? 'positive' : 'warning',
      text: `Follow-up 1 scores averaged ${fu1Avg.toFixed(1)}% versus ${ma1Avg.toFixed(1)}% at Main Audit 1 — corrective actions delivered a ${(fu1Avg - ma1Avg).toFixed(1)}-point ${fu1Avg >= ma1Avg ? 'improvement' : 'decline'}.`,
      link: '/performance/benchmarking',
    })
  }

  // Trend momentum (last 3 months vs previous 3)
  const withData = trend.filter((p) => p.overall !== null)
  if (withData.length >= 6) {
    const last3 = avg(withData.slice(-3).map((p) => p.overall))
    const prev3 = avg(withData.slice(-6, -3).map((p) => p.overall))
    if (last3 !== null && prev3 !== null) {
      out.push({
        id: 'momentum',
        tone: last3 >= prev3 ? 'positive' : 'warning',
        text: `Portfolio momentum is ${last3 >= prev3 ? 'positive' : 'negative'}: the last three months averaged ${last3.toFixed(1)}% against ${prev3.toFixed(1)}% in the preceding quarter.`,
        link: '/performance/trends',
      })
    }
  }
  void ma
  return out
}

function numberWord(n: number): string {
  return ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][n] ?? String(n)
}

// ───────────────────────────── Visit helpers ─────────────────────────────

export function visitTypeOrder(t: VisitType): number {
  return ['Main Audit 1', 'Follow-up 1', 'Main Audit 2', 'Follow-up 2'].indexOf(t)
}

export function outletVisitHistory(visits: Visit[], outletId: string): Visit[] {
  return visits.filter((v) => v.outletId === outletId).sort((a, b) => visitTypeOrder(a.type) - visitTypeOrder(b.type))
}

export function latestCompletedVisit(visits: Visit[], outletId: string): Visit | null {
  return visits.filter((v) => v.outletId === outletId && isCompleted(v)).sort((a, b) => (b.visitDate ?? '').localeCompare(a.visitDate ?? ''))[0] ?? null
}

export function categoryScoresToRadar(cs: CategoryScores | null, label = 'Score') {
  return CATEGORY_KEYS.map((k) => ({ category: CATEGORY_LABELS[k], key: k, [label]: cs && !Number.isNaN(cs[k]) ? round(cs[k]) : 0 }))
}
