import { useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AlertOctagon, AlertTriangle, ArrowDownRight, ArrowUpRight, Building2, CalendarClock, CheckCircle2, Download, LayoutGrid, List, Map as MapIcon, Minus, ThumbsUp, UserRound } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle } from '@/hooks'
import { logExport } from '@/services/actions'
import type { Outlet, RiskRating } from '@/types'
import { CATEGORY_KEYS, CATEGORY_SHORT } from '@/utils/scoring'
import { avg, fmtDate, fmtDelta, fmtPct, round } from '@/utils/format'
import { exportCsv } from '@/utils/export'
import { cn } from '@/utils/cn'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { Badge, RiskBadge, ScoreBadge, SegmentBadge, scoreTextClass } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { SegmentedControl } from '@/components/ui/Form'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProgressBar } from '@/components/ui/Misc'
import { EmptyState } from '@/components/ui/States'
import { FilterBar, applyFilters, matchesSearch, type FilterDef } from '@/components/ui/FilterBar'
import { CHART_COLORS, scoreColor } from '@/components/charts'

type ViewMode = 'table' | 'cards' | 'map'

const RISK_OPTIONS: (RiskRating | 'Not Assessed')[] = ['Excellent', 'Good', 'Needs Improvement', 'Critical', 'Not Assessed']

function deltaOf(o: Outlet): number | null {
  return o.overallScore !== null && o.previousScore !== null ? round(o.overallScore - o.previousScore) : null
}

/** Signed delta with directional icon — never colour-only. */
function DeltaCell({ value, suffix = ' pts' }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-slate-400">—</span>
  const neutral = Math.abs(value) < 0.05
  const Icon = neutral ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-0.5 tabular-nums font-medium', neutral ? 'text-slate-500 dark:text-slate-400' : value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {fmtDelta(value, 1, suffix)}
      <span className="sr-only">{neutral ? ' (no change)' : value > 0 ? ' (improvement)' : ' (decline)'}</span>
    </span>
  )
}

/** Compact SVG score ring used on location cards. */
function ScoreRing({ score, size = 64 }: { score: number | null; size?: number }) {
  const stroke = 6
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = score === null ? 0 : Math.max(0, Math.min(1, score / 100))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={score === null ? 'Not assessed' : `Score ${score.toFixed(1)}%`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-200 dark:stroke-navy-800" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke={scoreColor(score)} strokeDasharray={`${pct * c} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="fill-slate-900 dark:fill-white" style={{ fontSize: size * 0.24, fontWeight: 700 }}>
        {score === null ? '—' : score.toFixed(0)}
      </text>
    </svg>
  )
}

export default function OutletsPage() {
  useDocumentTitle('Outlet Performance')
  const navigate = useNavigate()
  const { can } = useAuth()
  const { scopedOutlets, dispatch } = useData()
  const [params, setParams] = useSearchParams()

  const [view, setView] = useState<ViewMode>('table')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const risk = params.get('risk')
    const init: Record<string, string> = {}
    if (risk && (RISK_OPTIONS as string[]).includes(risk)) init.risk = risk
    return init
  })

  const setFilter = (key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }))
    if (key === 'risk') {
      const next = new URLSearchParams(params)
      if (value && value !== 'all') next.set('risk', value)
      else next.delete('risk')
      setParams(next, { replace: true })
    }
  }

  const filterDefs = useMemo<FilterDef[]>(() => {
    const uniq = (get: (o: Outlet) => string) => [...new Set(scopedOutlets.map(get))].sort().map((v) => ({ value: v, label: v }))
    return [
      { key: 'segment', label: 'Segment', options: uniq((o) => o.segment) },
      { key: 'subcategory', label: 'Subcategory', options: uniq((o) => o.subcategory), allLabel: 'All subcategories' },
      { key: 'brand', label: 'Brand', options: uniq((o) => o.brand) },
      { key: 'region', label: 'Region', options: uniq((o) => o.region) },
      { key: 'risk', label: 'Risk rating', options: RISK_OPTIONS.map((r) => ({ value: r, label: r })), allLabel: 'All risk ratings' },
      { key: 'status', label: 'Status', options: uniq((o) => o.status), allLabel: 'All statuses' },
    ]
  }, [scopedOutlets])

  const rows = useMemo(() => {
    const filtered = applyFilters(scopedOutlets, filters, {
      segment: (o) => o.segment,
      subcategory: (o) => o.subcategory,
      brand: (o) => o.brand,
      region: (o) => o.region,
      risk: (o) => o.riskRating,
      status: (o) => o.status,
    })
    return matchesSearch(filtered, search, (o) => [o.name, o.code, o.brand, o.location, o.region, o.manager]).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
  }, [scopedOutlets, filters, search])

  // ── KPI strip ──
  const kpis = useMemo(() => {
    const assessed = scopedOutlets.filter((o) => o.overallScore !== null)
    const count = (r: RiskRating) => scopedOutlets.filter((o) => o.riskRating === r).length
    return {
      assessed: assessed.length,
      total: scopedOutlets.length,
      average: avg(assessed.map((o) => o.overallScore)),
      targetAvg: avg(scopedOutlets.map((o) => o.targetScore)),
      excellent: count('Excellent'),
      good: count('Good'),
      needs: count('Needs Improvement'),
      critical: count('Critical'),
      openIssues: scopedOutlets.reduce((a, o) => a + o.openIssues, 0),
      criticalIssues: scopedOutlets.reduce((a, o) => a + o.criticalFindings, 0),
    }
  }, [scopedOutlets])

  const openDetail = (o: Outlet) => navigate(`/performance/outlets/${o.id}`)

  const handleExport = async () => {
    const csvRows = rows.map((o) => ({
      Rank: o.rank ?? '',
      Code: o.code,
      Outlet: o.name,
      Brand: o.brand,
      Segment: o.segment,
      Subcategory: o.subcategory,
      Region: o.region,
      Location: o.location,
      Manager: o.manager,
      Score: o.overallScore ?? '',
      'Previous score': o.previousScore ?? '',
      Delta: deltaOf(o) ?? '',
      Target: o.targetScore,
      'Risk rating': o.riskRating,
      'Main audits': o.mainAuditsCompleted,
      'Follow-ups': o.followUpsCompleted,
      'Open issues': o.openIssues,
      'Critical findings': o.criticalFindings,
      'Last audit': o.lastAudit ?? '',
      'Next audit': o.nextAudit ?? '',
      Status: o.status,
    }))
    try {
      exportCsv(csvRows, 'outlet-performance')
      await dispatch((d, ctx) => logExport(d, ctx, 'Outlet performance', 'CSV'))
      toast.success(`Exported ${csvRows.length} outlets to CSV`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    }
  }

  const columns: Column<Outlet>[] = [
    { key: 'rank', header: '#', width: '52px', align: 'center', sortValue: (o) => o.rank ?? 999, render: (o) => <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-200">{o.rank ?? '—'}</span> },
    {
      key: 'name',
      header: 'Outlet',
      sortValue: (o) => o.name,
      render: (o) => (
        <div className="min-w-[180px]">
          <p className="font-medium text-slate-900 dark:text-white">{o.name}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-mono">{o.code}</span> · {o.brand}
          </p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortValue: (o) => `${o.segment} ${o.subcategory}`,
      render: (o) => (
        <div className="flex flex-col items-start gap-1">
          <SegmentBadge segment={o.segment} size="xs" />
          <span className="text-xs text-slate-600 dark:text-slate-300">{o.subcategory}</span>
        </div>
      ),
    },
    {
      key: 'region',
      header: 'Region / Location',
      sortValue: (o) => `${o.region} ${o.location}`,
      render: (o) => (
        <div>
          <p className="text-slate-800 dark:text-slate-200">{o.region}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{o.location}</p>
        </div>
      ),
    },
    { key: 'manager', header: 'Manager', sortValue: (o) => o.manager, render: (o) => <span className="whitespace-nowrap text-slate-700 dark:text-slate-300">{o.manager}</span> },
    { key: 'score', header: 'Score', align: 'center', sortValue: (o) => o.overallScore, render: (o) => <ScoreBadge score={o.overallScore} /> },
    { key: 'delta', header: 'Δ vs previous', align: 'center', sortValue: (o) => deltaOf(o), render: (o) => <DeltaCell value={deltaOf(o)} /> },
    {
      key: 'target',
      header: 'Target',
      align: 'center',
      sortValue: (o) => o.targetScore,
      render: (o) => (
        <span className="tabular-nums text-slate-700 dark:text-slate-300">
          {o.targetScore}%
          {o.overallScore !== null && <span className={cn('ml-1 text-[11px]', o.overallScore >= o.targetScore ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>({fmtDelta(o.overallScore - o.targetScore)})</span>}
        </span>
      ),
    },
    { key: 'risk', header: 'Risk', sortValue: (o) => RISK_OPTIONS.indexOf(o.riskRating), render: (o) => <RiskBadge risk={o.riskRating} /> },
    {
      key: 'visits',
      header: 'Visits',
      sortValue: (o) => o.mainAuditsCompleted + o.followUpsCompleted,
      render: (o) => {
        const done = o.mainAuditsCompleted + o.followUpsCompleted
        return (
          <div className="min-w-[96px]">
            <p className="text-xs tabular-nums text-slate-700 dark:text-slate-300">
              {done}/{o.annualVisits} <span className="text-slate-400">({o.mainAuditsCompleted} MA · {o.followUpsCompleted} FU)</span>
            </p>
            <ProgressBar value={done} max={o.annualVisits} tone="accent" size="sm" label={`${done} of ${o.annualVisits} visits completed`} className="mt-1" />
          </div>
        )
      },
    },
    {
      key: 'openIssues',
      header: 'Open issues',
      align: 'center',
      sortValue: (o) => o.openIssues,
      render: (o) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="tabular-nums font-medium text-slate-800 dark:text-slate-100">{o.openIssues}</span>
          {o.criticalFindings > 0 && (
            <Badge tone="red" icon={AlertOctagon} size="xs">
              {o.criticalFindings} critical
            </Badge>
          )}
        </span>
      ),
    },
    { key: 'lastAudit', header: 'Last audit', sortValue: (o) => o.lastAudit, render: (o) => <span className="whitespace-nowrap text-slate-600 dark:text-slate-300">{fmtDate(o.lastAudit)}</span> },
    { key: 'nextAudit', header: 'Next audit', sortValue: (o) => o.nextAudit, render: (o) => <span className="whitespace-nowrap text-slate-600 dark:text-slate-300">{fmtDate(o.nextAudit)}</span> },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Outlet Performance"
        subtitle={`${scopedOutlets.length}-outlet portfolio ranked by latest approved score`}
        actions={
          <>
            <SegmentedControl<ViewMode>
              ariaLabel="View mode"
              value={view}
              onChange={setView}
              options={[
                { value: 'table', label: <span className="inline-flex items-center gap-1"><List className="h-3.5 w-3.5" aria-hidden /> Table</span> },
                { value: 'cards', label: <span className="inline-flex items-center gap-1"><LayoutGrid className="h-3.5 w-3.5" aria-hidden /> Cards</span> },
                { value: 'map', label: <span className="inline-flex items-center gap-1"><MapIcon className="h-3.5 w-3.5" aria-hidden /> Map</span> },
              ]}
            />
            {can('reports.export') && (
              <button type="button" className="btn-secondary btn-sm" onClick={() => void handleExport()} disabled={!rows.length}>
                <Download className="h-3.5 w-3.5" aria-hidden /> Export CSV
              </button>
            )}
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <KpiCard compact label="Outlets assessed" value={`${kpis.assessed}/${kpis.total}`} sub="Latest approved visit" icon={Building2} />
        <KpiCard compact label="Portfolio average" value={fmtPct(kpis.average)} sub={`Mean target ${fmtPct(kpis.targetAvg, 0)}`} icon={ThumbsUp} tone="accent" />
        <KpiCard compact label="Excellent" value={kpis.excellent} sub="≥ 90%" icon={CheckCircle2} tone="good" onClick={() => setFilter('risk', 'Excellent')} />
        <KpiCard compact label="Good" value={kpis.good} sub="80 – 89.9%" icon={ThumbsUp} tone="default" onClick={() => setFilter('risk', 'Good')} />
        <KpiCard compact label="Needs improvement" value={kpis.needs} sub="70 – 79.9%" icon={AlertTriangle} tone="warn" onClick={() => setFilter('risk', 'Needs Improvement')} />
        <KpiCard compact label="Critical" value={kpis.critical} sub="< 70% or open critical" icon={AlertOctagon} tone="critical" onClick={() => setFilter('risk', 'Critical')} />
        <KpiCard compact label="Open issues" value={kpis.openIssues} sub={`${kpis.criticalIssues} critical`} icon={AlertTriangle} tone={kpis.criticalIssues > 0 ? 'critical' : 'default'} />
      </div>

      <FilterBar search={search} onSearch={setSearch} searchPlaceholder="Search name, code, brand, location…" filters={filterDefs} values={filters} onChange={setFilter} onReset={() => { setFilters({}); setSearch(''); const next = new URLSearchParams(params); next.delete('risk'); setParams(next, { replace: true }) }} resultCount={rows.length} />

      {view === 'table' && (
        <Card tour="outlet-table">
          <CardHeader title="Ranked outlets" subtitle="Click a row to open the outlet profile. Sort any column." />
          <DataTable columns={columns} rows={rows} rowKey={(o) => o.id} onRowClick={openDetail} pageSize={0} initialSort={{ key: 'rank', dir: 'asc' }} caption="Outlet performance ranking" maxHeight="70vh" emptyTitle="No outlets match" emptyMessage="Try clearing a filter or the search term." />
        </Card>
      )}

      {view === 'cards' && (
        <div data-tour="outlet-table">
          {rows.length === 0 ? (
            <Card>
              <EmptyState title="No outlets match" message="Try clearing a filter or the search term." />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((o) => (
                <OutletCard key={o.id} outlet={o} onOpen={() => openDetail(o)} />
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'map' && <MapView outlets={rows} onOpen={openDetail} />}
    </div>
  )
}

// ───────────────────────────── Cards view ─────────────────────────────

function OutletCard({ outlet: o, onOpen }: { outlet: Outlet; onOpen: () => void }) {
  const delta = deltaOf(o)
  return (
    <article className="card flex flex-col p-5 transition-shadow hover:shadow-card-hover hover:border-teal-300 dark:hover:border-teal-700 focus-within:border-teal-400">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            {o.rank !== null && <span className="mr-1.5 rounded bg-navy-800 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-teal-600">#{o.rank}</span>}
            {o.code}
          </p>
          <h3 className="mt-1 truncate text-[15px] font-semibold text-slate-900 dark:text-white">
            <button type="button" onClick={onOpen} className="text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded">
              {o.name}
            </button>
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {o.subcategory} · {o.location}, {o.region}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <SegmentBadge segment={o.segment} size="xs" />
            <RiskBadge risk={o.riskRating} size="xs" />
          </div>
        </div>
        <ScoreRing score={o.overallScore} />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <ScoreBadge score={o.overallScore} showLabel />
        <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
          Δ <DeltaCell value={delta} />
        </span>
      </div>

      <dl className="mt-4 space-y-1.5">
        {CATEGORY_KEYS.map((k) => {
          const v = o.categoryScores && !Number.isNaN(o.categoryScores[k]) ? o.categoryScores[k] : null
          return (
            <div key={k} className="grid grid-cols-[84px_1fr_36px] items-center gap-2 text-[11px]">
              <dt className="truncate text-slate-500 dark:text-slate-400">{CATEGORY_SHORT[k]}</dt>
              <dd className="m-0">
                <ProgressBar value={v} size="sm" label={`${CATEGORY_SHORT[k]} ${v === null ? 'not assessed' : `${v.toFixed(0)}%`}`} />
              </dd>
              <dd className={cn('m-0 text-right tabular-nums font-medium', scoreTextClass(v))}>{v === null ? '—' : v.toFixed(0)}</dd>
            </div>
          )
        })}
      </dl>

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-navy-800 dark:text-slate-400">
        <p className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" aria-hidden /> Last {fmtDate(o.lastAudit)}</p>
        <p className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" aria-hidden /> Next {fmtDate(o.nextAudit)}</p>
        <p className="col-span-2 inline-flex items-center gap-1 truncate"><UserRound className="h-3 w-3" aria-hidden /> {o.manager}</p>
        {o.openIssues > 0 && (
          <p className="col-span-2 inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" aria-hidden /> {o.openIssues} open issue{o.openIssues === 1 ? '' : 's'}
            {o.criticalFindings > 0 && <Badge tone="red" icon={AlertOctagon} size="xs">{o.criticalFindings} critical</Badge>}
          </p>
        )}
      </div>
    </article>
  )
}

// ───────────────────────────── Map view ─────────────────────────────

const LEGEND: { label: string; score: number }[] = [
  { label: 'Excellent ≥ 90', score: 95 },
  { label: 'Good 80–89', score: 85 },
  { label: 'Needs improvement 70–79', score: 75 },
  { label: 'Critical < 70', score: 60 },
  { label: 'Not assessed', score: Number.NaN },
]

function MapView({ outlets, onOpen }: { outlets: Outlet[]; onOpen: (o: Outlet) => void }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = outlets.find((o) => o.id === activeId) ?? null

  const byRegion = useMemo(() => {
    const map = new Map<string, Outlet[]>()
    for (const o of outlets) map.set(o.region, [...(map.get(o.region) ?? []), o])
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [outlets])

  const onKey = (e: KeyboardEvent<SVGGElement>, o: Outlet) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(o)
    }
  }

  if (!outlets.length)
    return (
      <Card>
        <EmptyState title="No outlets match" message="Try clearing a filter or the search term." />
      </Card>
    )

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]" data-tour="outlet-table">
      <Card>
        <CardHeader title="Portfolio map" subtitle="Stylised city grid — outlet markers coloured by latest score. Hover or focus a marker for details; click to open the profile." />
        <CardBody>
          <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
            <svg viewBox="0 0 100 100" className="block h-auto w-full" role="group" aria-label="Map of outlet locations" preserveAspectRatio="xMidYMid meet">
              <defs>
                <pattern id="city-grid" width="4" height="4" patternUnits="userSpaceOnUse">
                  <path d="M4 0H0V4" fill="none" strokeWidth="0.12" className="stroke-slate-300 dark:stroke-navy-700" />
                </pattern>
                <pattern id="sea-waves" width="6" height="3" patternUnits="userSpaceOnUse">
                  <path d="M0 1.5 Q1.5 0.5 3 1.5 T6 1.5" fill="none" strokeWidth="0.2" className="stroke-teal-300/60 dark:stroke-teal-700/50" />
                </pattern>
              </defs>
              {/* Land */}
              <rect x="0" y="0" width="100" height="100" className="fill-slate-100 dark:fill-navy-900" />
              <rect x="0" y="0" width="100" height="100" fill="url(#city-grid)" />
              {/* Sea — stylised gulf coastline to the east */}
              <path d="M78 0 C 74 8, 80 14, 77 22 C 74 30, 82 34, 78 42 C 74 50, 80 58, 76 66 C 72 74, 80 82, 78 90 C 77 95, 80 98, 82 100 L 100 100 L 100 0 Z" className="fill-teal-100 dark:fill-teal-900/40" />
              <path d="M78 0 C 74 8, 80 14, 77 22 C 74 30, 82 34, 78 42 C 74 50, 80 58, 76 66 C 72 74, 80 82, 78 90 C 77 95, 80 98, 82 100 L 100 100 L 100 0 Z" fill="url(#sea-waves)" />
              <path d="M78 0 C 74 8, 80 14, 77 22 C 74 30, 82 34, 78 42 C 74 50, 80 58, 76 66 C 72 74, 80 82, 78 90 C 77 95, 80 98, 82 100" fill="none" strokeWidth="0.5" className="stroke-teal-400 dark:stroke-teal-600" />
              {/* Arterial roads */}
              <g fill="none" strokeLinecap="round" className="stroke-slate-300 dark:stroke-navy-700">
                <path d="M0 60 C 20 58, 40 62, 60 56 S 76 48, 78 44" strokeWidth="0.9" />
                <path d="M46 0 C 48 20, 50 40, 44 60 S 40 90, 42 100" strokeWidth="0.9" />
                <path d="M10 30 C 30 26, 50 34, 70 24" strokeWidth="0.6" />
                <path d="M20 80 C 40 76, 60 82, 76 70" strokeWidth="0.6" />
                <path d="M30 10 C 34 30, 28 50, 32 70" strokeWidth="0.5" />
              </g>
              {/* Region labels */}
              <g className="fill-slate-400 dark:fill-slate-500" style={{ fontSize: 2.4, fontWeight: 600, letterSpacing: 0.2 }}>
                <text x="62" y="9">LUSAIL</text>
                <text x="60" y="37">WEST BAY &amp; PEARL</text>
                <text x="43" y="66">CENTRAL DOHA</text>
                <text x="26" y="40">NORTH</text>
                <text x="20" y="90">SOUTH &amp; AL RAYYAN</text>
                <text x="86" y="52" className="fill-teal-600 dark:fill-teal-400">GULF</text>
              </g>
              {/* Markers */}
              {outlets.map((o) => {
                const isActive = activeId === o.id
                return (
                  <g key={o.id} tabIndex={0} role="button" aria-label={`${o.name}, ${o.location}: ${o.overallScore === null ? 'not assessed' : `${o.overallScore.toFixed(1)}%`}`} className="cursor-pointer outline-none" onMouseEnter={() => setActiveId(o.id)} onMouseLeave={() => setActiveId((id) => (id === o.id ? null : id))} onFocus={() => setActiveId(o.id)} onBlur={() => setActiveId((id) => (id === o.id ? null : id))} onClick={() => onOpen(o)} onKeyDown={(e) => onKey(e, o)}>
                    <title>{`${o.name} (${o.code}) — ${o.overallScore === null ? 'Not assessed' : `${o.overallScore.toFixed(1)}% · ${o.riskRating}`}`}</title>
                    {isActive && <circle cx={o.mapX} cy={o.mapY} r={3.2} fill={scoreColor(o.overallScore)} opacity={0.25} />}
                    <circle cx={o.mapX} cy={o.mapY} r={isActive ? 2 : 1.6} fill={scoreColor(o.overallScore)} strokeWidth={0.4} className="stroke-white dark:stroke-navy-900" />
                    {o.criticalFindings > 0 && <circle cx={o.mapX + 1.3} cy={o.mapY - 1.3} r={0.6} fill={CHART_COLORS.red} className="stroke-white dark:stroke-navy-900" strokeWidth={0.2} />}
                  </g>
                )
              })}
              {/* Hover / focus label */}
              {active && (
                <g pointerEvents="none">
                  {(() => {
                    const w = Math.min(44, Math.max(22, active.name.length * 1.35 + 10))
                    const x = active.mapX + w + 4 > 100 ? active.mapX - w - 3 : active.mapX + 3
                    const y = active.mapY - 8 < 0 ? active.mapY + 2 : active.mapY - 8
                    return (
                      <>
                        <rect x={x} y={y} width={w} height={7} rx={1} className="fill-white dark:fill-navy-800 stroke-slate-300 dark:stroke-navy-600" strokeWidth={0.2} />
                        <text x={x + 1.5} y={y + 2.8} className="fill-slate-900 dark:fill-white" style={{ fontSize: 2.2, fontWeight: 600 }}>{active.name}</text>
                        <text x={x + 1.5} y={y + 5.6} className="fill-slate-500 dark:fill-slate-300" style={{ fontSize: 1.9 }}>
                          {active.overallScore === null ? 'Not assessed' : `${active.overallScore.toFixed(1)}% · ${active.riskRating}`} · #{active.rank ?? '—'}
                        </text>
                      </>
                    )
                  })()}
                </g>
              )}
            </svg>
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-600 dark:text-slate-300" aria-label="Map legend">
            {LEGEND.map((l) => (
              <li key={l.label} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full ring-1 ring-white dark:ring-navy-900" style={{ background: scoreColor(l.score) }} aria-hidden /> {l.label}
              </li>
            ))}
            <li className="inline-flex items-center gap-1.5">
              <span className="relative inline-block h-2.5 w-2.5 rounded-full bg-slate-400" aria-hidden>
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full" style={{ background: CHART_COLORS.red }} />
              </span>
              Open critical finding
            </li>
          </ul>
        </CardBody>
      </Card>

      <Card className="flex flex-col">
        <CardHeader title="Outlets by region" subtitle={`${outlets.length} outlets · ${byRegion.length} regions`} />
        <div className="max-h-[560px] overflow-y-auto px-2 pb-3">
          {byRegion.map(([region, list]) => (
            <section key={region} className="mb-2">
              <h4 className="sticky top-0 z-10 flex items-center justify-between bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-navy-900 dark:text-slate-400">
                {region}
                <span className="tabular-nums font-medium normal-case tracking-normal">{fmtPct(avg(list.map((o) => o.overallScore)))}</span>
              </h4>
              <ul>
                {list
                  .slice()
                  .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
                  .map((o) => (
                    <li key={o.id}>
                      <button type="button" onClick={() => onOpen(o)} onMouseEnter={() => setActiveId(o.id)} onMouseLeave={() => setActiveId((id) => (id === o.id ? null : id))} onFocus={() => setActiveId(o.id)} className={cn('flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-xs transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:hover:bg-navy-800', activeId === o.id && 'bg-teal-50 dark:bg-teal-500/10')}>
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: scoreColor(o.overallScore) }} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-slate-800 dark:text-slate-100">{o.name}</span>
                          <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">{o.location} · {o.subcategory}</span>
                        </span>
                        <ScoreBadge score={o.overallScore} size="xs" />
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </Card>
    </div>
  )
}
