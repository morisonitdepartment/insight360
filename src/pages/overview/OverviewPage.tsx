import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertOctagon,
  ArrowRight,
  BellRing,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  Gauge,
  GraduationCap,
  Lightbulb,
  PlayCircle,
  ShieldCheck,
  Store,
  Timer,
  TrendingUp,
  Wrench,
} from 'lucide-react'
import { useData } from '@/contexts/DataContext'
import { useAuth } from '@/contexts/AuthContext'
import { useGuidedDemo } from '@/contexts/GuidedDemoContext'
import { useDocumentTitle, useNow } from '@/hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, RiskBadge, ScoreBadge, SegmentBadge, SeverityBadge, StatusBadge, scoreTextClass } from '@/components/ui/Badge'
import { AutomatedLabel, ProgressBar } from '@/components/ui/Misc'
import { EmptyState } from '@/components/ui/States'
import { ChartCard, TrendChart } from '@/components/charts'
import { capaStats, generateInsights, kpiSummary, monthlyTrend, rankedOutlets, slaStats } from '@/services/analytics'
import { isCompleted, isOpenFinding } from '@/services/derive'
import { ROLE_LABELS } from '@/config/permissions'
import { fmtDate, fmtDateTime, fmtPct, relativeTime } from '@/utils/format'
import { isDemoMode } from '@/config/app'
import { cn } from '@/utils/cn'

export default function OverviewPage() {
  useDocumentTitle('Overview')
  const { data, scopedOutlets, scopedVisits } = useData()
  const { user, role, can } = useAuth()
  const demo = useGuidedDemo()
  const now = useNow()
  const navigate = useNavigate()

  const outletIds = useMemo(() => new Set(scopedOutlets.map((o) => o.id)), [scopedOutlets])
  const findings = useMemo(() => data.findings.filter((f) => outletIds.has(f.outletId)), [data.findings, outletIds])
  const actions = useMemo(() => data.correctiveActions.filter((a) => outletIds.has(a.outletId)), [data.correctiveActions, outletIds])
  const alerts = useMemo(() => data.alerts.filter((a) => outletIds.has(a.outletId)), [data.alerts, outletIds])
  const outletName = (id: string) => data.outlets.find((o) => o.id === id)?.name ?? id

  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'

  if (role === 'shopper') return <ShopperOverview />

  const kpi = kpiSummary(data, scopedOutlets)
  const trend = monthlyTrend(scopedVisits, findings, actions, now, 12)
  const capa = capaStats(actions, now)
  const sla = slaStats(scopedVisits, now)
  const ranked = rankedOutlets(scopedOutlets)
  const insights = generateInsights(data, scopedOutlets, now)
  const openCritical = findings.filter((f) => isOpenFinding(f) && f.severity === 'Critical')
  const openAlerts = alerts.filter((a) => a.status !== 'Resolved' && a.status !== 'Closed')
  const escalationOverdue = openAlerts.filter((a) => a.escalationDue < fmtDateTime(now).replace(' ', 'T') && a.status === 'New')
  const awaiting = scopedVisits.filter((v) => v.status === 'Submitted' || v.status === 'Under Review')
  const upcoming = scopedVisits.filter((v) => !isCompleted(v) && v.scheduledDate >= fmtDate(now, 'yyyy-MM-dd')).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)).slice(0, 6)
  const recent = scopedVisits.filter(isCompleted).sort((a, b) => (b.reviewedAt ?? b.visitDate ?? '').localeCompare(a.reviewedAt ?? a.visitDate ?? '')).slice(0, 5)

  const scopeLabel = role === 'ops_manager' ? `${scopedOutlets.length} assigned outlets` : `${scopedOutlets.length} outlets`

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${greeting}, ${user?.name.split(' ')[0] ?? ''}`}
        subtitle={`${data.organization.name} · ${data.organization.engagementName} · ${scopeLabel} · ${fmtDate(now, 'EEEE dd MMMM yyyy')}`}
        badge={<Badge tone="teal">{role ? ROLE_LABELS[role] : ''}</Badge>}
        actions={
          <>
            {isDemoMode() && (
              <button type="button" className="btn-secondary" onClick={demo.start}>
                <PlayCircle className="h-4 w-4" /> Launch Guided Demo
              </button>
            )}
            {can('dashboard.executive') && (
              <Link to="/performance/executive" className="btn-primary">
                <Gauge className="h-4 w-4" /> Executive Dashboard
              </Link>
            )}
          </>
        }
      />

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 md:gap-4">
        <KpiCard compact label="Portfolio score" value={fmtPct(kpi.overall)} delta={kpi.overallDelta} icon={Gauge} tone="accent" onClick={can('outlets.view') ? () => navigate('/performance/outlets') : undefined} />
        <KpiCard compact label="Visits completed" value={<span>{kpi.visitsCompleted}<span className="text-base font-medium text-slate-400"> / {kpi.visitsPlanned}</span></span>} sub={`${kpi.visitsInProgress} in progress`} icon={ClipboardCheck} onClick={can('visits.view') ? () => navigate('/operations/visits') : undefined} />
        <KpiCard compact label="Open critical issues" value={openCritical.length} sub={`${kpi.highIssues} high · ${kpi.mediumIssues} medium`} icon={AlertOctagon} tone={openCritical.length ? 'critical' : 'good'} onClick={can('findings.view') ? () => navigate('/quality/findings?severity=Critical') : undefined} />
        <KpiCard compact label="Open alerts" value={openAlerts.length} sub={escalationOverdue.length ? `${escalationOverdue.length} past escalation target` : 'All within escalation target'} icon={BellRing} tone={escalationOverdue.length ? 'warn' : 'default'} onClick={can('alerts.view') ? () => navigate('/quality/alerts') : undefined} />
        <KpiCard compact label="Corrective actions open" value={capa.open} sub={`${capa.overdue} overdue · ${capa.dueSoon} due in 7 days`} icon={Wrench} tone={capa.overdue ? 'warn' : 'good'} onClick={can('actions.view') ? () => navigate('/quality/corrective-actions') : undefined} />
        <KpiCard compact label="Reporting SLA" value={fmtPct(sla.compliancePct, 0)} sub={sla.avgTurnaroundHours === null ? undefined : `avg ${sla.avgTurnaroundHours.toFixed(0)}h turnaround`} icon={Timer} tone={(sla.compliancePct ?? 100) >= 90 ? 'good' : 'warn'} onClick={can('reports.visit') ? () => navigate('/reports/visits') : undefined} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Trend */}
        <ChartCard title="Portfolio score trend" subtitle="Monthly average of scored visits over the last 12 months" className="xl:col-span-2" height={260} footer={<span>Programme target 88%. {trend.filter((t) => t.overall !== null).length} months with completed assessments.</span>}>
          <TrendChart data={trend} series={[{ key: 'overall', label: 'Overall score' }]} area target={88} yDomain={[60, 100]} showLegend={false} />
        </ChartCard>

        {/* Attention list */}
        <Card>
          <CardHeader title="Needs your attention" subtitle="Items assigned to your role" />
          <ul className="divide-y divide-slate-100 dark:divide-navy-800">
            {openCritical.slice(0, 2).map((f) => (
              <AttentionRow key={f.id} to={`/quality/findings?finding=${f.id}`} icon={AlertOctagon} tone="critical" title={f.title} sub={`${outletName(f.outletId)} · ${f.code}`} badge={<SeverityBadge severity={f.severity} size="xs" />} disabled={!can('findings.view')} />
            ))}
            {can('visits.review') &&
              awaiting.slice(0, 2).map((v) => (
                <AttentionRow key={v.id} to={`/reports/visits/${v.id}`} icon={FileBarChart} tone="info" title={`Report awaiting approval · ${v.code}`} sub={`${outletName(v.outletId)} · ${v.type}`} badge={<ScoreBadge score={v.score} size="xs" />} />
              ))}
            {actions
              .filter((a) => a.status === 'Overdue')
              .slice(0, 2)
              .map((a) => (
                <AttentionRow key={a.id} to={`/quality/corrective-actions?action=${a.id}`} icon={Wrench} tone="warn" title={a.title} sub={`${a.code} · target ${fmtDate(a.targetDate)} · ${a.ownerName}`} badge={<StatusBadge status={a.status} size="xs" />} disabled={!can('actions.view')} />
              ))}
            {openCritical.length === 0 && awaiting.length === 0 && capa.overdue === 0 && (
              <li className="px-5 py-8">
                <EmptyState icon={ShieldCheck} title="Nothing needs attention" message="No open critical findings, pending approvals or overdue actions in your scope." />
              </li>
            )}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {/* Upcoming */}
        <Card className="xl:col-span-2">
          <CardHeader title="Upcoming visits" subtitle="Next scheduled assessments" actions={can('calendar.view') ? <Link to="/operations/calendar" className="text-xs link">Calendar</Link> : undefined} />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Scheduled</th>
                  <th>Outlet</th>
                  <th>Type</th>
                  <th>Shopper</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-slate-500 py-6">No upcoming visits scheduled.</td>
                  </tr>
                )}
                {upcoming.map((v) => (
                  <tr key={v.id} className={can('visits.view') ? 'cursor-pointer' : ''} onClick={can('visits.view') ? () => navigate(`/operations/visits/${v.id}`) : undefined}>
                    <td className="whitespace-nowrap">{fmtDate(v.scheduledDate)}</td>
                    <td className="max-w-[200px] truncate">{outletName(v.outletId)}</td>
                    <td className="whitespace-nowrap">{v.type}</td>
                    <td className="whitespace-nowrap">{data.shoppers.find((s) => s.id === v.shopperId)?.name ?? <span className="text-amber-600">Unassigned</span>}</td>
                    <td><StatusBadge status={v.status} size="xs" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Recently completed */}
        <Card>
          <CardHeader title="Recently approved" subtitle="Latest completed assessments" actions={can('reports.visit') ? <Link to="/reports/visits" className="text-xs link">Reports</Link> : undefined} />
          <ul className="divide-y divide-slate-100 dark:divide-navy-800">
            {recent.length === 0 && <li className="px-5 py-6 text-sm text-slate-500">No approved visits yet.</li>}
            {recent.map((v) => (
              <li key={v.id}>
                <button type="button" onClick={() => navigate(can('reports.visit') ? `/reports/visits/${v.id}` : `/operations/visits/${v.id}`)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-navy-800/60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{outletName(v.outletId)}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{v.type} · {fmtDate(v.visitDate)}</span>
                  </span>
                  <ScoreBadge score={v.score} size="xs" />
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {/* Bottom outlets */}
        <Card>
          <CardHeader title="Lowest scoring outlets" subtitle="Prioritised for intervention" actions={can('outlets.view') ? <Link to="/performance/outlets?risk=Critical" className="text-xs link">All outlets</Link> : undefined} />
          <ul className="divide-y divide-slate-100 dark:divide-navy-800">
            {[...ranked].reverse().slice(0, 5).map((o) => (
              <li key={o.id}>
                <button type="button" disabled={!can('outlets.view')} onClick={() => navigate(`/performance/outlets/${o.id}`)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-slate-50 disabled:cursor-default dark:hover:bg-navy-800/60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{o.name}</span>
                    <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <SegmentBadge segment={o.segment} size="xs" /> {o.openIssues} open issues
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <span className={cn('text-sm font-semibold tabular-nums', scoreTextClass(o.overallScore))}>{fmtPct(o.overallScore)}</span>
                    <RiskBadge risk={o.riskRating} size="xs" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Insights */}
      <Card>
        <CardHeader title="Management insights" subtitle="Rule-based observations generated from the current dataset" actions={<AutomatedLabel />} />
        <CardBody>
          <ul className="grid gap-2 md:grid-cols-2">
            {insights.slice(0, 6).map((i) => (
              <li key={i.id}>
                <Link to={i.link ?? '#'} className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 transition-colors hover:border-teal-300 dark:border-navy-800 dark:hover:border-teal-700">
                  <Lightbulb className={cn('mt-0.5 h-4 w-4 shrink-0', i.tone === 'critical' ? 'text-red-600' : i.tone === 'warning' ? 'text-amber-600' : i.tone === 'positive' ? 'text-emerald-600' : 'text-blue-600')} aria-hidden />
                  <span className="text-sm leading-snug text-slate-700 dark:text-slate-200">{i.text}</span>
                  <ArrowRight className="ml-auto mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  )
}

function AttentionRow({ to, icon: Icon, tone, title, sub, badge, disabled }: { to: string; icon: typeof AlertOctagon; tone: 'critical' | 'warn' | 'info'; title: string; sub: string; badge?: React.ReactNode; disabled?: boolean }) {
  const body = (
    <span className="flex w-full items-start gap-3 px-5 py-3">
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone === 'critical' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-blue-600')} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{title}</span>
        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{sub}</span>
      </span>
      {badge}
    </span>
  )
  return <li>{disabled ? <span className="block opacity-70">{body}</span> : <Link to={to} className="block hover:bg-slate-50 dark:hover:bg-navy-800/60">{body}</Link>}</li>
}

/** Shopper landing page: assignments, drafts, deadlines and training. */
function ShopperOverview() {
  const { data, scopedVisits } = useData()
  const { user } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const shopper = data.shoppers.find((s) => s.id === user?.shopperId)
  const outletName = (id: string) => data.outlets.find((o) => o.id === id)?.name ?? id

  const active = scopedVisits.filter((v) => v.status === 'In Progress' || v.status === 'Draft' || v.status === 'Rejected').sort((a, b) => (a.submissionDeadline ?? '').localeCompare(b.submissionDeadline ?? ''))
  const assigned = scopedVisits.filter((v) => v.status === 'Assigned').sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
  const submitted = scopedVisits.filter((v) => v.submittedAt)
  const completed = scopedVisits.filter(isCompleted)
  const today = fmtDate(now, 'yyyy-MM-dd')
  const dueToday = active.filter((v) => v.submissionDeadline?.startsWith(today))
  const trainingDue = shopper?.training.filter((t) => t.status !== 'Completed') ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'}, ${user?.name.split(' ')[0] ?? ''}`}
        subtitle={`${shopper?.code ?? ''} · ${shopper?.profileType ?? ''} profile · ${shopper?.assignedCategories.join(' & ') ?? ''} · ${fmtDate(now, 'EEEE dd MMMM yyyy')}`}
        badge={<Badge tone="teal">Mystery Shopper</Badge>}
        actions={
          <Link to="/operations/visits" className="btn-primary">
            <ClipboardList className="h-4 w-4" /> My visits
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
        <KpiCard compact label="Active assessments" value={active.length} sub="in progress or draft" icon={ClipboardList} tone={active.length ? 'accent' : 'default'} onClick={() => navigate('/operations/visits')} />
        <KpiCard compact label="Upcoming assignments" value={assigned.length} sub={assigned[0] ? `next ${fmtDate(assigned[0].scheduledDate)}` : 'none scheduled'} icon={CalendarClock} onClick={() => navigate('/operations/calendar')} />
        <KpiCard compact label="Reports due today" value={dueToday.length} icon={Timer} tone={dueToday.length ? 'warn' : 'good'} sub={dueToday.length ? 'submit within 48h of the visit' : 'nothing due today'} />
        <KpiCard compact label="Completed visits" value={completed.length} sub={`${submitted.length} submitted in total`} icon={ClipboardCheck} tone="good" />
        <KpiCard compact label="On-time submission" value={fmtPct(shopper?.onTimeSubmissionPct, 0)} sub={`report quality ${shopper?.avgReportQuality?.toFixed(1) ?? '—'} / 5`} icon={TrendingUp} tone={(shopper?.onTimeSubmissionPct ?? 0) >= 90 ? 'good' : 'warn'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Continue your assessments" subtitle="Drafts and in-progress visits, earliest deadline first" />
          <ul className="divide-y divide-slate-100 dark:divide-navy-800">
            {active.length === 0 && <li className="px-5 py-8"><EmptyState title="Nothing in progress" message="Start an assigned visit when you arrive at the outlet." /></li>}
            {active.map((v) => (
              <li key={v.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{outletName(v.outletId)}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{v.code} · {v.type} · {v.journey}</p>
                  </div>
                  <StatusBadge status={v.status} size="xs" />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <ProgressBar value={v.progress} tone="accent" size="sm" className="flex-1" showValue />
                  <button type="button" className="btn-primary btn-sm" onClick={() => navigate(`/operations/visits/${v.id}/audit`)}>Continue</button>
                </div>
                {v.submissionDeadline && (
                  <p className={cn('mt-1.5 text-xs', v.submissionDeadline.startsWith(today) ? 'text-amber-700 dark:text-amber-300 font-medium' : 'text-slate-500')}>
                    Submission due {fmtDateTime(v.submissionDeadline)} · {relativeTime(v.submissionDeadline, now)}
                  </p>
                )}
                {v.status === 'Rejected' && v.reviewerComment && <p className="mt-1.5 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">Returned: {v.reviewerComment}</p>}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Your assignments" subtitle="Scheduled visits awaiting your attendance" actions={<Link to="/operations/calendar" className="text-xs link">Calendar</Link>} />
          <ul className="divide-y divide-slate-100 dark:divide-navy-800">
            {assigned.length === 0 && <li className="px-5 py-8"><EmptyState title="No upcoming assignments" message="New assignments appear here and in your notifications." /></li>}
            {assigned.slice(0, 6).map((v) => {
              const outlet = data.outlets.find((o) => o.id === v.outletId)
              return (
                <li key={v.id}>
                  <button type="button" onClick={() => navigate(`/operations/visits/${v.id}`)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-navy-800/60">
                    <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-navy-50 text-navy-800 dark:bg-navy-800 dark:text-teal-300">
                      <span className="text-[10px] uppercase leading-none">{fmtDate(v.scheduledDate, 'MMM')}</span>
                      <span className="text-sm font-bold leading-none">{fmtDate(v.scheduledDate, 'dd')}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{outlet?.name}</span>
                      <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        {outlet && <SegmentBadge segment={outlet.segment} size="xs" />} {v.type} · {v.journey}
                      </span>
                    </span>
                    <Store className="h-4 w-4 text-slate-300" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Training & briefing status"
          subtitle={`Certification: ${shopper?.certificationStatus ?? '—'} · ${trainingDue.length} module${trainingDue.length === 1 ? '' : 's'} outstanding`}
          actions={<GraduationCap className="h-4 w-4 text-slate-400" aria-hidden />}
        />
        <CardBody>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {data.trainingModules.map((m) => {
              const rec = shopper?.training.find((t) => t.moduleId === m.id)
              return (
                <li key={m.id} className="rounded-lg border border-slate-200 p-3 dark:border-navy-800">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{m.name}</p>
                  <div className="mt-1.5 flex items-center justify-between">
                    <StatusBadge status={rec?.status ?? 'Not Started'} size="xs" />
                    <span className="text-[11px] text-slate-500">{rec?.expiresAt ? `expires ${fmtDate(rec.expiresAt)}` : `${m.validityMonths} months`}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </CardBody>
      </Card>
    </div>
  )
}
