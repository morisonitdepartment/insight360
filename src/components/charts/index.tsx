import type { ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@/utils/cn'
import { useTheme } from '@/contexts/ThemeContext'
import { riskFromScore } from '@/utils/format'

/** Restrained enterprise palette — navy base, brand-orange accent, amber warnings, red only for critical. */
export const CHART_COLORS = {
  navy: '#1c2d42',
  navyLight: '#6283a8',
  teal: '#f46b25',
  tealLight: '#ff9e6b',
  blue: '#3b82f6',
  amber: '#d97706',
  /** Target / reference guides. Deliberately neutral so they never read as a data series. */
  guide: '#94a3b8',
  red: '#dc2626',
  green: '#059669',
  slate: '#94a3b8',
  violet: '#7c3aed',
}

export const SERIES_COLORS = [CHART_COLORS.navy, CHART_COLORS.teal, CHART_COLORS.blue, CHART_COLORS.amber, CHART_COLORS.violet, CHART_COLORS.slate, CHART_COLORS.green]

export function scoreColor(score: number | null | undefined): string {
  const r = riskFromScore(score)
  return r === 'Excellent' ? CHART_COLORS.green : r === 'Good' ? CHART_COLORS.blue : r === 'Needs Improvement' ? CHART_COLORS.amber : r === 'Critical' ? CHART_COLORS.red : CHART_COLORS.slate
}

function useChartTheme() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  return {
    dark,
    primary: dark ? '#ff9e6b' : CHART_COLORS.navy,
    secondary: dark ? '#95acc7' : CHART_COLORS.teal,
    axis: dark ? '#94a3b8' : '#64748b',
    grid: dark ? '#1c2d42' : '#e2e8f0',
    tooltipBg: dark ? '#1c2d42' : '#ffffff',
    tooltipBorder: dark ? '#263d59' : '#e2e8f0',
    tooltipText: dark ? '#f1f5f9' : '#0f172a',
  }
}

function tooltipStyle(t: ReturnType<typeof useChartTheme>) {
  return {
    contentStyle: { background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 10, fontSize: 12, color: t.tooltipText, boxShadow: '0 8px 24px -8px rgb(15 23 42 / 0.25)' },
    labelStyle: { color: t.tooltipText, fontWeight: 600, marginBottom: 4 },
    itemStyle: { color: t.tooltipText },
  }
}

export function ChartCard({ title, subtitle, children, actions, height = 280, className, tour, footer }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode; height?: number; className?: string; tour?: string; footer?: ReactNode }) {
  return (
    <section className={cn('card flex flex-col', className)} data-tour={tour}>
      <header className="card-header">
        <div className="min-w-0">
          <h3 className="card-title">{title}</h3>
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {/* flex-basis is the explicit height so the chart keeps its size inside a stretched grid row
          (a plain `flex-1` sets flex-basis:0 and collapses ResponsiveContainer to nothing). */}
      <div className="px-3 pb-4 min-w-0" style={{ height, flex: `1 1 ${height}px` }}>
        {children}
      </div>
      {footer && <div className="border-t border-slate-100 dark:border-navy-800 px-5 py-2.5 text-xs text-slate-500 dark:text-slate-400">{footer}</div>}
    </section>
  )
}

export interface SeriesDef {
  key: string
  label: string
  color?: string
  dashed?: boolean
}

export function TrendChart({ data, series, xKey = 'label', yDomain = [50, 100], target, unit = '%', area = false, showLegend = true }: { data: object[]; series: SeriesDef[]; xKey?: string; yDomain?: [number, number]; target?: number; unit?: string; area?: boolean; showLegend?: boolean }) {
  const t = useChartTheme()
  const Chart = area ? AreaChart : LineChart
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Chart data={data} margin={{ top: 12, right: 16, left: -8, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color ?? SERIES_COLORS[i]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color ?? SERIES_COLORS[i]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={t.grid} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: t.axis }} axisLine={false} tickLine={false} />
        <YAxis domain={yDomain} tick={{ fontSize: 11, fill: t.axis }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}${unit}`} width={44} />
        <Tooltip {...tooltipStyle(t)} formatter={(v: unknown, name: unknown) => [typeof v === 'number' ? `${v.toFixed(1)}${unit}` : '—', String(name)]} />
        {showLegend && series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />}
        {target !== undefined && <ReferenceLine y={target} stroke={CHART_COLORS.guide} strokeDasharray="4 4" label={{ value: `Target ${target}${unit}`, position: 'insideTopRight', fontSize: 10, fill: CHART_COLORS.guide }} />}
        {series.map((s, i) =>
          area ? (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? (i === 0 ? t.primary : SERIES_COLORS[i])} strokeWidth={2} fill={`url(#grad-${s.key})`} dot={{ r: 2.5 }} activeDot={{ r: 5 }} connectNulls strokeDasharray={s.dashed ? '5 4' : undefined} />
          ) : (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? (i === 0 ? t.primary : SERIES_COLORS[i])} strokeWidth={2.2} dot={{ r: 2.5, strokeWidth: 0, fill: s.color ?? (i === 0 ? t.primary : SERIES_COLORS[i]) }} activeDot={{ r: 5 }} connectNulls strokeDasharray={s.dashed ? '5 4' : undefined} />
          ),
        )}
      </Chart>
    </ResponsiveContainer>
  )
}

export function RadarCompareChart({ data, series, angleKey = 'category', max = 100 }: { data: object[]; series: SeriesDef[]; angleKey?: string; max?: number }) {
  const t = useChartTheme()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} outerRadius="72%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
        <PolarGrid stroke={t.grid} />
        <PolarAngleAxis dataKey={angleKey} tick={{ fontSize: 10.5, fill: t.axis }} />
        <PolarRadiusAxis angle={90} domain={[0, max]} tick={{ fontSize: 9, fill: t.axis }} axisLine={false} tickCount={5} />
        <Tooltip {...tooltipStyle(t)} formatter={(v: unknown, name: unknown) => [typeof v === 'number' ? `${v.toFixed(1)}%` : '—', String(name)]} />
        {series.map((s, i) => (
          <Radar key={s.key} name={s.label} dataKey={s.key} stroke={s.color ?? (i === 0 ? t.primary : SERIES_COLORS[i])} fill={s.color ?? (i === 0 ? t.primary : SERIES_COLORS[i])} fillOpacity={i === 0 ? 0.28 : 0.14} strokeWidth={2} dot={{ r: 2.5 }} />
        ))}
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
      </RadarChart>
    </ResponsiveContainer>
  )
}

export function HBarChart({ data, valueKey = 'value', nameKey = 'name', colorByScore = true, domain = [0, 100], unit = '%', onBarClick, barSize = 14, labelWidth = 150 }: { data: Record<string, unknown>[]; valueKey?: string; nameKey?: string; colorByScore?: boolean; domain?: [number, number]; unit?: string; onBarClick?: (row: Record<string, unknown>) => void; barSize?: number; labelWidth?: number }) {
  const t = useChartTheme()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }} barCategoryGap={6}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={t.grid} />
        <XAxis type="number" domain={domain} tick={{ fontSize: 11, fill: t.axis }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}${unit}`} />
        <YAxis type="category" dataKey={nameKey} width={labelWidth} tick={{ fontSize: 11, fill: t.axis }} axisLine={false} tickLine={false} interval={0} />
        <Tooltip {...tooltipStyle(t)} cursor={{ fill: t.dark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)' }} formatter={(v: unknown) => [typeof v === 'number' ? `${v.toFixed(1)}${unit}` : '—', 'Score']} />
        <Bar dataKey={valueKey} radius={[0, 4, 4, 0]} barSize={barSize} onClick={onBarClick ? (d: unknown) => onBarClick((d as { payload: Record<string, unknown> }).payload) : undefined} cursor={onBarClick ? 'pointer' : undefined} label={{ position: 'right', fontSize: 10.5, fill: t.axis, formatter: (v: unknown) => (typeof v === 'number' ? `${v.toFixed(1)}` : '') }}>
          {data.map((d, i) => (
            <Cell key={i} fill={colorByScore ? scoreColor(d[valueKey] as number) : t.primary} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function GroupedBarChart({ data, series, xKey = 'name', domain = [0, 100], unit = '%', stacked = false, showLegend = true, horizontal = false }: { data: object[]; series: SeriesDef[]; xKey?: string; domain?: [number, number]; unit?: string; stacked?: boolean; showLegend?: boolean; horizontal?: boolean }) {
  const t = useChartTheme()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 12, right: 12, left: horizontal ? 8 : -8, bottom: 0 }} barCategoryGap={horizontal ? 8 : '22%'} barGap={3}>
        <CartesianGrid strokeDasharray="3 3" vertical={horizontal} horizontal={!horizontal} stroke={t.grid} />
        {horizontal ? (
          <>
            <XAxis type="number" domain={domain} tick={{ fontSize: 11, fill: t.axis }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}${unit}`} />
            <YAxis type="category" dataKey={xKey} width={130} tick={{ fontSize: 11, fill: t.axis }} axisLine={false} tickLine={false} interval={0} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: t.axis }} axisLine={false} tickLine={false} interval={0} />
            <YAxis domain={domain} tick={{ fontSize: 11, fill: t.axis }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}${unit}`} width={44} />
          </>
        )}
        <Tooltip {...tooltipStyle(t)} cursor={{ fill: t.dark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.04)' }} formatter={(v: unknown, name: unknown) => [typeof v === 'number' ? `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}` : '—', String(name)]} />
        {showLegend && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId={stacked ? 'a' : undefined} fill={s.color ?? (i === 0 ? t.primary : i === 1 ? t.secondary : SERIES_COLORS[i])} radius={stacked ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} barSize={horizontal ? 10 : undefined} maxBarSize={36} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Donut / radial progress rendered with pure SVG for crispness and accessibility. */
export function DonutChart({ value, max = 100, label, sublabel, size = 168, segments, thickness = 14 }: { value: number; max?: number; label: ReactNode; sublabel?: ReactNode; size?: number; segments?: { value: number; color: string; label: string }[]; thickness?: number }) {
  const t = useChartTheme()
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, value / max))
  let offset = 0
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(pct * 100)}% ${typeof label === 'string' ? label : ''}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={t.grid} strokeWidth={thickness} />
        {segments ? (
          segments.map((s, i) => {
            const frac = Math.max(0, Math.min(1, s.value / max))
            const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness} strokeDasharray={`${frac * c} ${c}`} strokeDashoffset={-offset * c} transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeLinecap="butt" />
            offset += frac
            return el
          })
        ) : (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={t.primary} strokeWidth={thickness} strokeDasharray={`${pct * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeLinecap="round" />
        )}
        <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-900 dark:fill-white" style={{ fontSize: size * 0.17, fontWeight: 700 }}>
          {label}
        </text>
        {sublabel && (
          <text x="50%" y="63%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-500 dark:fill-slate-400" style={{ fontSize: size * 0.07 }}>
            {sublabel}
          </text>
        )}
      </svg>
      {segments && (
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
          {segments.map((s, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
              {s.label} <span className="tabular-nums font-medium">{s.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function heatColor(v: number | null | undefined, dark = false): string {
  if (v === null || v === undefined || Number.isNaN(v)) return dark ? '#1c2d42' : '#f1f5f9'
  if (v >= 90) return dark ? 'rgba(5,150,105,0.55)' : '#a7f3d0'
  if (v >= 80) return dark ? 'rgba(59,130,246,0.45)' : '#bfdbfe'
  if (v >= 70) return dark ? 'rgba(217,119,6,0.5)' : '#fde68a'
  return dark ? 'rgba(220,38,38,0.5)' : '#fecaca'
}

export function Heatmap({ rows, columns, onRowClick, maxHeight = 420 }: { rows: { id: string; label: string; sub?: string; values: (number | null)[] }[]; columns: string[]; onRowClick?: (id: string) => void; maxHeight?: number }) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  return (
    <div className="table-wrap" style={{ maxHeight, overflowY: 'auto' }}>
      <table className="w-full text-xs border-separate border-spacing-0.5">
        <thead className="sticky top-0 z-10 bg-white dark:bg-navy-900">
          <tr>
            <th className="text-left font-semibold text-slate-500 dark:text-slate-400 px-2 py-1.5 min-w-[160px]">Outlet</th>
            {columns.map((c) => (
              <th key={c} className="font-semibold text-slate-500 dark:text-slate-400 px-1 py-1.5 text-center min-w-[64px]">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={cn(onRowClick && 'cursor-pointer hover:opacity-90')} onClick={onRowClick ? () => onRowClick(r.id) : undefined}>
              <td className="px-2 py-1 text-slate-700 dark:text-slate-200 whitespace-nowrap">
                <span className="font-medium">{r.label}</span>
                {r.sub && <span className="ml-1 text-[10px] text-slate-400">{r.sub}</span>}
              </td>
              {r.values.map((v, i) => (
                <td key={i} className="text-center tabular-nums rounded px-1 py-1 font-medium text-slate-800 dark:text-slate-100" style={{ background: heatColor(v, dark) }} title={`${columns[i]}: ${v === null ? 'n/a' : `${v.toFixed(1)}%`}`}>
                  {v === null ? '—' : v.toFixed(0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function HeatLegend() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const items: [string, number][] = [
    ['≥ 90 Excellent', 95],
    ['80–89 Good', 85],
    ['70–79 Needs improvement', 75],
    ['< 70 Critical', 60],
  ]
  return (
    <ul className="flex flex-wrap gap-3 text-[11px] text-slate-500 dark:text-slate-400">
      {items.map(([l, v]) => (
        <li key={l} className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ background: heatColor(v, dark) }} aria-hidden /> {l}
        </li>
      ))}
    </ul>
  )
}

export function Sparkline({ values, width = 90, height = 26, color }: { values: (number | null)[]; width?: number; height?: number; color?: string }) {
  const t = useChartTheme()
  const nums = values.map((v) => (v === null ? Number.NaN : v))
  const valid = nums.filter((n) => !Number.isNaN(n))
  if (valid.length < 2) return <span className="text-[10px] text-slate-400">—</span>
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const range = max - min || 1
  const pts = nums
    .map((v, i) => (Number.isNaN(v) ? null : `${(i / (nums.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`))
    .filter(Boolean)
    .join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={pts} fill="none" stroke={color ?? t.secondary} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
