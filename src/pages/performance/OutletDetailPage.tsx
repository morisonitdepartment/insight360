import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, ClipboardList, Download, GitCompare, MapPin, Minus, Trophy } from 'lucide-react'
import { useData } from '@/contexts/DataContext'
import { useAuth } from '@/contexts/AuthContext'
import { useDocumentTitle, useNow } from '@/hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, RiskBadge, ScoreBadge, SegmentBadge, SeverityBadge, StatusBadge, scoreTextClass } from '@/components/ui/Badge'
import { DescriptionList, ProgressBar, Stat } from '@/components/ui/Misc'
import { EmptyState } from '@/components/ui/States'
import { EvidenceCard, EvidencePreviewModal } from '@/components/ui/EvidenceThumb'
import { CHART_COLORS, ChartCard, GroupedBarChart, TrendChart } from '@/components/charts'
import { benchmarksFor, monthlyTrend, outletVisitHistory, percentile } from '@/services/analytics'
import { isFollowUp, isMainAudit, isOpenFinding, isScored } from '@/services/derive'
import { logExport } from '@/services/actions'
import { CATEGORY_KEYS, CATEGORY_LABELS, CATEGORY_SHORT } from '@/utils/scoring'
import { exportCsv } from '@/utils/export'
import { fmtDate, fmtDelta, fmtPct, round } from '@/utils/format'
import type { Evidence } from '@/types'
import { cn } from '@/utils/cn'

export default function OutletDetailPage() {
  const { id } = useParams()
  const { data, authorizedOutlets, authorizedVisits, dispatch } = useData()
  const { can } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<Evidence | null>(null)

  const outlet = useMemo(() => data.outlets.find((o) => o.id === id), [data.outlets, id])
  const allowed = useMemo(() => authorizedOutlets.some((o) => o.id === id), [authorizedOutlets, id])
  useDocumentTitle(outlet ? outlet.name : 'Outlet')

  const history = useMemo(() => (outlet ? outletVisitHistory(data.visits, outlet.id) : []), [data.visits, outlet])
  const findings = useMemo(() => data.findings.filter((f) => f.outletId === id), [data.findings, id])
  const actions = useMemo(() => data.correctiveActions.filter((a) => a.outletId === id), [data.correctiveActions, id])
  const evidence = useMemo(() => data.evidence.filter((e) => e.outletId === id).slice(0, 8), [data.evidence, id])
  const trend = useMemo(() => monthlyTrend(data.visits.filter((v) => v.outletId === id), findings, actions, now, 12), [data.visits, id, findings, actions, now])
  const orgTrend = useMemo(() => monthlyTrend(authorizedVisits, data.findings, data.correctiveActions, now, 12), [authorizedVisits, data.findings, data.correctiveActions, now])
  const bench = useMemo(() => (outlet ? benchmarksFor(outlet, authorizedOutlets) : []), [outlet, authorizedOutlets])
  const pct = useMemo(() => (outlet ? percentile(outlet, authorizedOutlets) : null), [outlet, authorizedOutlets])

  // Main audit vs follow-up comparison: latest scored main audit and the follow-up that came after it
  const comparison = useMemo(() => {
    const scored = history.filter(isScored)
    const mains = scored.filter(isMainAudit)
    const main = mains[mains.length - 1]
    if (!main) return null
    const follow = scored.filter((v) => isFollowUp(v) && (v.visitDate ?? '') > (main.visitDate ?? ''))[0] ?? null
    return { main, follow }
  }, [history])

  useEffect(() => {
    if (window.location.hash === '#comparison') {
      const t = setTimeout(() => document.getElementById('comparison')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
      return () => clearTimeout(t)
    }
  }, [id])

  if (!outlet || !allowed) return <EmptyState title="Outlet not available" message="This outlet does not exist or is outside your authorised scope." action={<Link to="/performance/outlets" className="btn-secondary">Back to outlets</Link>} />

  const latestMain = [...history].filter((v) => isMainAudit(v) && isScored(v)).pop()
  const latestFollow = [...history].filter((v) => isFollowUp(v) && isScored(v)).pop()
  const completed = history.filter((v) => v.status === 'Approved' || v.status === 'Closed').length
  const trendData = trend.map((p, i) => ({ label: p.label, Outlet: p.overall, Organisation: orgTrend[i]?.overall ?? null }))
  const issueTrend = trend.map((p) => {
    const key = p.key
    const monthFindings = findings.filter((f) => f.createdAt.startsWith(key))
    return { name: p.label, Critical: monthFindings.filter((f) => f.severity === 'Critical').length, High: monthFindings.filter((f) => f.severity === 'High').length, Medium: monthFindings.filter((f) => f.severity === 'Medium').length }
  })
  const delta = outlet.overallScore !== null && outlet.previousScore !== null ? outlet.overallScore - outlet.previousScore : null
  const openFindings = findings.filter(isOpenFinding)

  const exportOutlet = () => {
    exportCsv(
      history.map((v) => ({ Visit: v.code, Type: v.type, Status: v.status, 'Visit date': v.visitDate ?? '', Score: v.score ?? '', Risk: v.risk ?? '', ...Object.fromEntries(CATEGORY_KEYS.map((k) => [CATEGORY_LABELS[k], v.categoryScores?.[k] ?? ''])) })),
      `${outlet.code}-audit-history.csv`,
    )
    void dispatch((d, ctx) => logExport(d, ctx, outlet.code, 'CSV'))
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={outlet.name}
        badge={
          <span className="flex flex-wrap items-center gap-1.5">
            <SegmentBadge segment={outlet.segment} />
            <Badge tone="slate">{outlet.subcategory}</Badge>
            <StatusBadge status={outlet.status} />
          </span>
        }
        subtitle={`${outlet.code} · ${outlet.brand} · ${outlet.location}, ${outlet.region} · Manager ${outlet.manager} · ${outlet.openingHours}`}
        actions={
          <>
            {can('outlets.compare') && (
              <button type="button" className="btn-secondary" onClick={() => navigate(`/performance/compare?outlets=${outlet.id}`)}>
                <GitCompare className="h-4 w-4" /> Compare
              </button>
            )}
            {can('visits.view') && (
              <Link to={`/operations/visits?outlet=${outlet.id}`} className="btn-secondary">
                <ClipboardList className="h-4 w-4" /> Visits
              </Link>
            )}
            {can('reports.export') && (
              <button type="button" className="btn-primary" onClick={exportOutlet}>
                <Download className="h-4 w-4" /> Export
              </button>
            )}
          </>
        }
      />

      {/* Score band */}
      <Card tour="outlet-score" className="p-5">
        <div className="grid gap-5 md:grid-cols-[auto_1fr] md:items-center">
          <div className="flex items-center gap-5">
            <div className="text-center">
              <p className={cn('text-5xl font-bold tabular-nums leading-none', scoreTextClass(outlet.overallScore))}>{outlet.overallScore === null ? '—' : outlet.overallScore.toFixed(1)}<span className="text-2xl">%</span></p>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-slate-500">Current overall score</p>
              <div className="mt-2 flex justify-center"><RiskBadge risk={outlet.riskRating} size="md" /></div>
            </div>
            <div className="hidden sm:block h-20 w-px bg-slate-200 dark:bg-navy-800" />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Previous score" value={fmtPct(outlet.previousScore)} sub={delta !== null ? <span className={cn('inline-flex items-center gap-0.5', delta >= 0 ? 'text-emerald-600' : 'text-red-600')}>{delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{fmtDelta(delta, 1, ' pts')}</span> : undefined} />
            <Stat label="Target score" value={`${outlet.targetScore}%`} sub={outlet.overallScore !== null ? `${fmtDelta(outlet.overallScore - outlet.targetScore, 1, ' pts')} vs target` : undefined} />
            <Stat label="Rank" value={outlet.rank ? `#${outlet.rank}` : '—'} sub={`of ${authorizedOutlets.filter((o) => o.overallScore !== null).length} outlets · P${pct ?? '—'}`} />
            <Stat label="Visit completion" value={`${completed} / ${outlet.annualVisits}`} sub={<ProgressBar value={completed} max={outlet.annualVisits} tone="accent" size="sm" className="mt-1" />} />
            <Stat label="Main audit score" value={fmtPct(latestMain?.score)} sub={latestMain ? `${latestMain.type} · ${fmtDate(latestMain.visitDate)}` : 'Not yet assessed'} />
            <Stat label="Follow-up score" value={fmtPct(latestFollow?.score)} sub={latestFollow ? `${latestFollow.type} · ${fmtDate(latestFollow.visitDate)}${latestFollow.status === 'Submitted' || latestFollow.status === 'Under Review' ? ' · pending approval' : ''}` : 'Not yet assessed'} />
          </div>
        </div>
      </Card>

      {/* Category scores + benchmarks + location */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Category scores" subtitle="Latest approved assessment" />
          <CardBody className="space-y-3">
            {CATEGORY_KEYS.map((k) => {
              const v = outlet.categoryScores?.[k]
              const val = v === undefined || Number.isNaN(v) ? null : v
              const target = data.kpiConfig.find((x) => x.key === k)?.target ?? 90
              return (
                <div key={k}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300">{CATEGORY_LABELS[k]}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-slate-400">target {target}%</span>
                      <span className={cn('font-semibold tabular-nums', scoreTextClass(val))}>{fmtPct(val)}</span>
                    </span>
                  </div>
                  <ProgressBar value={val} size="sm" />
                </div>
              )
            })}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Compare to" subtitle="Performance gap versus peer benchmarks" />
          <CardBody>
            <ul className="space-y-3">
              {bench.map((b) => (
                <li key={b.label} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-700 dark:text-slate-200">{b.label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{fmtPct(b.value)}</p>
                  </div>
                  <span className={cn('inline-flex items-center gap-1 text-sm font-semibold tabular-nums', b.gap === null ? 'text-slate-400' : b.gap >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                    {b.gap === null ? <Minus className="h-3.5 w-3.5" /> : b.gap >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                    {fmtDelta(b.gap, 1, ' pts')}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 dark:bg-navy-800/60 p-3 text-xs text-slate-600 dark:text-slate-300">
              <Trophy className="h-4 w-4 text-amber-500" aria-hidden />
              {outlet.rank && outlet.rank <= 5 ? 'Top-5 performer in the portfolio.' : pct !== null && pct < 20 ? 'Bottom quintile — prioritised for corrective action.' : 'Mid-table performer — focus on the lowest category above.'}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Location" subtitle={`${outlet.location} · ${outlet.region}`} actions={<MapPin className="h-4 w-4 text-slate-400" />} />
          <CardBody>
            <MiniMap x={outlet.mapX} y={outlet.mapY} score={outlet.overallScore} />
            <DescriptionList className="mt-4" items={[{ label: 'Brand', value: outlet.brand }, { label: 'Manager', value: outlet.manager }, { label: 'Opening hours', value: outlet.openingHours }, { label: 'Annual visits', value: `${outlet.annualVisits} (2 main audits + 2 follow-ups)` }, { label: 'Last audit', value: fmtDate(outlet.lastAudit) }, { label: 'Next audit', value: fmtDate(outlet.nextAudit) }]} />
          </CardBody>
        </Card>
      </div>

      {/* Trends */}
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="12-month score trend" subtitle="Outlet visit scores versus organisation average" height={280}>
          <TrendChart data={trendData} series={[{ key: 'Outlet', label: outlet.name.length > 24 ? 'Outlet' : outlet.name }, { key: 'Organisation', label: 'Organisation average', color: CHART_COLORS.slate, dashed: true }]} target={outlet.targetScore} yDomain={[50, 100]} />
        </ChartCard>
        <ChartCard title="Issue trend" subtitle="Findings raised per month by severity" height={280}>
          <GroupedBarChart data={issueTrend} series={[{ key: 'Critical', label: 'Critical', color: CHART_COLORS.red }, { key: 'High', label: 'High', color: CHART_COLORS.amber }, { key: 'Medium', label: 'Medium', color: CHART_COLORS.blue }]} stacked unit="" domain={[0, Math.max(3, ...issueTrend.map((r) => r.Critical + r.High + r.Medium)) + 1]} />
        </ChartCard>
      </div>

      {/* Main audit vs follow-up */}
      <div id="comparison">
        <Card tour="outlet-comparison">
          <CardHeader title="Main Audit vs Follow-Up" subtitle={comparison?.follow ? `${comparison.main.type} (${fmtDate(comparison.main.visitDate)}) compared with ${comparison.follow.type} (${fmtDate(comparison.follow.visitDate)})` : 'Follow-up not yet assessed for the latest main audit'} actions={comparison?.follow && (comparison.follow.status === 'Submitted' || comparison.follow.status === 'Under Review') ? <Badge tone="violet">Follow-up pending approval</Badge> : undefined} />
          {comparison ? (
            <CardBody>
              <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
                <div style={{ height: 280 }}>
                  <GroupedBarChart
                    data={CATEGORY_KEYS.map((k) => ({ name: CATEGORY_SHORT[k], 'Main Audit': comparison.main.categoryScores?.[k] ?? 0, 'Follow-up': comparison.follow?.categoryScores?.[k] ?? 0 }))}
                    series={[{ key: 'Main Audit', label: `${comparison.main.type} · ${fmtPct(comparison.main.score)}` }, { key: 'Follow-up', label: comparison.follow ? `${comparison.follow.type} · ${fmtPct(comparison.follow.score)}` : 'Follow-up (pending)', color: CHART_COLORS.teal }]}
                    domain={[0, 100]}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-navy-800/60 p-3 mb-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-slate-500">Overall improvement</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{fmtPct(comparison.main.score)} → {fmtPct(comparison.follow?.score)}</p>
                    </div>
                    <DeltaPill value={comparison.follow && comparison.main.score !== null && comparison.follow.score !== null ? comparison.follow.score - comparison.main.score : null} />
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-1 font-medium">Category</th>
                        <th className="py-1 text-right font-medium">Main</th>
                        <th className="py-1 text-right font-medium">Follow-up</th>
                        <th className="py-1 text-right font-medium">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CATEGORY_KEYS.map((k) => {
                        const m = comparison.main.categoryScores?.[k] ?? null
                        const f = comparison.follow?.categoryScores?.[k] ?? null
                        return (
                          <tr key={k} className="border-t border-slate-100 dark:border-navy-800">
                            <td className="py-1.5 text-slate-700 dark:text-slate-200">{CATEGORY_LABELS[k]}</td>
                            <td className="py-1.5 text-right tabular-nums">{fmtPct(m)}</td>
                            <td className="py-1.5 text-right tabular-nums">{fmtPct(f)}</td>
                            <td className="py-1.5 text-right"><DeltaPill value={m !== null && f !== null ? f - m : null} small /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardBody>
          ) : (
            <EmptyState title="No scored main audit yet" />
          )}
        </Card>
      </div>

      {/* Audit history + corrective actions */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Audit history" subtitle="All planned visits for the engagement year" />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Visit</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Shopper</th>
                  <th>Status</th>
                  <th className="text-right">Score</th>
                  <th>Risk</th>
                  <th className="text-right">Critical</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.map((v) => (
                  <tr key={v.id}>
                    <td className="font-mono text-xs">{v.code}</td>
                    <td className="whitespace-nowrap">{v.type}</td>
                    <td className="whitespace-nowrap">{fmtDate(v.visitDate ?? v.scheduledDate)}{!v.visitDate && <span className="text-slate-400"> (planned)</span>}</td>
                    <td className="whitespace-nowrap">{data.shoppers.find((s) => s.id === v.shopperId)?.name ?? '—'}</td>
                    <td><StatusBadge status={v.status} /></td>
                    <td className="text-right"><ScoreBadge score={v.score} /></td>
                    <td>{v.risk ? <RiskBadge risk={v.risk} size="xs" /> : '—'}</td>
                    <td className="text-right tabular-nums">{v.criticalCount > 0 ? <span className="font-semibold text-red-600">{v.criticalCount}</span> : '0'}</td>
                    <td className="text-right whitespace-nowrap">
                      {v.score !== null && can('reports.visit') ? (
                        <Link to={`/reports/visits/${v.id}`} className="link text-xs">Report</Link>
                      ) : can('visits.view') ? (
                        <Link to={`/operations/visits/${v.id}`} className="link text-xs">Details</Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Corrective-action progress" subtitle={`${actions.filter((a) => a.status !== 'Closed').length} open · ${actions.filter((a) => a.status === 'Closed').length} closed`} actions={<Link to={`/quality/corrective-actions?outlet=${outlet.id}`} className="text-xs link">View</Link>} />
          <ul className="divide-y divide-slate-100 dark:divide-navy-800 max-h-[420px] overflow-y-auto">
            {actions.length === 0 && <li className="px-5 py-6 text-sm text-slate-500">No corrective actions raised.</li>}
            {actions.slice(0, 8).map((a) => (
              <li key={a.id} className="px-5 py-3">
                <Link to={`/quality/corrective-actions?action=${a.id}`} className="block hover:opacity-90">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-snug">{a.title}</p>
                    <StatusBadge status={a.status} size="xs" />
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{a.code} · {a.ownerName} · target {fmtDate(a.targetDate)}</p>
                  <ProgressBar className="mt-2" size="sm" tone={a.status === 'Closed' ? 'green' : a.status === 'Overdue' ? 'red' : 'accent'} value={a.status === 'Closed' ? 100 : a.status === 'Awaiting Verification' ? 85 : a.status === 'Awaiting Evidence' ? 65 : a.status === 'In Progress' ? 45 : a.status === 'Assigned' ? 20 : a.status === 'Overdue' ? 40 : 5} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Findings + evidence */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Open findings" subtitle={`${openFindings.length} open · ${findings.length} total`} actions={<Link to={`/quality/findings?outlet=${outlet.id}`} className="text-xs link">All findings</Link>} />
          <ul className="divide-y divide-slate-100 dark:divide-navy-800">
            {openFindings.length === 0 && <li className="px-5 py-6 text-sm text-slate-500">No open findings.</li>}
            {openFindings.slice(0, 6).map((f) => (
              <li key={f.id} className="flex items-start gap-3 px-5 py-3">
                <SeverityBadge severity={f.severity} size="xs" />
                <div className="min-w-0 flex-1">
                  <Link to={`/quality/findings?finding=${f.id}`} className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100 hover:underline">{f.title}</Link>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{f.code} · {CATEGORY_LABELS[f.category]} · {fmtDate(f.createdAt)}{f.repeated ? ' · repeated' : ''}</p>
                </div>
                <StatusBadge status={f.status} size="xs" />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Evidence" subtitle="Most recent captures" actions={<Link to={`/evidence?outlet=${outlet.id}`} className="text-xs link">Evidence library</Link>} />
          <CardBody>
            {evidence.length === 0 ? (
              <EmptyState title="No evidence yet" />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {evidence.map((e) => (
                  <EvidenceCard key={e.id} evidence={e} onClick={() => setPreview(e)} meta={data.visits.find((v) => v.id === e.visitId)?.code} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <EvidencePreviewModal evidence={preview} onClose={() => setPreview(null)} context={{ outlet: outlet.name, visit: preview ? data.visits.find((v) => v.id === preview.visitId)?.code : undefined, question: preview?.questionId ? data.questions.find((q) => q.id === preview.questionId)?.text : undefined }} />
    </div>
  )
}

function DeltaPill({ value, small = false }: { value: number | null; small?: boolean }) {
  if (value === null) return <span className="text-slate-400">—</span>
  const up = value >= 0
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-md font-semibold tabular-nums', small ? 'text-xs' : 'px-2 py-1 text-sm', up ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-300' : 'text-red-700 bg-red-50 dark:bg-red-500/10 dark:text-red-300', small && 'bg-transparent dark:bg-transparent px-0')}>
      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {fmtDelta(round(value), 1, ' pts')}
    </span>
  )
}

function MiniMap({ x, y, score }: { x: number; y: number; score: number | null }) {
  const color = score === null ? '#94a3b8' : score >= 90 ? '#059669' : score >= 80 ? '#3b82f6' : score >= 70 ? '#d97706' : '#dc2626'
  return (
    <svg viewBox="0 0 100 60" className="w-full rounded-lg bg-slate-100 dark:bg-navy-800" role="img" aria-label="Approximate outlet location">
      <defs>
        <pattern id="mm-grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M10 0H0V10" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-slate-300 dark:text-navy-700" />
        </pattern>
      </defs>
      <rect width="100" height="60" fill="url(#mm-grid)" />
      <path d="M78 0 C 70 12, 74 24, 68 34 C 62 44, 70 52, 76 60 L 100 60 L 100 0 Z" className="fill-teal-100 dark:fill-teal-900/40" />
      <path d="M0 40 Q 30 34 58 46 T 100 44" fill="none" strokeWidth="1.2" className="stroke-slate-300 dark:stroke-navy-600" />
      <path d="M20 0 Q 28 30 44 60" fill="none" strokeWidth="1.2" className="stroke-slate-300 dark:stroke-navy-600" />
      <circle cx={x} cy={(y / 100) * 60} r="6" fill={color} opacity="0.25" />
      <circle cx={x} cy={(y / 100) * 60} r="2.6" fill={color} stroke="white" strokeWidth="0.8" />
    </svg>
  )
}
