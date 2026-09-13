import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AlertOctagon, AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Download, Info, Minus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useFilters } from '@/contexts/FilterContext'
import { useDocumentTitle, useNow } from '@/hooks'
import { generateInsights, monthlyTrend, type MonthPoint } from '@/services/analytics'
import { logExport } from '@/services/actions'
import type { CategoryKey } from '@/types'
import { CATEGORY_KEYS, CATEGORY_LABELS, CATEGORY_SHORT } from '@/utils/scoring'
import { fmtDelta, fmtPct, round } from '@/utils/format'
import { exportCsv } from '@/utils/export'
import { cn } from '@/utils/cn'
import { Card, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Field, Input, SegmentedControl } from '@/components/ui/Form'
import { PageHeader } from '@/components/ui/PageHeader'
import { AutomatedLabel } from '@/components/ui/Misc'
import { EmptyState } from '@/components/ui/States'
import { CHART_COLORS, ChartCard, GroupedBarChart, SERIES_COLORS, TrendChart } from '@/components/charts'

type PeriodKey = '1' | '3' | '6' | '12' | 'custom'
const MAX_MONTHS = 12
const TARGET = 88

const INSIGHT_IDS = ['momentum', 'speed', 'cycle']
const INSIGHT_STYLE = {
  positive: { icon: CheckCircle2, cls: 'border-emerald-200 bg-emerald-50/60 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100', iconCls: 'text-emerald-600 dark:text-emerald-400' },
  warning: { icon: AlertTriangle, cls: 'border-amber-200 bg-amber-50/60 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100', iconCls: 'text-amber-600 dark:text-amber-400' },
  critical: { icon: AlertOctagon, cls: 'border-red-200 bg-red-50/60 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100', iconCls: 'text-red-600 dark:text-red-400' },
  info: { icon: Info, cls: 'border-slate-200 bg-slate-50 text-slate-800 dark:border-navy-700 dark:bg-navy-800/60 dark:text-slate-100', iconCls: 'text-navy-500 dark:text-teal-300' },
} as const

function firstLast(points: MonthPoint[], key: keyof MonthPoint): { current: number | null; delta: number | null } {
  const vals = points.map((p) => p[key]).filter((v): v is number => typeof v === 'number' && !Number.isNaN(v))
  if (!vals.length) return { current: null, delta: null }
  const first = vals[0]
  const last = vals[vals.length - 1]
  return { current: last, delta: vals.length > 1 ? round(last - first) : null }
}

function countDomain(values: number[]): [number, number] {
  const max = Math.max(0, ...values)
  return [0, max === 0 ? 5 : Math.ceil(max * 1.2)]
}

/** Header line for a small trend card: current value + first→last delta with icon. */
function TrendHeadline({ current, delta, unit = '%' }: { current: number | null; delta: number | null; unit?: string }) {
  const neutral = delta !== null && Math.abs(delta) < 0.05
  const Icon = delta === null ? Minus : neutral ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{current === null ? '—' : `${current.toFixed(1)}${unit}`}</span>
      {delta !== null && (
        <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium tabular-nums', neutral ? 'text-slate-500' : delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
          <Icon className="h-3 w-3" aria-hidden />
          {fmtDelta(delta, 1, unit === '%' ? ' pts' : '')}
          <span className="text-slate-400 dark:text-slate-500"> first → last</span>
          <span className="sr-only">{neutral ? ' (no change)' : delta > 0 ? ' (improvement)' : ' (decline)'}</span>
        </span>
      )}
    </span>
  )
}

export default function TrendsPage() {
  useDocumentTitle('Trend Analysis')
  const now = useNow()
  const { can } = useAuth()
  const { periodMonths } = useFilters()
  const { data, scopedOutlets, scopedVisits, scopedOutletIds, dispatch } = useData()

  const [period, setPeriod] = useState<PeriodKey>(() => (['1', '3', '6', '12'].includes(String(periodMonths)) ? (String(periodMonths) as PeriodKey) : '12'))
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const scopedFindings = useMemo(() => data.findings.filter((f) => scopedOutletIds.has(f.outletId)), [data.findings, scopedOutletIds])
  const scopedActions = useMemo(() => data.correctiveActions.filter((a) => scopedOutletIds.has(a.outletId)), [data.correctiveActions, scopedOutletIds])

  const full = useMemo(() => monthlyTrend(scopedVisits, scopedFindings, scopedActions, now, MAX_MONTHS), [scopedVisits, scopedFindings, scopedActions, now])

  // Segment split (F&B vs Entertainment) computed locally from the outlet segment of each visit.
  const segmentFull = useMemo(() => {
    const seg = new Map(scopedOutlets.map((o) => [o.id, o.segment]))
    const fnb = monthlyTrend(scopedVisits.filter((v) => seg.get(v.outletId) === 'F&B'), [], [], now, MAX_MONTHS)
    const ent = monthlyTrend(scopedVisits.filter((v) => seg.get(v.outletId) === 'Entertainment'), [], [], now, MAX_MONTHS)
    return fnb.map((p, i) => ({ key: p.key, label: p.label, fnb: p.overall, ent: ent[i]?.overall ?? null }))
  }, [scopedOutlets, scopedVisits, now])

  const range = useMemo(() => {
    if (period === 'custom') {
      const lo = customFrom && customTo ? (customFrom < customTo ? customFrom : customTo) : customFrom || customTo
      const hi = customFrom && customTo ? (customFrom < customTo ? customTo : customFrom) : customFrom || customTo
      return { from: lo || full[0]?.key, to: hi || full[full.length - 1]?.key }
    }
    const n = Number(period)
    return { from: full[Math.max(0, full.length - n)]?.key, to: full[full.length - 1]?.key }
  }, [period, customFrom, customTo, full])

  const points = useMemo(() => full.filter((p) => (!range.from || p.key >= range.from) && (!range.to || p.key <= range.to)), [full, range])
  const segmentPoints = useMemo(() => segmentFull.filter((p) => (!range.from || p.key >= range.from) && (!range.to || p.key <= range.to)), [segmentFull, range])

  const insights = useMemo(() => generateInsights(data, scopedOutlets, now).filter((i) => INSIGHT_IDS.includes(i.id)), [data, scopedOutlets, now])

  const overall = firstLast(points, 'overall')
  const catCards = CATEGORY_KEYS.map((k, i) => ({ key: k, label: CATEGORY_LABELS[k], color: SERIES_COLORS[i % SERIES_COLORS.length], ...firstLast(points, k) }))

  const columns: Column<MonthPoint>[] = [
    { key: 'label', header: 'Month', sortValue: (p) => p.key, render: (p) => <span className="whitespace-nowrap font-medium text-slate-800 dark:text-slate-100">{p.label}</span> },
    { key: 'count', header: 'Visits scored', align: 'right', sortValue: (p) => p.count, render: (p) => <span className="tabular-nums">{p.count}</span> },
    { key: 'overall', header: 'Overall', align: 'right', sortValue: (p) => p.overall, render: (p) => <span className={cn('tabular-nums font-semibold', p.overall !== null && p.overall < TARGET ? 'text-amber-700 dark:text-amber-300' : 'text-slate-800 dark:text-slate-100')}>{fmtPct(p.overall)}</span> },
    ...CATEGORY_KEYS.map<Column<MonthPoint>>((k) => ({ key: k, header: CATEGORY_SHORT[k], align: 'right', sortValue: (p) => p[k], render: (p) => <span className="tabular-nums">{fmtPct(p[k])}</span> })),
    { key: 'critical', header: 'Critical findings', align: 'right', sortValue: (p) => p.critical, render: (p) => <span className={cn('tabular-nums', p.critical > 0 && 'font-semibold text-red-700 dark:text-red-300')}>{p.critical}</span> },
    { key: 'capaOpened', header: 'CAPA opened', align: 'right', sortValue: (p) => p.capaOpened, render: (p) => <span className="tabular-nums">{p.capaOpened}</span> },
    { key: 'capaClosed', header: 'CAPA closed', align: 'right', sortValue: (p) => p.capaClosed, render: (p) => <span className="tabular-nums">{p.capaClosed}</span> },
  ]

  const handleExport = async () => {
    const rows = points.map((p) => ({
      Month: p.key,
      'Visits scored': p.count,
      Overall: p.overall ?? '',
      ...Object.fromEntries(CATEGORY_KEYS.map((k) => [CATEGORY_LABELS[k], p[k] ?? ''])),
      'Critical findings': p.critical,
      'CAPA opened': p.capaOpened,
      'CAPA closed': p.capaClosed,
    }))
    try {
      exportCsv(rows, 'trend-analysis')
      await dispatch((d, ctx) => logExport(d, ctx, `Trend analysis (${range.from} to ${range.to})`, 'CSV'))
      toast.success(`Exported ${rows.length} months to CSV`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    }
  }

  const periodLabel = period === 'custom' ? `${range.from ?? '…'} → ${range.to ?? '…'}` : `last ${period} month${period === '1' ? '' : 's'}`

  return (
    <div className="space-y-5">
      <PageHeader
        title="Trend Analysis"
        subtitle={`Monthly performance across ${scopedOutlets.length} outlets · ${periodLabel}`}
        actions={
          <>
            <SegmentedControl<PeriodKey>
              ariaLabel="Period"
              value={period}
              onChange={setPeriod}
              options={[
                { value: '1', label: '1 month' },
                { value: '3', label: '3 months' },
                { value: '6', label: '6 months' },
                { value: '12', label: '12 months' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            {can('reports.export') && (
              <button type="button" className="btn-secondary btn-sm" onClick={() => void handleExport()} disabled={!points.length}>
                <Download className="h-3.5 w-3.5" aria-hidden /> Export CSV
              </button>
            )}
          </>
        }
      />

      {period === 'custom' && (
        <Card padded className="no-print">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-md">
            <Field label="From month" htmlFor="trend-from">
              <Input id="trend-from" type="month" value={customFrom} min={full[0]?.key} max={full[full.length - 1]?.key} onChange={(e) => setCustomFrom(e.target.value)} />
            </Field>
            <Field label="To month" htmlFor="trend-to" hint={`Data available ${full[0]?.label} – ${full[full.length - 1]?.label}`}>
              <Input id="trend-to" type="month" value={customTo} min={full[0]?.key} max={full[full.length - 1]?.key} onChange={(e) => setCustomTo(e.target.value)} />
            </Field>
          </div>
        </Card>
      )}

      {insights.length > 0 && (
        <section aria-label="Automated insights" className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {insights.map((i) => {
            const s = INSIGHT_STYLE[i.tone]
            const Icon = s.icon
            return (
              <div key={i.id} className={cn('flex gap-3 rounded-xl border p-4 text-sm', s.cls)}>
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', s.iconCls)} aria-hidden />
                <div className="min-w-0">
                  <div className="mb-1"><AutomatedLabel /></div>
                  <p className="leading-snug">{i.text}</p>
                  {i.link && i.link !== '/performance/trends' && (
                    <Link to={i.link} className="link mt-1 inline-block text-xs">
                      View detail →
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      )}

      {points.length === 0 ? (
        <Card>
          <EmptyState title="No months in range" message="Adjust the period or custom range to include months with scored visits." />
        </Card>
      ) : (
        <>
          <ChartCard title="Monthly overall score" subtitle={<TrendHeadline current={overall.current} delta={overall.delta} />} height={300} footer={`Target ${TARGET}% shown as dashed line · ${points.reduce((a, p) => a + p.count, 0)} visits scored in range`}>
            <TrendChart data={points} series={[{ key: 'overall', label: 'Overall score' }]} area target={TARGET} showLegend={false} />
          </ChartCard>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {catCards.map((c) => (
              <ChartCard key={c.key} title={c.label} subtitle={<TrendHeadline current={c.current} delta={c.delta} />} height={220}>
                <TrendChart data={points} series={[{ key: c.key, label: c.label, color: c.color }]} showLegend={false} />
              </ChartCard>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard title="Critical findings trend" subtitle={`${points.reduce((a, p) => a + p.critical, 0)} critical findings raised in range`} height={260}>
              <GroupedBarChart data={points} series={[{ key: 'critical', label: 'Critical findings', color: CHART_COLORS.red }]} xKey="label" unit="" domain={countDomain(points.map((p) => p.critical))} showLegend={false} />
            </ChartCard>
            <ChartCard title="Corrective action trend" subtitle={`${points.reduce((a, p) => a + p.capaOpened, 0)} opened · ${points.reduce((a, p) => a + p.capaClosed, 0)} closed in range`} height={260}>
              <GroupedBarChart data={points} series={[{ key: 'capaOpened', label: 'Opened', color: CHART_COLORS.amber }, { key: 'capaClosed', label: 'Closed', color: CHART_COLORS.teal }]} xKey="label" unit="" domain={countDomain(points.flatMap((p) => [p.capaOpened, p.capaClosed]))} />
            </ChartCard>
          </div>

          <ChartCard title="Segment trend" subtitle="Monthly overall score for F&B versus Entertainment outlets" height={280}>
            <TrendChart data={segmentPoints} series={[{ key: 'fnb', label: 'F&B', color: CHART_COLORS.teal }, { key: 'ent', label: 'Entertainment', color: CHART_COLORS.violet }]} />
          </ChartCard>

          <Card>
            <CardHeader title="Monthly detail" subtitle="Scores, findings and corrective actions per month in the selected range" />
            <DataTable columns={columns} rows={points} rowKey={(p) => p.key} pageSize={0} dense caption="Monthly trend detail" initialSort={{ key: 'label', dir: 'asc' }} />
          </Card>
        </>
      )}
    </div>
  )
}

// Ensure CategoryKey stays referenced for the typed column map above under verbatimModuleSyntax.
export type { CategoryKey as _TrendCategoryKey }
