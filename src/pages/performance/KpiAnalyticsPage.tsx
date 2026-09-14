import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Gauge, ShieldCheck, ShoppingBag, Sparkles, Timer, type LucideIcon } from 'lucide-react'
import { useData } from '@/contexts/DataContext'
import { useFilters } from '@/contexts/FilterContext'
import { useDocumentTitle, useNow } from '@/hooks'
import { categoryAverages, heatmapRows, kpiSummary, monthlyTrend, segmentComparison } from '@/services/analytics'
import type { CategoryKey } from '@/types'
import { CATEGORY_KEYS, CATEGORY_LABELS, CATEGORY_SHORT } from '@/utils/scoring'
import { avg, fmtPct, round } from '@/utils/format'
import { cn } from '@/utils/cn'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { Badge, ScoreBadge, scoreTextClass } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProgressBar } from '@/components/ui/Misc'
import { CHART_COLORS, ChartCard, DonutChart, GroupedBarChart, HeatLegend, Heatmap, SERIES_COLORS, TrendChart } from '@/components/charts'

const KPI_ICONS: Record<CategoryKey, LucideIcon> = {
  customer_experience: Sparkles,
  service_speed: Timer,
  operational_compliance: ShieldCheck,
  product_environment: Gauge,
  upselling_sales: ShoppingBag,
  safety_entertainment: Activity,
}

interface QuestionRow {
  key: string
  text: string
  code: string
  category: CategoryKey | null
  avg: number
  count: number
}

export default function KpiAnalyticsPage() {
  useDocumentTitle('KPI Analytics')
  const navigate = useNavigate()
  const now = useNow()
  const { periodMonths } = useFilters()
  const { data, scopedOutlets, scopedVisits, scopedOutletIds } = useData()

  const summary = useMemo(() => kpiSummary(data, scopedOutlets), [data, scopedOutlets])
  const averages = useMemo(() => categoryAverages(scopedOutlets), [scopedOutlets])
  const avgByKey = useMemo(() => Object.fromEntries(averages.map((a) => [a.key, a.value])) as Record<CategoryKey, number | null>, [averages])

  const kpiConfig = useMemo(() => [...data.kpiConfig].sort((a, b) => CATEGORY_KEYS.indexOf(a.key) - CATEGORY_KEYS.indexOf(b.key)), [data.kpiConfig])

  const scopedFindings = useMemo(() => data.findings.filter((f) => scopedOutletIds.has(f.outletId)), [data.findings, scopedOutletIds])
  const scopedActions = useMemo(() => data.correctiveActions.filter((a) => scopedOutletIds.has(a.outletId)), [data.correctiveActions, scopedOutletIds])
  const trend = useMemo(() => monthlyTrend(scopedVisits, scopedFindings, scopedActions, now, periodMonths), [scopedVisits, scopedFindings, scopedActions, now, periodMonths])

  const vsTarget = useMemo(() => kpiConfig.map((k) => ({ name: CATEGORY_SHORT[k.key], full: k.name, Actual: avgByKey[k.key] ?? 0, Target: k.target })), [kpiConfig, avgByKey])

  const heat = useMemo(() => heatmapRows(scopedOutlets).map((r) => ({ id: r.outletId, label: r.name, sub: r.code, values: CATEGORY_KEYS.map((k) => r[k]) })), [scopedOutlets])

  const segments = useMemo(() => segmentComparison(scopedOutlets), [scopedOutlets])
  const segmentChart = useMemo(() => CATEGORY_KEYS.map((k) => ({ name: CATEGORY_SHORT[k], 'F&B': segments[0][k] ?? 0, Entertainment: segments[1][k] ?? 0 })), [segments])

  const totalWeight = kpiConfig.reduce((a, k) => a + k.weight, 0)
  const weightSegments = kpiConfig.map((k, i) => ({ value: k.weight, color: SERIES_COLORS[i % SERIES_COLORS.length], label: CATEGORY_SHORT[k.key] }))

  // ── Lowest performing questions (scored answers across scoped visits) ──
  const lowestQuestions = useMemo<QuestionRow[]>(() => {
    const visitIds = new Set(scopedVisits.map((v) => v.id))
    const qById = new Map(data.questions.map((q) => [q.id, q]))
    const sectionCat = new Map(data.sections.map((s) => [s.id, s.category]))
    const acc = new Map<string, { text: string; code: string; category: CategoryKey | null; sum: number; n: number }>()
    for (const a of data.answers) {
      if (a.score === null || !visitIds.has(a.visitId)) continue
      const q = qById.get(a.questionId)
      if (!q) continue
      const cur = acc.get(q.text) ?? { text: q.text, code: q.code, category: sectionCat.get(q.sectionId) ?? null, sum: 0, n: 0 }
      cur.sum += a.score
      cur.n++
      acc.set(q.text, cur)
    }
    return [...acc.entries()]
      .map(([key, r]) => ({ key, text: r.text, code: r.code, category: r.category, avg: round((r.sum / r.n) * 100), count: r.n }))
      .filter((r) => r.count >= 3)
      .sort((a, b) => a.avg - b.avg || b.count - a.count)
      .slice(0, 10)
  }, [data.answers, data.questions, data.sections, scopedVisits])

  const questionColumns: Column<QuestionRow>[] = [
    { key: 'rank', header: '#', width: '44px', align: 'center', sortable: false, render: (r) => <span className="tabular-nums text-slate-500">{lowestQuestions.indexOf(r) + 1}</span> },
    {
      key: 'text',
      header: 'Question',
      render: (r) => (
        <div className="min-w-[260px]">
          <p className="text-slate-800 dark:text-slate-100">{r.text}</p>
          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{r.code}</p>
        </div>
      ),
    },
    { key: 'category', header: 'Category', sortValue: (r) => r.category ?? '', render: (r) => (r.category ? <Badge tone="navy">{CATEGORY_LABELS[r.category]}</Badge> : <span className="text-slate-400">—</span>) },
    {
      key: 'avg',
      header: 'Avg score',
      align: 'right',
      sortValue: (r) => r.avg,
      render: (r) => (
        <div className="flex min-w-[140px] items-center justify-end gap-2">
          <ProgressBar value={r.avg} size="sm" className="w-20" label={`Average ${r.avg.toFixed(1)}%`} />
          <span className={cn('tabular-nums font-semibold', scoreTextClass(r.avg))}>{r.avg.toFixed(1)}%</span>
        </div>
      ),
    },
    { key: 'count', header: 'Responses', align: 'right', sortValue: (r) => r.count, render: (r) => <span className="tabular-nums">{r.count}</span> },
  ]

  const kpiTableColumns: Column<(typeof kpiConfig)[number]>[] = [
    {
      key: 'name',
      header: 'KPI',
      render: (k) => (
        <div className="min-w-[200px]">
          <p className="inline-flex items-center gap-2 font-medium text-slate-900 dark:text-white">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES_COLORS[kpiConfig.indexOf(k) % SERIES_COLORS.length] }} aria-hidden />
            {k.name}
          </p>
          <p className="mt-0.5 max-w-md text-[11px] leading-snug text-slate-500 dark:text-slate-400">{k.description}</p>
        </div>
      ),
    },
    { key: 'current', header: 'Current', align: 'right', sortValue: (k) => avgByKey[k.key], render: (k) => <ScoreBadge score={avgByKey[k.key]} /> },
    { key: 'weight', header: 'Weight', align: 'right', sortValue: (k) => k.weight, render: (k) => <span className="tabular-nums">{k.weight}%</span> },
    { key: 'target', header: 'Target', align: 'right', sortValue: (k) => k.target, render: (k) => <span className="tabular-nums">{k.target}%</span> },
    { key: 'criticalThreshold', header: 'Critical threshold', align: 'right', sortValue: (k) => k.criticalThreshold, render: (k) => <span className="tabular-nums">{k.criticalThreshold}%</span> },
    { key: 'dataSource', header: 'Data source', render: (k) => <span className="text-xs text-slate-600 dark:text-slate-300">{k.dataSource}</span> },
    { key: 'applicableTo', header: 'Applies to', render: (k) => <span className="text-xs">{k.applicableTo === 'all' ? 'All segments' : k.applicableTo.join(', ')}</span> },
  ]

  const portfolio = avg(scopedOutlets.map((o) => o.overallScore))

  return (
    <div className="space-y-5">
      <PageHeader title="KPI Analytics" subtitle={`Six weighted KPI categories across ${scopedOutlets.length} outlets · portfolio score ${fmtPct(portfolio)} · trend over ${periodMonths} month${periodMonths === 1 ? '' : 's'}`} />

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpiConfig.map((k) => {
          const value = avgByKey[k.key]
          const tone = value === null ? 'default' : value >= k.target ? 'good' : value >= k.criticalThreshold ? 'warn' : 'critical'
          return (
            <KpiCard
              key={k.key}
              label={k.name}
              value={fmtPct(value)}
              delta={summary.categories[k.key].delta}
              deltaLabel={`vs previous visit · weight ${k.weight}% · target ${k.target}%`}
              sub={`Weight ${k.weight}% · Target ${k.target}%`}
              icon={KPI_ICONS[k.key]}
              tone={tone}
            />
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="KPI vs target" subtitle="Current portfolio average against configured target per category" height={300}>
          <GroupedBarChart data={vsTarget} series={[{ key: 'Actual', label: 'Actual' }, { key: 'Target', label: 'Target', color: CHART_COLORS.guide }]} />
        </ChartCard>
        <ChartCard title="Category trend" subtitle={`Monthly average per KPI over the last ${periodMonths} month${periodMonths === 1 ? '' : 's'}`} height={300}>
          <TrendChart data={trend} series={CATEGORY_KEYS.map((k, i) => ({ key: k, label: CATEGORY_SHORT[k], color: SERIES_COLORS[i % SERIES_COLORS.length] }))} yDomain={[50, 100]} />
        </ChartCard>
      </div>

      <Card>
        <CardHeader title="KPI performance heatmap" subtitle="Outlets ranked by overall score · click a row to open the outlet profile" actions={<HeatLegend />} />
        <CardBody>
          <Heatmap rows={heat} columns={CATEGORY_KEYS.map((k) => CATEGORY_SHORT[k])} onRowClick={(id) => navigate(`/performance/outlets/${id}`)} maxHeight={480} />
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
        <ChartCard title="Segment comparison" subtitle={`F&B (${segments[0].count} outlets, ${fmtPct(segments[0].overall)}) vs Entertainment (${segments[1].count} outlets, ${fmtPct(segments[1].overall)})`} height={320}>
          <GroupedBarChart data={segmentChart} series={[{ key: 'F&B', label: 'F&B', color: CHART_COLORS.teal }, { key: 'Entertainment', label: 'Entertainment', color: CHART_COLORS.violet }]} horizontal />
        </ChartCard>
        <ChartCard title="KPI weighting" subtitle={`Weights sum to ${totalWeight}% and drive the overall visit score`} height={320}>
          <DonutChart value={totalWeight} max={totalWeight} label={`${kpiConfig.length}`} sublabel="weighted KPIs" segments={weightSegments} size={176} />
        </ChartCard>
      </div>

      <Card>
        <CardHeader title="KPI configuration" subtitle="Definition, weighting, target and critical threshold for each category" />
        <DataTable columns={kpiTableColumns} rows={kpiConfig} rowKey={(k) => k.key} pageSize={0} dense caption="KPI configuration" />
      </Card>

      <Card>
        <CardHeader title="Lowest performing questions" subtitle="Ten questions with the lowest average score across all scored answers (minimum three responses)" />
        <DataTable columns={questionColumns} rows={lowestQuestions} rowKey={(r) => r.key} pageSize={0} dense caption="Lowest performing questions" emptyTitle="No scored answers yet" emptyMessage="Question-level analysis appears once visits have been submitted." />
      </Card>
    </div>
  )
}
