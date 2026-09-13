import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Download, GitCompareArrows, Search, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle } from '@/hooks'
import { logExport } from '@/services/actions'
import { isOpenFinding } from '@/services/derive'
import type { CategoryKey, Outlet } from '@/types'
import { CATEGORY_KEYS, CATEGORY_LABELS, CATEGORY_SHORT } from '@/utils/scoring'
import { round } from '@/utils/format'
import { exportCsv, type ExportRow } from '@/utils/export'
import { cn } from '@/utils/cn'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { RiskBadge, ScoreBadge, SegmentBadge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Form'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/States'
import { ChartCard, GroupedBarChart, RadarCompareChart, SERIES_COLORS } from '@/components/charts'

const MAX_SELECT = 5
const MIN_SELECT = 2

interface MetricRow {
  key: string
  label: string
  /** Raw comparable value per outlet id (null when unavailable) */
  value: (o: Outlet) => number | null
  /** Display cell */
  render: (o: Outlet, v: number | null) => ReactNode
  /** Plain value used in the CSV export */
  csv: (o: Outlet, v: number | null) => string | number
  lowerIsBetter?: boolean
}

const RISK_ORDER = ['Excellent', 'Good', 'Needs Improvement', 'Critical', 'Not Assessed']

export default function ComparePage() {
  useDocumentTitle('Compare Outlets')
  const navigate = useNavigate()
  const { can } = useAuth()
  const { data, scopedOutlets, scopedVisits, dispatch } = useData()
  const [params, setParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>(() => {
    const ids = (params.get('outlets') ?? '').split(',').filter(Boolean)
    const valid = new Set(scopedOutlets.map((o) => o.id))
    return ids.filter((id) => valid.has(id)).slice(0, MAX_SELECT)
  })

  // Keep the deep link in sync with the selection.
  useEffect(() => {
    const next = new URLSearchParams(params)
    if (selected.length) next.set('outlets', selected.join(','))
    else next.delete('outlets')
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const byId = useMemo(() => new Map(scopedOutlets.map((o) => [o.id, o])), [scopedOutlets])
  const chosen = useMemo(() => selected.map((id) => byId.get(id)).filter((o): o is Outlet => !!o), [selected, byId])

  const listed = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q ? scopedOutlets.filter((o) => [o.name, o.code, o.brand, o.location, o.region].some((f) => f.toLowerCase().includes(q))) : scopedOutlets
    return [...list].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
  }, [scopedOutlets, search])

  const toggle = (id: string) => {
    setSelected((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id)
      if (s.length >= MAX_SELECT) {
        toast.error(`You can compare up to ${MAX_SELECT} outlets`)
        return s
      }
      return [...s, id]
    })
  }

  // ── Derived per-outlet metrics ──
  const openFindingsByOutlet = useMemo(() => {
    const m = new Map<string, { open: number; critical: number }>()
    for (const f of data.findings) {
      if (!isOpenFinding(f)) continue
      const cur = m.get(f.outletId) ?? { open: 0, critical: 0 }
      cur.open++
      if (f.severity === 'Critical') cur.critical++
      m.set(f.outletId, cur)
    }
    return m
  }, [data.findings])

  const slaByOutlet = useMemo(() => {
    const m = new Map<string, number | null>()
    for (const o of scopedOutlets) {
      const submitted = scopedVisits.filter((v) => v.outletId === o.id && v.submittedAt && v.visitEnd)
      const within = submitted.filter((v) => v.slaStatus === 'Within SLA').length
      m.set(o.id, submitted.length ? round((within / submitted.length) * 100) : null)
    }
    return m
  }, [scopedOutlets, scopedVisits])

  const scoredCount = useMemo(() => scopedOutlets.filter((o) => o.overallScore !== null).length, [scopedOutlets])

  const catValue = (o: Outlet, k: CategoryKey): number | null => (o.categoryScores && !Number.isNaN(o.categoryScores[k]) ? round(o.categoryScores[k]) : null)

  const metrics: MetricRow[] = useMemo(
    () => [
      { key: 'overall', label: 'Overall score', value: (o) => o.overallScore, render: (o) => <ScoreBadge score={o.overallScore} />, csv: (o) => o.overallScore ?? '' },
      ...CATEGORY_KEYS.map<MetricRow>((k) => ({
        key: k,
        label: CATEGORY_LABELS[k],
        value: (o) => catValue(o, k),
        render: (_o, v) => <span className="tabular-nums">{v === null ? '—' : `${v.toFixed(1)}%`}</span>,
        csv: (_o, v) => v ?? '',
      })),
      { key: 'issues', label: 'Number of issues (open)', value: (o) => openFindingsByOutlet.get(o.id)?.open ?? 0, render: (_o, v) => <span className="tabular-nums">{v}</span>, csv: (_o, v) => v ?? 0, lowerIsBetter: true },
      { key: 'critical', label: 'Critical findings (open)', value: (o) => openFindingsByOutlet.get(o.id)?.critical ?? 0, render: (_o, v) => <span className="tabular-nums">{v}</span>, csv: (_o, v) => v ?? 0, lowerIsBetter: true },
      { key: 'sla', label: 'SLA compliance', value: (o) => slaByOutlet.get(o.id) ?? null, render: (_o, v) => <span className="tabular-nums">{v === null ? '—' : `${v.toFixed(0)}%`}</span>, csv: (_o, v) => v ?? '' },
      { key: 'rank', label: 'Rank', value: (o) => o.rank, render: (o) => <span className="tabular-nums">{o.rank === null ? '—' : `#${o.rank} of ${scoredCount}`}</span>, csv: (o) => o.rank ?? '', lowerIsBetter: true },
      { key: 'risk', label: 'Risk rating', value: (o) => RISK_ORDER.indexOf(o.riskRating), render: (o) => <RiskBadge risk={o.riskRating} />, csv: (o) => o.riskRating, lowerIsBetter: true },
    ],
    [openFindingsByOutlet, slaByOutlet, scoredCount],
  )

  const series = chosen.map((o, i) => ({ key: o.id, label: o.name, color: SERIES_COLORS[i % SERIES_COLORS.length] }))
  const radarData = CATEGORY_KEYS.map((k) => ({ category: CATEGORY_SHORT[k], full: CATEGORY_LABELS[k], ...Object.fromEntries(chosen.map((o) => [o.id, catValue(o, k) ?? 0])) }))

  const handleExport = async () => {
    const rows: ExportRow[] = metrics.map((m) => ({ Metric: m.label, ...Object.fromEntries(chosen.map((o) => [`${o.name} (${o.code})`, m.csv(o, m.value(o))])) }))
    try {
      exportCsv(rows, 'outlet-comparison')
      await dispatch((d, ctx) => logExport(d, ctx, `Outlet comparison (${chosen.map((o) => o.code).join(', ')})`, 'CSV'))
      toast.success('Comparison exported to CSV')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    }
  }

  const ready = chosen.length >= MIN_SELECT

  return (
    <div className="space-y-5">
      <PageHeader
        title="Compare Outlets"
        subtitle={`Side-by-side comparison of ${MIN_SELECT}–${MAX_SELECT} outlets across all KPI categories, issues and SLA`}
        actions={
          ready && can('reports.export') ? (
            <button type="button" className="btn-secondary btn-sm" onClick={() => void handleExport()}>
              <Download className="h-3.5 w-3.5" aria-hidden /> Export CSV
            </button>
          ) : undefined
        }
      />

      {/* Selector */}
      <Card>
        <CardHeader
          title="Select outlets"
          subtitle={`${chosen.length} of ${MAX_SELECT} selected${chosen.length < MIN_SELECT ? ` · choose at least ${MIN_SELECT}` : ''}`}
          actions={
            chosen.length > 0 && (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setSelected([])}>
                <X className="h-3.5 w-3.5" aria-hidden /> Clear
              </button>
            )
          }
        />
        <CardBody className="space-y-3">
          {chosen.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Selected outlets">
              {chosen.map((o, i) => (
                <li key={o.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2 pr-1 text-xs font-medium text-slate-700 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-200">
                  <span className="h-2 w-2 rounded-full" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} aria-hidden />
                  {o.name}
                  <button type="button" onClick={() => toggle(o.id)} className="rounded-full p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 dark:hover:bg-navy-700 dark:hover:text-white" aria-label={`Remove ${o.name}`}>
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search outlets by name, code, brand or location…" className="pl-8" aria-label="Search outlets" />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-navy-800" role="group" aria-label="Outlet checklist">
            {listed.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-slate-500">No outlets match “{search}”.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-navy-800">
                {listed.map((o) => {
                  const checked = selected.includes(o.id)
                  const disabled = !checked && selected.length >= MAX_SELECT
                  return (
                    <li key={o.id}>
                      <label className={cn('flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-navy-800/60', checked && 'bg-teal-50/70 dark:bg-teal-500/10', disabled && 'cursor-not-allowed opacity-50')}>
                        <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(o.id)} className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 dark:border-navy-600 dark:bg-navy-800" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-slate-800 dark:text-slate-100">{o.name}</span>
                          <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="font-mono">{o.code}</span> · {o.brand} · {o.location}
                          </span>
                        </span>
                        <SegmentBadge segment={o.segment} size="xs" />
                        <ScoreBadge score={o.overallScore} size="xs" />
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </CardBody>
      </Card>

      {!ready ? (
        <Card>
          <EmptyState icon={GitCompareArrows} title="Select at least two outlets to compare" message="Use the checklist above or open an outlet profile and choose “Compare”. Up to five outlets can be compared at once." />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard title="KPI radar" subtitle="Category scores from each outlet's latest approved visit" height={340}>
              <RadarCompareChart data={radarData} series={series} />
            </ChartCard>
            <ChartCard title="Category comparison" subtitle="Grouped by KPI category" height={340}>
              <GroupedBarChart data={radarData} series={series} xKey="category" />
            </ChartCard>
          </div>

          <Card>
            <CardHeader title="Performance table" subtitle="Best value per row is highlighted in teal; the weakest is shown in amber." />
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Outlet comparison metrics</caption>
                <thead>
                  <tr>
                    <th scope="col" className="min-w-[180px]">Metric</th>
                    {chosen.map((o, i) => (
                      <th key={o.id} scope="col" className="min-w-[150px]">
                        <button type="button" onClick={() => navigate(`/performance/outlets/${o.id}`)} className="inline-flex items-center gap-1.5 normal-case tracking-normal text-left hover:underline">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} aria-hidden />
                          <span>
                            <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">{o.name}</span>
                            <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400">{o.code} · {o.subcategory}</span>
                          </span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => {
                    const values = chosen.map((o) => m.value(o))
                    const nums = values.filter((v): v is number => v !== null)
                    const best = nums.length ? (m.lowerIsBetter ? Math.min(...nums) : Math.max(...nums)) : null
                    const worst = nums.length ? (m.lowerIsBetter ? Math.max(...nums) : Math.min(...nums)) : null
                    const tie = best !== null && best === worst
                    return (
                      <tr key={m.key}>
                        <th scope="row" className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-300">
                          {m.label}
                        </th>
                        {chosen.map((o, i) => {
                          const v = values[i]
                          const isBest = !tie && v !== null && v === best
                          const isWorst = !tie && v !== null && v === worst
                          return (
                            <td key={o.id} className={cn(isBest && 'bg-teal-50/70 font-semibold text-slate-900 dark:bg-teal-500/10 dark:text-white', isWorst && 'text-amber-700 dark:text-amber-300')}>
                              {m.render(o, v)}
                              {isBest && <span className="sr-only"> (best)</span>}
                              {isWorst && <span className="sr-only"> (lowest)</span>}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
