import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AlertOctagon, ArrowRight, BellRing, ClipboardCheck, FileBarChart, Gauge, Lightbulb, PlayCircle, ShieldCheck, Sparkles, Store, TrendingDown, TrendingUp, Utensils, Wrench } from 'lucide-react'
import { useData } from '@/contexts/DataContext'
import { useAuth } from '@/contexts/AuthContext'
import { useFilters } from '@/contexts/FilterContext'
import { useGuidedDemo } from '@/contexts/GuidedDemoContext'
import { useDocumentTitle, useNow } from '@/hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { RiskBadge, ScoreBadge, SegmentBadge, SeverityBadge, StatusBadge, scoreTextClass } from '@/components/ui/Badge'
import { AutomatedLabel, ProgressBar } from '@/components/ui/Misc'
import { SegmentedControl } from '@/components/ui/Form'
import { EmptyState } from '@/components/ui/States'
import { CHART_COLORS, ChartCard, DonutChart, GroupedBarChart, HBarChart, HeatLegend, Heatmap, RadarCompareChart, TrendChart } from '@/components/charts'
import { capaStats, categoryAverages, generateInsights, heatmapRows, kpiSummary, mainVsFollowUp, monthlyTrend, rankedOutlets, segmentComparison } from '@/services/analytics'
import { isCompleted, isOpenFinding } from '@/services/derive'
import { createReport } from '@/services/actions'
import { CATEGORY_KEYS, CATEGORY_SHORT } from '@/utils/scoring'
import { fmtDate, fmtDateTime, fmtPct, relativeTime } from '@/utils/format'
import { isDemoMode } from '@/config/app'
import { cn } from '@/utils/cn'

export default function ExecutiveDashboardPage() {
  useDocumentTitle('Executive Dashboard')
  const { data, scopedOutlets, scopedVisits, dispatch } = useData()
  const { can } = useAuth()
  const { periodMonths, outletScope } = useFilters()
  const demo = useGuidedDemo()
  const now = useNow()
  const navigate = useNavigate()
  const [rankMode, setRankMode] = useState<'top' | 'bottom'>('top')
  const [generating, setGenerating] = useState(false)

  const outlets = scopedOutlets
  const outletIds = useMemo(() => new Set(outlets.map((o) => o.id)), [outlets])
  const visits = useMemo(() => scopedVisits.filter((v) => outletIds.has(v.outletId)), [scopedVisits, outletIds])
  const findings = useMemo(() => data.findings.filter((f) => outletIds.has(f.outletId)), [data.findings, outletIds])
  const actions = useMemo(() => data.correctiveActions.filter((a) => outletIds.has(a.outletId)), [data.correctiveActions, outletIds])
  const alerts = useMemo(() => data.alerts.filter((a) => outletIds.has(a.outletId)), [data.alerts, outletIds])

  const kpi = useMemo(() => kpiSummary(data, outlets), [data, outlets])
  const trend = useMemo(() => monthlyTrend(visits, findings, actions, now, periodMonths), [visits, findings, actions, now, periodMonths])
  const ranked = useMemo(() => rankedOutlets(outlets), [outlets])
  const cats = useMemo(() => categoryAverages(outlets), [outlets])
  const mvf = useMemo(() => mainVsFollowUp(visits), [visits])
  const seg = useMemo(() => segmentComparison(outlets), [outlets])
  const capa = useMemo(() => capaStats(actions, now), [actions, now])
  const insights = useMemo(() => generateInsights(data, outlets, now), [data, outlets, now])
  const heat = useMemo(() => heatmapRows(outlets), [outlets])
  const outletName = (id: string) => data.outlets.find((o) => o.id === id)?.name ?? id

  const recentVisits = useMemo(() => visits.filter(isCompleted).sort((a, b) => (b.reviewedAt ?? b.visitDate ?? '').localeCompare(a.reviewedAt ?? a.visitDate ?? '')).slice(0, 6), [visits])
  const openCritical = useMemo(() => findings.filter((f) => isOpenFinding(f) && f.severity === 'Critical').sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [findings])
  const latestAlerts = useMemo(() => alerts.filter((a) => a.status !== 'Closed' && a.status !== 'Resolved').slice(0, 5), [alerts])

  const radarData = cats.map((c) => ({ category: CATEGORY_SHORT[c.key], score: c.value ?? 0, target: data.kpiConfig.find((k) => k.key === c.key)?.target ?? 90 }))
  const rankData = (rankMode === 'top' ? ranked.slice(0, 10) : [...ranked].reverse().slice(0, 10)).map((o) => ({ name: o.name.length > 26 ? `${o.name.slice(0, 25)}…` : o.name, value: o.overallScore ?? 0, id: o.id }))
  const segData = CATEGORY_KEYS.map((k) => ({ name: CATEGORY_SHORT[k], 'F&B': seg[0][k] ?? 0, Entertainment: seg[1][k] ?? 0 }))
  const mvfData = mvf.map((r) => ({ name: r.cycle, 'Main Audit': r.mainAudit ?? 0, 'Follow-up': r.followUp ?? 0 }))
  const critTrend = trend.map((p) => ({ name: p.label, Critical: p.critical }))

  const generateReport = async () => {
    setGenerating(true)
    try {
      await dispatch((d, ctx) =>
        createReport(d, ctx, {
          title: `Executive Summary — ${fmtDate(ctx.now, 'dd MMM yyyy')}`,
          type: 'Executive Summary',
          period: `${trend[0]?.label ?? ''} – ${trend[trend.length - 1]?.label ?? ''}`,
          status: 'Draft',
          scope: outletScope === 'all' ? `All ${outlets.length} outlets` : outletName(outletScope),
          outletIds: outletScope === 'all' ? [] : [outletScope],
          summary: `Portfolio score ${fmtPct(kpi.overall)} · ${kpi.visitsCompleted}/${kpi.visitsPlanned} visits completed · ${kpi.criticalIssues} open critical findings · CAPA closure ${fmtPct(kpi.capaClosureRate, 0)}.`,
          pages: 8,
        }),
      )
      toast.success('Executive report generated')
      navigate('/reports/management')
    } finally {
      setGenerating(false)
    }
  }

  // An empty system and a permissions problem look identical from here, so distinguish them:
  // on day one an administrator needs a way forward, not a message implying they lack access.
  if (!outlets.length) {
    const systemIsEmpty = data.outlets.length === 0
    return (
      <EmptyState
        icon={systemIsEmpty ? Store : ShieldCheck}
        title={systemIsEmpty ? 'No outlets yet' : 'No outlets in scope'}
        message={
          systemIsEmpty
            ? 'The programme has no outlets on record. Add the outlets to be assessed, then schedule their visits.'
            : 'Your account is not authorised for any outlets. Ask an administrator to assign them.'
        }
        action={
          systemIsEmpty && can('admin.outlets') ? (
            <Link to="/admin/outlets" className="btn-primary">
              <Store className="h-4 w-4" /> Add the first outlet
            </Link>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Executive Dashboard"
        subtitle={`${data.organization.name} · ${data.organization.engagementName} · ${outletScope === 'all' ? `${outlets.length} outlets` : outletName(outletScope)} · as of ${fmtDate(now)}`}
        actions={
          <>
            {isDemoMode() && (
              <button type="button" className="btn-secondary" onClick={demo.start}>
                <PlayCircle className="h-4 w-4" /> Launch Guided Demo
              </button>
            )}
            {can('reports.management') && (
              <button type="button" className="btn-primary" onClick={() => void generateReport()} disabled={generating}>
                <FileBarChart className="h-4 w-4" /> {generating ? 'Generating…' : 'Generate Executive Report'}
              </button>
            )}
          </>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8 md:gap-4">
        <KpiCard tour="kpi-overall" label="Overall Experience Score" value={fmtPct(kpi.overall)} delta={kpi.overallDelta} icon={Gauge} tone="accent" onClick={() => navigate('/performance/outlets')} />
        <KpiCard label="Operational Compliance" value={fmtPct(kpi.categories.operational_compliance.value)} delta={kpi.categories.operational_compliance.delta} icon={ClipboardCheck} tone="good" onClick={() => navigate('/performance/kpi')} />
        <KpiCard label="Service Experience" value={fmtPct(kpi.categories.customer_experience.value)} delta={kpi.categories.customer_experience.delta} icon={Sparkles} onClick={() => navigate('/performance/kpi')} />
        <KpiCard label="Environment & Product" value={fmtPct(kpi.categories.product_environment.value)} delta={kpi.categories.product_environment.delta} icon={Utensils} onClick={() => navigate('/performance/kpi')} />
        <KpiCard label="Entertainment Safety Compliance" value={fmtPct(kpi.entertainmentSafety)} delta={kpi.entertainmentSafetyDelta} icon={ShieldCheck} tone="good" onClick={() => navigate('/performance/benchmarking')} />
        <KpiCard label="Visits Completed" value={<span>{kpi.visitsCompleted} <span className="text-base text-slate-400 font-medium">/ {kpi.visitsPlanned}</span></span>} sub={`${kpi.visitsInProgress} in progress · ${kpi.visitsAwaiting} awaiting approval`} icon={Store} onClick={() => navigate('/operations/visits')} />
        <KpiCard label="Critical Issues" value={kpi.criticalIssues} sub={`${kpi.highIssues} high · ${kpi.mediumIssues} medium open`} icon={AlertOctagon} tone={kpi.criticalIssues > 0 ? 'critical' : 'good'} onClick={() => navigate('/quality/findings?severity=Critical')} />
        <KpiCard label="Corrective Action Closure" value={fmtPct(kpi.capaClosureRate, 0)} delta={kpi.capaClosureDelta} deltaSuffix=" pts" icon={Wrench} tone={kpi.capaOverdue > 0 ? 'warn' : 'good'} onClick={() => navigate('/quality/corrective-actions')} />
      </div>

      {/* Trend + radar */}
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Overall score trend" subtitle={`Monthly average of scored visits · last ${periodMonths} months`} className="xl:col-span-2" height={300} footer={<span>Dashed line = programme target 88%. Improvement after corrective-action cycles is visible from the second quarter.</span>}>
          <TrendChart data={trend} series={[{ key: 'overall', label: 'Overall score' }]} area target={88} yDomain={[60, 100]} showLegend={false} />
        </ChartCard>
        <ChartCard title="Performance by assessment category" subtitle="Portfolio average vs KPI target" height={300}>
          <RadarCompareChart data={radarData} series={[{ key: 'score', label: 'Actual' }, { key: 'target', label: 'Target', color: CHART_COLORS.guide }]} />
        </ChartCard>
      </div>

      {/* Ranking + MA vs FU + completion */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <ChartCard
          title="Outlet ranking"
          subtitle={rankMode === 'top' ? 'Top 10 outlets by latest approved score' : 'Bottom 10 outlets requiring attention'}
          className="lg:col-span-2"
          height={360}
          actions={<SegmentedControl options={[{ value: 'top', label: 'Top 10' }, { value: 'bottom', label: 'Bottom 10' }]} value={rankMode} onChange={setRankMode} ariaLabel="Ranking mode" />}
        >
          <HBarChart data={rankData} domain={[50, 100]} onBarClick={(row) => navigate(`/performance/outlets/${row.id as string}`)} labelWidth={170} />
        </ChartCard>
        <ChartCard title="Main Audit vs Follow-up" subtitle="Average score by cycle" height={360}>
          <GroupedBarChart data={mvfData} series={[{ key: 'Main Audit', label: 'Main Audit' }, { key: 'Follow-up', label: 'Follow-up' }]} domain={[60, 100]} />
        </ChartCard>
        <ChartCard title="Visit completion progress" subtitle={`${kpi.visitsCompleted} of ${kpi.visitsPlanned} annual visits`} height={360}>
          <DonutChart
            value={kpi.visitsCompleted}
            max={kpi.visitsPlanned}
            label={`${Math.round((kpi.visitsCompleted / Math.max(1, kpi.visitsPlanned)) * 100)}%`}
            sublabel="completed"
            segments={[
              { value: kpi.visitsCompleted, color: CHART_COLORS.navy, label: 'Completed' },
              { value: kpi.visitsAwaiting, color: CHART_COLORS.violet, label: 'Awaiting approval' },
              { value: kpi.visitsInProgress, color: CHART_COLORS.amber, label: 'In progress' },
              { value: kpi.visitsScheduled, color: CHART_COLORS.teal, label: 'Scheduled' },
              { value: kpi.visitsUnassigned, color: CHART_COLORS.slate, label: 'Unassigned' },
            ]}
          />
        </ChartCard>
      </div>

      {/* Segment comparison + critical trend */}
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="F&B vs Entertainment" subtitle={`${seg[0].count} F&B outlets (${fmtPct(seg[0].overall)}) · ${seg[1].count} Entertainment outlets (${fmtPct(seg[1].overall)})`} height={280}>
          <GroupedBarChart data={segData} series={[{ key: 'F&B', label: 'F&B', color: CHART_COLORS.teal }, { key: 'Entertainment', label: 'Entertainment', color: CHART_COLORS.violet }]} domain={[40, 100]} />
        </ChartCard>
        <ChartCard title="Critical issue trend" subtitle="Critical findings raised per month" height={280}>
          <GroupedBarChart data={critTrend} series={[{ key: 'Critical', label: 'Critical findings', color: CHART_COLORS.red }]} domain={[0, Math.max(4, ...critTrend.map((c) => c.Critical)) + 1]} unit="" showLegend={false} />
        </ChartCard>
      </div>

      {/* Heatmap */}
      <Card>
        <CardHeader title="KPI performance heatmap" subtitle="Latest approved category scores per outlet, ranked by overall score" actions={<HeatLegend />} />
        <CardBody>
          <Heatmap rows={heat.map((r) => ({ id: r.outletId, label: r.name, sub: r.code, values: CATEGORY_KEYS.map((k) => r[k]) }))} columns={CATEGORY_KEYS.map((k) => CATEGORY_SHORT[k])} onRowClick={(id) => navigate(`/performance/outlets/${id}`)} maxHeight={380} />
        </CardBody>
      </Card>

      {/* Top / bottom lists */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RankList title="Top 5 performing outlets" subtitle="Consistently exceeding brand standards" icon={TrendingUp} items={ranked.slice(0, 5)} />
        <RankList title="Bottom 5 outlets requiring attention" subtitle="Prioritised for intervention and follow-up" icon={TrendingDown} items={[...ranked].reverse().slice(0, 5)} highlight />
      </div>

      {/* Recent visits + open critical */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recently completed visits" subtitle="Latest approved assessments" actions={<Link to="/operations/visits?status=Approved" className="text-xs link">View all</Link>} />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Visit</th>
                  <th>Outlet</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th className="text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {recentVisits.map((v) => (
                  <tr key={v.id} className="cursor-pointer" onClick={() => navigate(`/reports/visits/${v.id}`)}>
                    <td className="font-mono text-xs">{v.code}</td>
                    <td className="max-w-[200px] truncate">{outletName(v.outletId)}</td>
                    <td className="whitespace-nowrap">{v.type}</td>
                    <td className="whitespace-nowrap">{fmtDate(v.visitDate)}</td>
                    <td className="text-right"><ScoreBadge score={v.score} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Open critical issues" subtitle={`${openCritical.length} critical findings awaiting closure`} actions={<Link to="/quality/findings?severity=Critical" className="text-xs link">View all</Link>} />
          <ul className="divide-y divide-slate-100 dark:divide-navy-800">
            {openCritical.length === 0 && <li className="px-5 py-6 text-sm text-slate-500">No open critical issues.</li>}
            {openCritical.slice(0, 6).map((f) => (
              <li key={f.id}>
                <Link to={`/quality/findings?finding=${f.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-navy-800/60">
                  <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{f.title}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{outletName(f.outletId)} · {f.code} · {fmtDate(f.createdAt)}</span>
                  </span>
                  <StatusBadge status={f.status} size="xs" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* CAPA + alerts + insights */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Corrective action status" subtitle={`${capa.total} actions · closure rate ${fmtPct(capa.closureRate, 0)}`} actions={<Link to="/quality/corrective-actions" className="text-xs link">Manage</Link>} />
          <CardBody className="space-y-3">
            {[
              { label: 'Closed', value: capa.closed, tone: 'green' as const },
              { label: 'Open / in progress', value: capa.open - capa.overdue - capa.awaitingVerification, tone: 'accent' as const },
              { label: 'Awaiting verification', value: capa.awaitingVerification, tone: 'navy' as const },
              { label: 'Overdue', value: capa.overdue, tone: 'red' as const },
            ].map((r) => (
              <div key={r.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-600 dark:text-slate-300">{r.label}</span>
                  <span className="font-semibold tabular-nums">{r.value}</span>
                </div>
                <ProgressBar value={r.value} max={Math.max(1, capa.total)} tone={r.tone} size="sm" />
              </div>
            ))}
            <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">Average closure time {capa.avgClosureDays === null ? '—' : `${capa.avgClosureDays.toFixed(0)} days`} · {capa.dueSoon} due within 7 days</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Latest alerts" subtitle="Open escalations" actions={<Link to="/quality/alerts" className="text-xs link">Alert centre</Link>} />
          <ul className="divide-y divide-slate-100 dark:divide-navy-800">
            {latestAlerts.length === 0 && <li className="px-5 py-6 text-sm text-slate-500">No open alerts.</li>}
            {latestAlerts.map((a) => (
              <li key={a.id}>
                <Link to={`/quality/alerts?alert=${a.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-navy-800/60">
                  <BellRing className={cn('mt-0.5 h-4 w-4 shrink-0', a.severity === 'Critical' ? 'text-red-600' : a.severity === 'High' ? 'text-amber-600' : 'text-blue-600')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{a.type}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{outletName(a.outletId)} · {relativeTime(a.createdAt, now)}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <SeverityBadge severity={a.severity} size="xs" />
                    <StatusBadge status={a.status} size="xs" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Management insights" subtitle="Rule-based observations from the current dataset" actions={<AutomatedLabel />} />
          <ul className="divide-y divide-slate-100 dark:divide-navy-800">
            {insights.slice(0, 6).map((i) => (
              <li key={i.id} className="px-5 py-3">
                <Link to={i.link ?? '#'} className="flex items-start gap-3 group">
                  <Lightbulb className={cn('mt-0.5 h-4 w-4 shrink-0', i.tone === 'critical' ? 'text-red-600' : i.tone === 'warning' ? 'text-amber-600' : i.tone === 'positive' ? 'text-emerald-600' : 'text-blue-600')} aria-hidden />
                  <span className="text-sm text-slate-700 dark:text-slate-200 leading-snug group-hover:text-slate-900 dark:group-hover:text-white">{i.text}</span>
                  <ArrowRight className="ml-auto mt-1 h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-teal-600" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <p className="text-[11px] text-slate-400">Counts and averages are computed live from the seeded dataset; KPI cards, charts and tables reconcile to the same records. Visit dates: {fmtDateTime(now)} reporting date.</p>
    </div>
  )
}

function RankList({ title, subtitle, icon: Icon, items, highlight = false }: { title: string; subtitle: string; icon: typeof TrendingUp; items: ReturnType<typeof rankedOutlets>; highlight?: boolean }) {
  const navigate = useNavigate()
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Icon className={cn('h-4 w-4', highlight ? 'text-amber-600' : 'text-emerald-600')} aria-hidden />{title}</span>} subtitle={subtitle} />
      <ul className="divide-y divide-slate-100 dark:divide-navy-800">
        {items.map((o) => (
          <li key={o.id}>
            <button type="button" onClick={() => navigate(`/performance/outlets/${o.id}`)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-navy-800/60">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-navy-800 dark:text-slate-300 tabular-nums">#{o.rank}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{o.name}</span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <SegmentBadge segment={o.segment} size="xs" /> {o.subcategory} · {o.openIssues} open issues
                </span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <span className={cn('text-base font-semibold tabular-nums', scoreTextClass(o.overallScore))}>{fmtPct(o.overallScore)}</span>
                <RiskBadge risk={o.riskRating} size="xs" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
