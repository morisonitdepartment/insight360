import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useNow } from '@/hooks'
import { Card, CardHeader } from '@/components/ui/Card'
import { ScoreBadge, StatusBadge } from '@/components/ui/Badge'
import { ProgressBar, Tabs, type TabItem } from '@/components/ui/Misc'
import { BrandMark } from '@/components/ui/BrandMark'
import { fmtDate, fmtDateTime } from '@/utils/format'
import { T } from '@/config/terms'
import type { Visit } from '@/types'

type Stage = 'upcoming' | 'ongoing' | 'pending' | 'overdue'

const ROWS = 8

/**
 * Every open visit, by where it stands: booked and coming up, being carried out,
 * waiting for approval, and booked but past its date without being started.
 * One card on the Overview, so whoever opens the platform sees the whole queue
 * without opening the Visits list and filtering it four ways.
 */
export function VisitPipeline() {
  const { data, scopedVisits } = useData()
  const { can } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const today = fmtDate(now, 'yyyy-MM-dd')

  const groups = useMemo(() => {
    const notStarted = (v: Visit) => v.status === 'Planned' || v.status === 'Assigned'
    return {
      upcoming: scopedVisits.filter((v) => notStarted(v) && v.scheduledDate >= today).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
      ongoing: scopedVisits.filter((v) => v.status === 'In Progress' || v.status === 'Draft' || v.status === 'Rejected').sort((a, b) => (a.submissionDeadline ?? a.scheduledDate).localeCompare(b.submissionDeadline ?? b.scheduledDate)),
      pending: scopedVisits.filter((v) => v.status === 'Submitted' || v.status === 'Under Review').sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '')),
      overdue: scopedVisits.filter((v) => notStarted(v) && v.scheduledDate < today).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
    } satisfies Record<Stage, Visit[]>
  }, [scopedVisits, today])

  const firstWithRows = (['ongoing', 'pending', 'upcoming', 'overdue'] as Stage[]).find((k) => groups[k].length) ?? 'upcoming'
  const [tab, setTab] = useState<Stage | null>(null)
  const active = tab ?? firstWithRows

  const tabs: TabItem<Stage>[] = [
    { key: 'upcoming', label: 'Upcoming', count: groups.upcoming.length },
    { key: 'ongoing', label: 'Ongoing', count: groups.ongoing.length },
    { key: 'pending', label: 'Pending approval', count: groups.pending.length },
    { key: 'overdue', label: 'Overdue to start', count: groups.overdue.length },
  ]
  const outlet = (id: string) => data.outlets.find((o) => o.id === id)
  const shopper = (id: string | null) => data.shoppers.find((s) => s.id === id)?.name
  const reviewer = (id: string | null | undefined) => data.users.find((u) => u.id === id)?.name
  const rows = groups[active]

  const empty: Record<Stage, string> = {
    upcoming: 'No visits booked for today or later.',
    ongoing: 'No visit is being carried out right now.',
    pending: 'Nothing is waiting for approval.',
    overdue: 'Every booked visit has been started on time.',
  }

  return (
    <Card className="xl:col-span-2">
      <CardHeader
        title="Visit pipeline"
        subtitle="Upcoming, ongoing and pending visits in your scope"
        actions={can('visits.view') ? <Link to="/operations/visits" className="text-xs link">All visits</Link> : undefined}
      />
      <Tabs tabs={tabs} active={active} onChange={setTab} className="px-3" />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{active === 'pending' ? 'Submitted' : active === 'ongoing' ? 'Due' : 'Scheduled'}</th>
              <th>{T.Outlet}</th>
              <th>Type</th>
              <th>{active === 'pending' ? 'Reviewer' : 'Shopper'}</th>
              <th>{active === 'ongoing' ? 'Progress' : active === 'pending' ? 'Score' : 'Status'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">{empty[active]}</td>
              </tr>
            )}
            {rows.slice(0, ROWS).map((v) => {
              const o = outlet(v.outletId)
              return (
                <tr key={v.id} className={can('visits.view') ? 'cursor-pointer' : ''} onClick={can('visits.view') ? () => navigate(`/operations/visits/${v.id}`) : undefined}>
                  <td className="whitespace-nowrap">
                    {active === 'pending' ? fmtDateTime(v.submittedAt) : active === 'ongoing' ? fmtDateTime(v.submissionDeadline) : fmtDate(v.scheduledDate)}
                    <span className="block font-mono text-[10px] text-slate-400">{v.code}</span>
                  </td>
                  <td className="max-w-[220px]">
                    <span className="flex items-center gap-2 truncate">
                      {o && <BrandMark brandName={o.brand} size="xs" />}
                      <span className="truncate">{o?.name ?? v.outletId}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap">{v.type}</td>
                  <td className="whitespace-nowrap">
                    {active === 'pending' ? reviewer(v.reviewerId) ?? <span className="text-slate-400">Any reviewer</span> : shopper(v.shopperId) ?? <span className="text-amber-600">Unassigned</span>}
                  </td>
                  <td className="whitespace-nowrap">
                    {active === 'ongoing' ? (
                      <span className="flex min-w-[110px] items-center gap-2">
                        <ProgressBar value={v.progress} tone="accent" size="sm" className="flex-1" label={`${v.code} progress`} />
                        <span className="text-xs tabular-nums text-slate-500">{v.progress}%</span>
                      </span>
                    ) : active === 'pending' ? (
                      <ScoreBadge score={v.score} size="xs" />
                    ) : (
                      <StatusBadge status={v.status} size="xs" />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length > ROWS && <p className="px-5 py-2 text-xs text-slate-500">Showing the first {ROWS} of {rows.length}.</p>}
    </Card>
  )
}
