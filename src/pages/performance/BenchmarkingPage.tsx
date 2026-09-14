import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, Award, Minus, Percent, Target, TrendingDown, TrendingUp, Trophy } from 'lucide-react'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle } from '@/hooks'
import { benchmarksFor, brandScores, mainVsFollowUp, percentile, segmentComparison } from '@/services/analytics'
import { isCompleted, isScored } from '@/services/derive'
import type { CategoryKey, CategoryScores, Outlet, Visit, VisitType } from '@/types'
import { CATEGORY_KEYS, CATEGORY_LABELS, CATEGORY_SHORT, averageCategoryScores } from '@/utils/scoring'
import { fmtDelta, fmtPct, round } from '@/utils/format'
import { cn } from '@/utils/cn'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { Badge, RiskBadge, ScoreBadge, SegmentBadge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, Select } from '@/components/ui/Form'
import { PageHeader } from '@/components/ui/PageHeader'
import { Tabs } from '@/components/ui/Misc'
import { EmptyState } from '@/components/ui/States'
import { CHART_COLORS, ChartCard, GroupedBarChart } from '@/components/charts'

type TabKey = 'brand' | 'category' | 'org' | 'previous' | 'mafu' | 'segment'

const OUTLET_TABS: TabKey[] = ['brand', 'category', 'org', 'previous']

function catVal(cs: CategoryScores | null, k: CategoryKey): number | null {
  return cs && !Number.isNaN(cs[k]) ? round(cs[k]) : null
}

/** Signed gap with a directional icon (never colour-only). */
function Gap({ value, suffix = ' pts', digits = 1 }: { value: number | null; suffix?: string; digits?: number }) {
  if (value === null) return <span className="text-slate-400">—</span>
  const neutral = Math.abs(value) < 0.05
  const Icon = neutral ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-0.5 tabular-nums font-medium', neutral ? 'text-slate-500 dark:text-slate-400' : value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {fmtDelta(value, digits, suffix)}
      <span className="sr-only">{neutral ? ' (level)' : value > 0 ? ' (ahead)' : ' (behind)'}</span>
    </span>
  )
}

interface CategoryCompareRow {
  key: CategoryKey
  label: string
  outlet: number | null
  benchmark: number | null
  gap: number | null
}

interface CycleRow {
  id: string
  name: string
  code: string
  segment: Outlet['segment']
  ma1: number | null
  fu1: number | null
  d1: number | null
  ma2: number | null
  fu2: number | null
  d2: number | null
  /** Improvement % for the most recent complete MA→FU pair */
  improvementPct: number | null
}

export default function BenchmarkingPage() {
  useDocumentTitle('Benchmarking')
  const navigate = useNavigate()
  const { authorizedOutlets: scopedOutlets, authorizedVisits: scopedVisits } = useData()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<TabKey>('brand')

  const scored = useMemo(() => scopedOutlets.filter((o) => o.overallScore !== null), [scopedOutlets])
  const lowest = useMemo(() => [...scored].sort((a, b) => (a.overallScore ?? 0) - (b.overallScore ?? 0))[0] ?? null, [scored])

  const [outletId, setOutletId] = useState<string>(() => {
    const q = params.get('outlet')
    return q && scopedOutlets.some((o) => o.id === q) ? q : (lowest?.id ?? scopedOutlets[0]?.id ?? '')
  })
  useEffect(() => {
    const next = new URLSearchParams(params)
    if (outletId) next.set('outlet', outletId)
    else next.delete('outlet')
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletId])

  const outlet = useMemo(() => scopedOutlets.find((o) => o.id === outletId) ?? null, [scopedOutlets, outletId])

  // ── Headline stats for the selected outlet ──
  const benchmarks = useMemo(() => (outlet ? benchmarksFor(outlet, scopedOutlets) : []), [outlet, scopedOutlets])
  const pct = useMemo(() => (outlet ? percentile(outlet, scopedOutlets) : null), [outlet, scopedOutlets])
  const changePct = useMemo(() => {
    if (!outlet || outlet.overallScore === null || outlet.previousScore === null || outlet.previousScore === 0) return null
    return round(((outlet.overallScore - outlet.previousScore) / outlet.previousScore) * 100)
  }, [outlet])

  const previousVisit = useMemo<Visit | null>(() => {
    if (!outlet) return null
    const completed = scopedVisits.filter((v) => v.outletId === outlet.id && isCompleted(v)).sort((a, b) => (b.visitDate ?? '').localeCompare(a.visitDate ?? ''))
    return completed[1] ?? null
  }, [outlet, scopedVisits])

  const benchmarkMeta = useMemo(() => {
    if (!outlet) return null
    switch (tab) {
      case 'brand':
        return { label: `${outlet.brand} average`, cats: averageCategoryScores(scopedOutlets.filter((o) => o.brand === outlet.brand && o.id !== outlet.id).map((o) => o.categoryScores)), gap: benchmarks[0]?.gap ?? null, value: benchmarks[0]?.value ?? null, peers: scopedOutlets.filter((o) => o.brand === outlet.brand && o.id !== outlet.id).length }
      case 'category':
        return { label: `${outlet.subcategory} average`, cats: averageCategoryScores(scopedOutlets.filter((o) => o.subcategory === outlet.subcategory).map((o) => o.categoryScores)), gap: benchmarks[1]?.gap ?? null, value: benchmarks[1]?.value ?? null, peers: scopedOutlets.filter((o) => o.subcategory === outlet.subcategory).length }
      case 'org':
        return { label: 'Organisation average', cats: averageCategoryScores(scopedOutlets.map((o) => o.categoryScores)), gap: benchmarks[3]?.gap ?? null, value: benchmarks[3]?.value ?? null, peers: scopedOutlets.length }
      case 'previous':
        return { label: previousVisit ? `Previous audit (${previousVisit.type})` : 'Previous audit', cats: previousVisit?.categoryScores ?? null, gap: outlet.overallScore !== null && outlet.previousScore !== null ? round(outlet.overallScore - outlet.previousScore) : null, value: outlet.previousScore, peers: previousVisit ? 1 : 0 }
      default:
        return null
    }
  }, [tab, outlet, scopedOutlets, benchmarks, previousVisit])

  const compareRows = useMemo<CategoryCompareRow[]>(() => {
    if (!outlet || !benchmarkMeta) return []
    return CATEGORY_KEYS.map((k) => {
      const o = catVal(outlet.categoryScores, k)
      const b = benchmarkMeta.cats && !Number.isNaN(benchmarkMeta.cats[k]) ? round(benchmarkMeta.cats[k]) : null
      return { key: k, label: CATEGORY_LABELS[k], outlet: o, benchmark: b, gap: o !== null && b !== null ? round(o - b) : null }
    })
  }, [outlet, benchmarkMeta])

  const compareChart = compareRows.map((r) => ({ name: CATEGORY_SHORT[r.key], Outlet: r.outlet ?? 0, Benchmark: r.benchmark ?? 0 }))

  // ── Main audit vs follow-up ──
  const mafu = useMemo(() => mainVsFollowUp(scopedVisits), [scopedVisits])
  const mafuChart = mafu.map((r) => ({ name: r.cycle, 'Main Audit': r.mainAudit ?? 0, 'Follow-up': r.followUp ?? 0 }))

  const cycleRows = useMemo<CycleRow[]>(() => {
    const scoreOf = (outletIdX: string, t: VisitType) => {
      const v = scopedVisits.filter((x) => x.outletId === outletIdX && x.type === t && isScored(x)).sort((a, b) => (b.visitDate ?? '').localeCompare(a.visitDate ?? ''))[0]
      return v?.score ?? null
    }
    return scopedOutlets
      .map((o) => {
        const ma1 = scoreOf(o.id, 'Main Audit 1')
        const fu1 = scoreOf(o.id, 'Follow-up 1')
        const ma2 = scoreOf(o.id, 'Main Audit 2')
        const fu2 = scoreOf(o.id, 'Follow-up 2')
        const d1 = ma1 !== null && fu1 !== null ? round(fu1 - ma1) : null
        const d2 = ma2 !== null && fu2 !== null ? round(fu2 - ma2) : null
        const pair = ma2 !== null && fu2 !== null ? [ma2, fu2] : ma1 !== null && fu1 !== null ? [ma1, fu1] : null
        const improvementPct = pair && pair[0] !== 0 ? round(((pair[1] - pair[0]) / pair[0]) * 100) : null
        return { id: o.id, name: o.name, code: o.code, segment: o.segment, ma1, fu1, d1, ma2, fu2, d2, improvementPct }
      })
      .filter((r) => r.ma1 !== null || r.ma2 !== null)
  }, [scopedOutlets, scopedVisits])

  const withImprovement = cycleRows.filter((r) => r.improvementPct !== null)
  const topImprovers = [...withImprovement].sort((a, b) => (b.improvementPct ?? 0) - (a.improvementPct ?? 0)).slice(0, 5)
  const bottomRegressors = [...withImprovement].sort((a, b) => (a.improvementPct ?? 0) - (b.improvementPct ?? 0)).slice(0, 5)

  // ── Segment comparison ──
  const segments = useMemo(() => segmentComparison(scopedOutlets), [scopedOutlets])
  const segmentChart = CATEGORY_KEYS.map((k) => ({ name: CATEGORY_SHORT[k], 'F&B': segments[0][k] ?? 0, Entertainment: segments[1][k] ?? 0 }))
  const segmentIssues = useMemo(() => ({
    'F&B': { outlets: scopedOutlets.filter((o) => o.segment === 'F&B').length, open: scopedOutlets.filter((o) => o.segment === 'F&B').reduce((a, o) => a + o.openIssues, 0), critical: scopedOutlets.filter((o) => o.segment === 'F&B').reduce((a, o) => a + o.criticalFindings, 0) },
    Entertainment: { outlets: scopedOutlets.filter((o) => o.segment === 'Entertainment').length, open: scopedOutlets.filter((o) => o.segment === 'Entertainment').reduce((a, o) => a + o.openIssues, 0), critical: scopedOutlets.filter((o) => o.segment === 'Entertainment').reduce((a, o) => a + o.criticalFindings, 0) },
  }), [scopedOutlets])

  // ── Brand league table ──
  const brands = useMemo(() => brandScores(scopedOutlets).map((b, i) => ({ ...b, rank: i + 1 })), [scopedOutlets])

  const compareColumns: Column<CategoryCompareRow>[] = [
    { key: 'label', header: 'Category', render: (r) => <span className="font-medium text-slate-800 dark:text-slate-100">{r.label}</span> },
    { key: 'outlet', header: 'Outlet', align: 'right', sortValue: (r) => r.outlet, render: (r) => <ScoreBadge score={r.outlet} /> },
    { key: 'benchmark', header: 'Benchmark', align: 'right', sortValue: (r) => r.benchmark, render: (r) => <span className="tabular-nums">{fmtPct(r.benchmark)}</span> },
    { key: 'gap', header: 'Gap', align: 'right', sortValue: (r) => r.gap, render: (r) => <Gap value={r.gap} /> },
  ]

  const cycleColumns: Column<CycleRow>[] = [
    {
      key: 'name',
      header: 'Outlet',
      sortValue: (r) => r.name,
      render: (r) => (
        <div className="min-w-[160px]">
          <p className="font-medium text-slate-900 dark:text-white">{r.name}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-mono">{r.code}</span> · {r.segment}
          </p>
        </div>
      ),
    },
    { key: 'ma1', header: 'MA 1', align: 'right', sortValue: (r) => r.ma1, render: (r) => <span className="tabular-nums">{fmtPct(r.ma1)}</span> },
    { key: 'fu1', header: 'FU 1', align: 'right', sortValue: (r) => r.fu1, render: (r) => <span className="tabular-nums">{fmtPct(r.fu1)}</span> },
    { key: 'd1', header: 'Δ cycle 1', align: 'right', sortValue: (r) => r.d1, render: (r) => <Gap value={r.d1} /> },
    { key: 'ma2', header: 'MA 2', align: 'right', sortValue: (r) => r.ma2, render: (r) => <span className="tabular-nums">{fmtPct(r.ma2)}</span> },
    { key: 'fu2', header: 'FU 2', align: 'right', sortValue: (r) => r.fu2, render: (r) => <span className="tabular-nums">{fmtPct(r.fu2)}</span> },
    { key: 'd2', header: 'Δ cycle 2', align: 'right', sortValue: (r) => r.d2, render: (r) => <Gap value={r.d2} /> },
    { key: 'improvementPct', header: 'Improvement', align: 'right', sortValue: (r) => r.improvementPct, render: (r) => <Gap value={r.improvementPct} suffix="%" /> },
  ]

  const brandColumns: Column<(typeof brands)[number]>[] = [
    { key: 'rank', header: '#', width: '52px', align: 'center', sortValue: (b) => b.rank, render: (b) => <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums', b.rank === 1 ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200' : 'bg-slate-100 text-slate-700 dark:bg-navy-800 dark:text-slate-200')}>{b.rank}</span> },
    { key: 'brand', header: 'Brand', sortValue: (b) => b.brand, render: (b) => <span className="font-medium text-slate-900 dark:text-white">{b.brand}</span> },
    { key: 'segment', header: 'Segment', sortValue: (b) => b.segment, render: (b) => <SegmentBadge segment={b.segment} size="xs" /> },
    { key: 'outlets', header: 'Outlets', align: 'right', sortValue: (b) => b.outlets, render: (b) => <span className="tabular-nums">{b.outlets}</span> },
    { key: 'score', header: 'Score', align: 'right', sortValue: (b) => b.score, render: (b) => <ScoreBadge score={b.score} showLabel /> },
    { key: 'openIssues', header: 'Open issues', align: 'right', sortValue: (b) => b.openIssues, render: (b) => <span className="tabular-nums">{b.openIssues}</span> },
  ]

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'brand', label: 'Outlet vs Brand' },
    { key: 'category', label: 'Outlet vs Category' },
    { key: 'org', label: 'Outlet vs Organisation' },
    { key: 'previous', label: 'Current vs Previous Audit' },
    { key: 'mafu', label: 'Main Audit vs Follow-Up' },
    { key: 'segment', label: 'F&B vs Entertainment' },
  ]

  const isOutletTab = OUTLET_TABS.includes(tab)

  return (
    <div className="space-y-5">
      <PageHeader title="Benchmarking" subtitle="Position any outlet against its brand, category, the organisation and its own audit history" />

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {isOutletTab && (
        <>
          <Card>
            <CardBody className="pt-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(260px,360px)_1fr] lg:items-end">
                <Field label="Outlet" htmlFor="bench-outlet" hint="Defaults to the lowest-scoring outlet in your scope">
                  <Select id="bench-outlet" value={outletId} onChange={(e) => setOutletId(e.target.value)}>
                    {[...scopedOutlets].sort((a, b) => a.name.localeCompare(b.name)).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} ({o.code}) — {o.overallScore === null ? 'not assessed' : `${o.overallScore.toFixed(1)}%`}
                      </option>
                    ))}
                  </Select>
                </Field>
                {outlet && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <SegmentBadge segment={outlet.segment} size="xs" />
                    <Badge tone="navy" size="xs">{outlet.subcategory}</Badge>
                    <Badge tone="slate" size="xs">{outlet.brand}</Badge>
                    <RiskBadge risk={outlet.riskRating} size="xs" />
                    <span>{outlet.location} · {outlet.region}</span>
                    <button type="button" className="link ml-auto text-xs" onClick={() => navigate(`/performance/outlets/${outlet.id}`)}>
                      Open outlet profile →
                    </button>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

          {!outlet || outlet.overallScore === null ? (
            <Card>
              <EmptyState title="Outlet not yet assessed" message="Benchmarks are available once the outlet has an approved visit." />
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <KpiCard compact label="Rank" value={`#${outlet.rank ?? '—'} / ${scored.length}`} sub={`Score ${fmtPct(outlet.overallScore)}`} icon={Trophy} tone="accent" />
                <KpiCard compact label="Percentile" value={pct === null ? '—' : `${pct}th`} sub={pct === null ? undefined : `Outperforms ${pct}% of outlets`} icon={Percent} tone={pct !== null && pct >= 50 ? 'good' : 'warn'} />
                <KpiCard compact label={`Gap vs ${benchmarkMeta?.label ?? 'benchmark'}`} value={<Gap value={benchmarkMeta?.gap ?? null} />} sub={benchmarkMeta?.value !== null && benchmarkMeta?.value !== undefined ? `Benchmark ${fmtPct(benchmarkMeta.value)}` : 'No benchmark available'} icon={Target} tone={(benchmarkMeta?.gap ?? 0) >= 0 ? 'good' : 'warn'} />
                <KpiCard
                  compact
                  label={changePct === null ? 'Change vs previous' : changePct >= 0 ? 'Improvement' : 'Regression'}
                  value={changePct === null ? '—' : <span className="inline-flex items-center gap-1">{changePct >= 0 ? <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden /> : <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden />}{fmtDelta(changePct, 1, '%')}</span>}
                  sub={outlet.previousScore === null ? 'Single audit so far' : `${fmtPct(outlet.previousScore)} → ${fmtPct(outlet.overallScore)}`}
                  icon={Award}
                  tone={changePct === null ? 'default' : changePct >= 0 ? 'good' : 'critical'}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
                <ChartCard title={`${outlet.name} vs ${benchmarkMeta?.label ?? 'benchmark'}`} subtitle={tab === 'previous' ? 'Category scores from the latest and the preceding approved visit' : `Benchmark built from ${benchmarkMeta?.peers ?? 0} peer outlet${benchmarkMeta?.peers === 1 ? '' : 's'}`} height={320}>
                  <GroupedBarChart data={compareChart} series={[{ key: 'Outlet', label: outlet.name }, { key: 'Benchmark', label: benchmarkMeta?.label ?? 'Benchmark', color: CHART_COLORS.slate }]} />
                </ChartCard>
                <Card>
                  <CardHeader title="Category gap analysis" subtitle="Positive gap = outlet ahead of benchmark" />
                  <DataTable columns={compareColumns} rows={compareRows} rowKey={(r) => r.key} pageSize={0} dense caption="Category gap analysis" />
                </Card>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'mafu' && (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.4fr]">
            <ChartCard title="Main audit vs follow-up" subtitle={`Cycle 1: ${mafu[0].mainCount} MA / ${mafu[0].followCount} FU · Cycle 2: ${mafu[1].mainCount} MA / ${mafu[1].followCount} FU`} height={300}>
              <GroupedBarChart data={mafuChart} series={[{ key: 'Main Audit', label: 'Main Audit' }, { key: 'Follow-up', label: 'Follow-up' }]} />
            </ChartCard>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader title="Top 5 improvers" subtitle="Largest MA → FU uplift" />
                <MoverList rows={topImprovers} onOpen={(id) => navigate(`/performance/outlets/${id}`)} />
              </Card>
              <Card>
                <CardHeader title="Bottom 5 regressors" subtitle="Weakest MA → FU change" />
                <MoverList rows={bottomRegressors} onOpen={(id) => navigate(`/performance/outlets/${id}`)} />
              </Card>
            </div>
          </div>
          <Card>
            <CardHeader title="Outlet cycle deltas" subtitle="Scored main audits and follow-ups per outlet · improvement uses the most recent complete cycle · click to open the outlet" />
            <DataTable columns={cycleColumns} rows={cycleRows} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/performance/outlets/${r.id}`)} pageSize={0} dense initialSort={{ key: 'improvementPct', dir: 'desc' }} maxHeight="60vh" caption="Main audit versus follow-up per outlet" />
          </Card>
        </>
      )}

      {tab === 'segment' && (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard compact label="F&B outlets" value={segmentIssues['F&B'].outlets} sub={`${segments[0].count} assessed · ${fmtPct(segments[0].overall)}`} tone="accent" />
            <KpiCard compact label="F&B open issues" value={segmentIssues['F&B'].open} sub={`${segmentIssues['F&B'].critical} critical`} tone={segmentIssues['F&B'].critical > 0 ? 'critical' : 'default'} />
            <KpiCard compact label="Entertainment outlets" value={segmentIssues.Entertainment.outlets} sub={`${segments[1].count} assessed · ${fmtPct(segments[1].overall)}`} tone="accent" />
            <KpiCard compact label="Entertainment open issues" value={segmentIssues.Entertainment.open} sub={`${segmentIssues.Entertainment.critical} critical`} tone={segmentIssues.Entertainment.critical > 0 ? 'critical' : 'default'} />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
            <ChartCard title="F&B vs Entertainment" subtitle="Average category scores from the latest approved visit per outlet" height={320}>
              <GroupedBarChart data={segmentChart} series={[{ key: 'F&B', label: 'F&B', color: CHART_COLORS.teal }, { key: 'Entertainment', label: 'Entertainment', color: CHART_COLORS.violet }]} />
            </ChartCard>
            <Card>
              <CardHeader title="Segment gap by category" subtitle="Positive gap = F&B ahead of Entertainment" />
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">Segment comparison by category</caption>
                  <thead>
                    <tr>
                      <th scope="col">Category</th>
                      <th scope="col" className="text-right">F&B</th>
                      <th scope="col" className="text-right">Entertainment</th>
                      <th scope="col" className="text-right">Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="font-medium">
                      <td>Overall</td>
                      <td className="text-right"><ScoreBadge score={segments[0].overall} /></td>
                      <td className="text-right"><ScoreBadge score={segments[1].overall} /></td>
                      <td className="text-right"><Gap value={round(segments[0].overall - segments[1].overall)} /></td>
                    </tr>
                    {CATEGORY_KEYS.map((k) => {
                      const f = segments[0][k]
                      const e = segments[1][k]
                      return (
                        <tr key={k}>
                          <td>{CATEGORY_LABELS[k]}</td>
                          <td className="text-right tabular-nums">{fmtPct(f)}</td>
                          <td className="text-right tabular-nums">{fmtPct(e)}</td>
                          <td className="text-right"><Gap value={f !== null && e !== null ? round(f - e) : null} /></td>
                        </tr>
                      )
                    })}
                    <tr>
                      <td>Open issues</td>
                      <td className="text-right tabular-nums">{segmentIssues['F&B'].open}</td>
                      <td className="text-right tabular-nums">{segmentIssues.Entertainment.open}</td>
                      <td className="text-right"><Gap value={segmentIssues.Entertainment.open - segmentIssues['F&B'].open} suffix="" digits={0} /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader title="Brand league table" subtitle={`${brands.length} brands ranked by the mean latest score of their assessed outlets`} />
        <DataTable columns={brandColumns} rows={brands} rowKey={(b) => b.brand} pageSize={0} dense initialSort={{ key: 'rank', dir: 'asc' }} caption="Brand league table" />
      </Card>
    </div>
  )
}

function MoverList({ rows, onOpen }: { rows: CycleRow[]; onOpen: (id: string) => void }) {
  if (!rows.length) return <p className="px-5 pb-5 text-xs text-slate-500">No complete main-audit / follow-up pairs yet.</p>
  return (
    <ol className="px-3 pb-3">
      {rows.map((r, i) => (
        <li key={r.id}>
          <button type="button" onClick={() => onOpen(r.id)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:hover:bg-navy-800">
            <span className="w-4 shrink-0 tabular-nums text-slate-400">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-slate-800 dark:text-slate-100">{r.name}</span>
              <span className="block text-[10px] text-slate-500 dark:text-slate-400">{r.d2 !== null ? `Cycle 2 · ${fmtPct(r.ma2)} → ${fmtPct(r.fu2)}` : `Cycle 1 · ${fmtPct(r.ma1)} → ${fmtPct(r.fu1)}`}</span>
            </span>
            <Gap value={r.improvementPct} suffix="%" />
          </button>
        </li>
      ))}
    </ol>
  )
}
