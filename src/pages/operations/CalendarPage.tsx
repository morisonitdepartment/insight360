import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Repeat } from 'lucide-react'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import type { Visit, VisitType } from '@/types'
import { isCompleted, isFollowUp, isMainAudit } from '@/services/derive'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { FilterBar, applyFilters, type FilterDef } from '@/components/ui/FilterBar'
import { Badge, ScoreBadge, SegmentBadge, StatusBadge } from '@/components/ui/Badge'
import { SegmentedControl } from '@/components/ui/Form'
import { ProgressBar } from '@/components/ui/Misc'
import { fmtDate } from '@/utils/format'
import { cn } from '@/utils/cn'

type View = 'month' | 'year' | 'list'
const VISIT_TYPES: VisitType[] = ['Main Audit 1', 'Follow-up 1', 'Main Audit 2', 'Follow-up 2']
const VISIT_STATUSES: Visit['status'][] = ['Planned', 'Assigned', 'In Progress', 'Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Closed']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const isOverdue = (v: Visit, today: string) => v.scheduledDate < today && (v.status === 'Planned' || v.status === 'Assigned')
const isUpcoming = (v: Visit, today: string) => v.scheduledDate >= today && (v.status === 'Planned' || v.status === 'Assigned')

export default function CalendarPage() {
  useDocumentTitle('Audit calendar')
  const navigate = useNavigate()
  const now = useNow()
  const today = format(now, 'yyyy-MM-dd')
  const { data, scopedOutlets, scopedVisits } = useData()
  const outletById = useMemo(() => new Map(data.outlets.map((o) => [o.id, o])), [data.outlets])
  const shopperById = useMemo(() => new Map(data.shoppers.map((s) => [s.id, s])), [data.shoppers])

  const [view, setView] = useState<View>('month')
  const [month, setMonth] = useState(() => startOfMonth(now))
  const [filters, setFilters] = useState<Record<string, string>>({})

  const filterDefs: FilterDef[] = [
    { key: 'type', label: 'Visit type', options: VISIT_TYPES.map((t) => ({ value: t, label: t })) },
    { key: 'status', label: 'Status', options: VISIT_STATUSES.map((s) => ({ value: s, label: s })) },
    { key: 'segment', label: 'Segment', options: [{ value: 'F&B', label: 'F&B' }, { value: 'Entertainment', label: 'Entertainment' }] },
  ]
  if (view === 'list') {
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = addMonths(startOfMonth(new Date(data.organization.engagementStart)), i)
      return { value: format(m, 'yyyy-MM'), label: format(m, 'MMMM yyyy') }
    })
    filterDefs.push({ key: 'month', label: 'Month', options: months })
  }

  const visits = useMemo(
    () =>
      applyFilters(scopedVisits, filters, {
        type: (v) => v.type,
        status: (v) => v.status,
        segment: (v) => outletById.get(v.outletId)?.segment,
        month: (v) => v.scheduledDate.slice(0, 7),
      }),
    [scopedVisits, filters, outletById],
  )

  // ── Annual plan ──
  const plan = useMemo(() => {
    const perOutlet = scopedOutlets.length ? Math.round(scopedVisits.length / scopedOutlets.length) || 4 : 4
    const completed = scopedVisits.filter(isCompleted).length
    return {
      outlets: scopedOutlets.length,
      perOutlet,
      planned: scopedVisits.length,
      completed,
      main: scopedVisits.filter(isMainAudit).length,
      follow: scopedVisits.filter(isFollowUp).length,
      upcoming: scopedVisits.filter((v) => isUpcoming(v, today)).length,
      overdue: scopedVisits.filter((v) => isOverdue(v, today)).length,
    }
  }, [scopedVisits, scopedOutlets, today])

  const byDay = useMemo(() => {
    const map = new Map<string, Visit[]>()
    for (const v of visits) map.set(v.scheduledDate, [...(map.get(v.scheduledDate) ?? []), v])
    return map
  }, [visits])

  // ── Month grid ──
  const days = useMemo(() => eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) }), [month])
  const monthKey = format(month, 'yyyy-MM')
  const monthVisits = visits.filter((v) => v.scheduledDate.startsWith(monthKey))

  // ── Year cards ──
  const yearMonths = useMemo(() => {
    const start = startOfMonth(new Date(data.organization.engagementStart))
    return Array.from({ length: 12 }, (_, i) => {
      const m = addMonths(start, i)
      const key = format(m, 'yyyy-MM')
      const mv = visits.filter((v) => v.scheduledDate.startsWith(key))
      return { date: m, key, label: format(m, 'MMM yyyy'), planned: mv.length, completed: mv.filter(isCompleted).length, overdue: mv.filter((v) => isOverdue(v, today)).length, main: mv.filter(isMainAudit).length, follow: mv.filter(isFollowUp).length }
    })
  }, [visits, data.organization.engagementStart, today])

  const listColumns: Column<Visit>[] = [
    { key: 'scheduledDate', header: 'Scheduled', sortValue: (v) => v.scheduledDate, render: (v) => <span className="whitespace-nowrap tabular-nums">{fmtDate(v.scheduledDate)}</span> },
    { key: 'code', header: 'Visit', render: (v) => <span className="font-mono text-xs font-semibold">{v.code}</span> },
    {
      key: 'outlet',
      header: 'Outlet',
      sortValue: (v) => outletById.get(v.outletId)?.name,
      render: (v) => (
        <div>
          <p className="font-medium text-slate-800 dark:text-slate-100">{outletById.get(v.outletId)?.name}</p>
          <p className="text-[11px] text-slate-500">{outletById.get(v.outletId)?.brand}</p>
        </div>
      ),
    },
    { key: 'segment', header: 'Segment', sortValue: (v) => outletById.get(v.outletId)?.segment, render: (v) => <SegmentBadge segment={outletById.get(v.outletId)?.segment ?? ''} /> },
    { key: 'type', header: 'Type', render: (v) => <TypePill type={v.type} /> },
    { key: 'shopper', header: 'Shopper', sortValue: (v) => shopperById.get(v.shopperId ?? '')?.name ?? '', render: (v) => (v.shopperId ? shopperById.get(v.shopperId)?.name : <span className="text-xs italic text-slate-400">Unassigned</span>) },
    {
      key: 'status',
      header: 'Status',
      sortValue: (v) => v.status,
      render: (v) => (
        <span className="flex flex-wrap items-center gap-1">
          <StatusBadge status={v.status} />
          {isOverdue(v, today) && <Badge tone="red" icon={AlertTriangle} size="xs">Overdue</Badge>}
        </span>
      ),
    },
    { key: 'score', header: 'Score', align: 'right', sortValue: (v) => v.score, render: (v) => <ScoreBadge score={v.score} /> },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit calendar"
        subtitle={`${data.organization.engagementName} · ${fmtDate(data.organization.engagementStart, 'MMM yyyy')} – ${fmtDate(data.organization.engagementEnd, 'MMM yyyy')}`}
        actions={<SegmentedControl ariaLabel="Calendar view" size="md" value={view} onChange={setView} options={[{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }, { value: 'list', label: 'List' }]} />}
      />

      {/* Annual plan banner */}
      <section className="card overflow-hidden">
        <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="section-title">Annual plan</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
              {plan.outlets} outlets × {plan.perOutlet} visits = <span className="text-teal-700 dark:text-teal-300">{plan.planned} planned visits</span>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Two main audits and two follow-up assessments per outlet across the engagement year.</p>
            <div className="mt-3 flex items-center gap-3">
              <ProgressBar value={plan.completed} max={plan.planned || 1} tone="accent" label="Annual plan completion" className="flex-1" />
              <span className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                {plan.completed} / {plan.planned} completed
              </span>
            </div>
          </div>
          <ul className="flex flex-wrap gap-2 lg:justify-end" aria-label="Legend">
            <LegendChip swatch="bg-navy-700 dark:bg-navy-400" label="Main audits" count={plan.main} />
            <LegendChip swatch="bg-teal-500" label="Follow-ups" count={plan.follow} />
            <LegendChip icon={Clock} label="Upcoming" count={plan.upcoming} />
            <LegendChip icon={CheckCircle2} label="Completed" count={plan.completed} tone="text-emerald-700 dark:text-emerald-300" />
            <LegendChip icon={AlertTriangle} label="Overdue" count={plan.overdue} tone={plan.overdue ? 'text-red-700 dark:text-red-300' : undefined} />
          </ul>
        </div>
      </section>

      <FilterBar filters={filterDefs} values={filters} onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={() => setFilters({})} resultCount={visits.length} />

      {view === 'month' && (
        <Card>
          <CardHeader
            title={format(month, 'MMMM yyyy')}
            subtitle={`${monthVisits.length} visit${monthVisits.length === 1 ? '' : 's'} scheduled · ${monthVisits.filter(isCompleted).length} completed`}
            actions={
              <div className="flex items-center gap-1">
                <button type="button" className="btn-ghost btn-sm" onClick={() => setMonth((m) => subMonths(m, 1))} aria-label="Previous month">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setMonth(startOfMonth(now))}>
                  Today
                </button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            }
          />
          <CardBody className="!px-3">
            <div className="table-wrap">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-7 border-b border-slate-200 dark:border-navy-800" role="row">
                  {WEEKDAYS.map((d) => (
                    <div key={d} role="columnheader" className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7" role="grid" aria-label={`Visits in ${format(month, 'MMMM yyyy')}`}>
                  {days.map((day) => {
                    const key = format(day, 'yyyy-MM-dd')
                    const list = byDay.get(key) ?? []
                    const inMonth = isSameMonth(day, month)
                    const isToday = isSameDay(day, now)
                    return (
                      <div key={key} role="gridcell" aria-label={`${format(day, 'd MMMM')}: ${list.length} visits`} className={cn('min-h-[104px] border-b border-r border-slate-100 p-1.5 dark:border-navy-800/70 [&:nth-child(7n)]:border-r-0', !inMonth && 'bg-slate-50/60 dark:bg-navy-950/40')}>
                        <div className="flex items-center justify-between">
                          <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums', isToday ? 'bg-navy-800 font-semibold text-white dark:bg-teal-600' : inMonth ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-600')}>{format(day, 'd')}</span>
                          {list.length > 0 && <span className="text-[10px] text-slate-400">{list.length}</span>}
                        </div>
                        <ul className="mt-1 space-y-1">
                          {list.slice(0, 3).map((v) => (
                            <li key={v.id}>
                              <VisitPill visit={v} outletName={outletById.get(v.outletId)?.name ?? ''} overdue={isOverdue(v, today)} onClick={() => navigate(`/operations/visits/${v.id}`)} />
                            </li>
                          ))}
                          {list.length > 3 && (
                            <li>
                              <button type="button" className="w-full rounded px-1 text-left text-[10px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white" onClick={() => { setFilters((f) => ({ ...f, month: key.slice(0, 7) })); setView('list') }}>
                                +{list.length - 3} more
                              </button>
                            </li>
                          )}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {view === 'year' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {yearMonths.map((m) => {
            const pct = m.planned ? (m.completed / m.planned) * 100 : 0
            const isCurrent = m.key === format(now, 'yyyy-MM')
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  setMonth(m.date)
                  setView('month')
                }}
                className={cn('card p-4 text-left transition hover:border-teal-400 hover:shadow-card-hover dark:hover:border-teal-600', isCurrent && 'ring-2 ring-teal-500/40')}
                aria-label={`${m.label}: ${m.completed} of ${m.planned} visits completed`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{m.label}</p>
                  {isCurrent && <Badge tone="teal" size="xs">Current</Badge>}
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                  {m.completed}
                  <span className="text-sm font-normal text-slate-400"> / {m.planned}</span>
                </p>
                <ProgressBar value={pct} tone="accent" size="sm" className="mt-2" label={`${m.label} completion`} />
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-navy-700 dark:bg-navy-400" aria-hidden /> {m.main} main</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-teal-500" aria-hidden /> {m.follow} follow-up</span>
                  {m.overdue > 0 && <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-300"><AlertTriangle className="h-3 w-3" aria-hidden /> {m.overdue} overdue</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {view === 'list' && (
        <Card>
          <CardHeader title="Scheduled visits" subtitle="Sorted by scheduled date" />
          <DataTable columns={listColumns} rows={visits} rowKey={(v) => v.id} onRowClick={(v) => navigate(`/operations/visits/${v.id}`)} initialSort={{ key: 'scheduledDate', dir: 'asc' }} pageSize={20} caption="Scheduled visits" emptyTitle="No visits scheduled" emptyMessage="Adjust the filters to see more visits." />
        </Card>
      )}
    </div>
  )
}

function TypePill({ type }: { type: VisitType }) {
  const main = type.startsWith('Main')
  return (
    <Badge tone={main ? 'navy' : 'teal'} icon={main ? CalendarDays : Repeat} size="xs">
      {type}
    </Badge>
  )
}

function VisitPill({ visit, outletName, overdue, onClick }: { visit: Visit; outletName: string; overdue: boolean; onClick: () => void }) {
  const main = visit.type.startsWith('Main')
  const done = isCompleted(visit)
  const Icon = done ? CheckCircle2 : overdue ? AlertTriangle : main ? CalendarDays : Repeat
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${visit.code} · ${outletName} · ${visit.type} · ${visit.status}`}
      className={cn(
        'flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[10.5px] font-medium leading-tight transition focus-visible:ring-2',
        done
          ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20'
          : overdue
            ? 'bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20'
            : main
              ? 'bg-navy-800 text-white hover:bg-navy-700 dark:bg-navy-600 dark:hover:bg-navy-500'
              : 'bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-600/80 dark:hover:bg-teal-600',
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{outletName}</span>
    </button>
  )
}

function LegendChip({ swatch, icon: Icon, label, count, tone }: { swatch?: string; icon?: typeof Clock; label: string; count: number; tone?: string }) {
  return (
    <li className={cn('inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs dark:border-navy-700 dark:bg-navy-800', tone ?? 'text-slate-600 dark:text-slate-300')}>
      {swatch && <span className={cn('h-2.5 w-2.5 rounded-sm', swatch)} aria-hidden />}
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {label}
      <span className="font-semibold tabular-nums">{count}</span>
    </li>
  )
}
