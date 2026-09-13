import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, CalendarCheck, Mail, Phone, ShoppingBag, Star, Timer, UserMinus, UserPlus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import type { Shopper, TrainingStatus, Visit } from '@/types'
import { updateShopper, updateShopperTraining } from '@/services/actions'
import { isCompleted } from '@/services/derive'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge, ScoreBadge, SegmentBadge, StatusBadge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/States'
import { Select } from '@/components/ui/Form'
import { Avatar, DescriptionList, ProgressBar, Stat } from '@/components/ui/Misc'
import { fmtDate, fmtPct } from '@/utils/format'

const TRAINING_STATUSES: TrainingStatus[] = ['Not Started', 'In Progress', 'Completed', 'Expired']
const AVAILABILITY: Shopper['availability'][] = ['Available', 'Limited', 'Unavailable']

export default function ShopperDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const now = useNow()
  const { can } = useAuth()
  const { data, dispatch } = useData()
  const shopper = data.shoppers.find((s) => s.id === id) ?? null
  useDocumentTitle(shopper ? shopper.name : 'Shopper not found')

  const outletById = useMemo(() => new Map(data.outlets.map((o) => [o.id, o])), [data.outlets])
  const visits = useMemo(() => (shopper ? data.visits.filter((v) => v.shopperId === shopper.id).sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate)) : []), [data.visits, shopper])

  const [busy, setBusy] = useState<string | null>(null)
  const [confirmStatus, setConfirmStatus] = useState(false)

  const perf = useMemo(() => {
    const completed = visits.filter(isCompleted)
    const submitted = visits.filter((v) => v.submittedAt)
    const breaches = visits.filter((v) => v.slaStatus === 'Breached').length
    const onTime = submitted.length ? ((submitted.length - breaches) / submitted.length) * 100 : null
    const upcoming = visits.filter((v) => (v.status === 'Assigned' || v.status === 'Planned') && v.scheduledDate >= fmtDate(now, 'yyyy-MM-dd')).length
    const scored = completed.filter((v) => v.score !== null)
    const avgScore = scored.length ? scored.reduce((a, v) => a + (v.score ?? 0), 0) / scored.length : null
    return { completed: completed.length, breaches, onTime, upcoming, avgScore }
  }, [visits, now])

  const run = async (key: string, label: string, recipe: Parameters<typeof dispatch>[0]) => {
    setBusy(key)
    try {
      await dispatch(recipe)
      toast.success(label)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(null)
    }
  }

  if (!shopper) {
    return (
      <EmptyState
        title="Shopper not found"
        message="This shopper profile does not exist or has been removed."
        icon={ShoppingBag}
        action={
          <Link to="/operations/shoppers" className="btn-secondary">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to shoppers
          </Link>
        }
      />
    )
  }

  const manage = can('shoppers.manage')
  const active = shopper.status !== 'Inactive'

  const visitColumns: Column<Visit>[] = [
    { key: 'code', header: 'Visit', render: (v) => <span className="font-mono text-xs font-semibold">{v.code}</span> },
    {
      key: 'outlet',
      header: 'Outlet',
      sortValue: (v) => outletById.get(v.outletId)?.name,
      render: (v) => (
        <div className="min-w-[150px]">
          <p className="font-medium text-slate-800 dark:text-slate-100">{outletById.get(v.outletId)?.name}</p>
          <p className="text-[11px] text-slate-500">{outletById.get(v.outletId)?.segment}</p>
        </div>
      ),
    },
    { key: 'type', header: 'Type', render: (v) => <span className="whitespace-nowrap">{v.type}</span> },
    { key: 'scheduledDate', header: 'Scheduled', sortValue: (v) => v.scheduledDate, render: (v) => <span className="whitespace-nowrap tabular-nums">{fmtDate(v.scheduledDate)}</span> },
    { key: 'status', header: 'Status', render: (v) => <StatusBadge status={v.status} size="xs" /> },
    { key: 'slaStatus', header: 'SLA', render: (v) => <StatusBadge status={v.slaStatus} size="xs" /> },
    { key: 'score', header: 'Score', align: 'right', sortValue: (v) => v.score, render: (v) => <ScoreBadge score={v.score} /> },
  ]

  const trainingRows = data.trainingModules.map((m) => ({ module: m, record: shopper.training.find((t) => t.moduleId === m.id) ?? null }))
  const trainingDone = trainingRows.filter((r) => r.record?.status === 'Completed').length

  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb">
        <Link to="/operations/shoppers" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All shoppers
        </Link>
      </nav>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar name={shopper.name} size="lg" />
            <span>
              {shopper.name}
              <span className="ml-2 font-mono text-sm font-medium text-slate-500 dark:text-slate-400">{shopper.code}</span>
            </span>
          </span>
        }
        subtitle={`${shopper.profileType} · ${shopper.gender} · ${shopper.ageRange} · ${shopper.nationality} · ${shopper.experienceYears} years' experience`}
        badge={
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={shopper.status} />
            <StatusBadge status={shopper.availability} />
            <StatusBadge status={shopper.certificationStatus} />
          </span>
        }
        actions={
          manage ? (
            <>
              <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="whitespace-nowrap">Set availability</span>
                <Select
                  value={shopper.availability}
                  disabled={busy !== null}
                  aria-label="Set availability"
                  className="!w-auto !py-1.5 text-xs"
                  onChange={(e) => {
                    const availability = e.target.value as Shopper['availability']
                    void run('availability', `${shopper.name} marked ${availability}`, (d, ctx) => updateShopper(d, ctx, shopper.id, { availability }))
                  }}
                >
                  {AVAILABILITY.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
              </label>
              <button type="button" className={active ? 'btn-danger' : 'btn-primary'} disabled={busy !== null} onClick={() => setConfirmStatus(true)}>
                {active ? <UserMinus className="h-4 w-4" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
                {active ? 'Deactivate' : 'Reactivate'}
              </button>
            </>
          ) : undefined
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-5 min-w-0">
          <Card>
            <CardHeader title="Profile" />
            <CardBody>
              <DescriptionList
                columns={2}
                items={[
                  { label: 'Email', value: <a href={`mailto:${shopper.email}`} className="link inline-flex items-center gap-1 break-all"><Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />{shopper.email}</a> },
                  { label: 'Phone', value: <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" aria-hidden />{shopper.phone}</span> },
                  { label: 'Gender', value: shopper.gender },
                  { label: 'Age range', value: shopper.ageRange },
                  { label: 'Nationality', value: shopper.nationality },
                  { label: 'Languages', value: shopper.languages.join(', ') },
                  { label: 'Experience', value: `${shopper.experienceYears} years` },
                  { label: 'Profile type', value: shopper.profileType },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Scenario eligibility" subtitle="Segments and shopper persona this auditor can be deployed for" />
            <CardBody className="space-y-3">
              <div>
                <p className="section-title mb-1.5">Categories</p>
                <div className="flex flex-wrap gap-1.5">
                  {shopper.assignedCategories.map((c) => (
                    <SegmentBadge key={c} segment={c} size="md" />
                  ))}
                </div>
              </div>
              <div>
                <p className="section-title mb-1.5">Persona</p>
                <Badge tone="navy" size="md">{shopper.profileType}</Badge>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {shopper.profileType === 'Family' || shopper.profileType === 'Parent'
                    ? 'Suited to family-entertainment and casual-dining scenarios with children in the party.'
                    : shopper.profileType === 'Tourist'
                      ? 'Suited to attraction, hotel-reception and first-time-visitor journeys.'
                      : shopper.profileType === 'Professional'
                        ? 'Suited to fine-dining, business-lunch and digital / delivery journeys.'
                        : shopper.profileType === 'Young Adult'
                          ? 'Suited to cinema, recreation, fast-casual and social-media interaction journeys.'
                          : 'Suited to general dine-in, takeaway and walk-in entertainment journeys.'}
                </p>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5 min-w-0">
          <Card>
            <CardHeader title="Performance" subtitle="Computed from this shopper's visits in the current engagement" />
            <CardBody>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Completed visits" value={shopper.completedVisits} sub={`${perf.completed} in this programme`} />
                <Stat label="On-time submission" value={fmtPct(perf.onTime ?? shopper.onTimeSubmissionPct, 0)} sub={<span className="inline-flex items-center gap-1"><Timer className="h-3 w-3" aria-hidden />{perf.breaches} SLA breach{perf.breaches === 1 ? '' : 'es'}</span>} />
                <Stat label="Report quality" value={<span className="inline-flex items-center gap-1"><Star className="h-4 w-4 text-amber-500" aria-hidden />{shopper.avgReportQuality.toFixed(1)}<span className="text-sm text-slate-400">/5</span></span>} sub="Reviewer rating" />
                <Stat label="Upcoming" value={perf.upcoming} sub={<span className="inline-flex items-center gap-1"><CalendarCheck className="h-3 w-3" aria-hidden />assigned visits</span>} />
              </div>
              {perf.avgScore !== null && (
                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300">Average outlet score across approved visits</span>
                    <span className="font-semibold tabular-nums">{perf.avgScore.toFixed(1)}%</span>
                  </div>
                  <ProgressBar value={perf.avgScore} label="Average outlet score" />
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Training & briefing" subtitle={`${trainingDone} of ${trainingRows.length} modules completed`} actions={<StatusBadge status={shopper.trainingStatus} />} />
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Training modules</caption>
                <thead>
                  <tr>
                    <th scope="col">Module</th>
                    <th scope="col">Status</th>
                    <th scope="col">Completed</th>
                    <th scope="col">Expires</th>
                    <th scope="col" className="text-right">Score</th>
                    {manage && <th scope="col" className="no-print">Update</th>}
                  </tr>
                </thead>
                <tbody>
                  {trainingRows.map(({ module, record }) => {
                    const expired = record?.expiresAt && record.expiresAt < fmtDate(now, "yyyy-MM-dd'T'HH:mm:ss")
                    return (
                      <tr key={module.id}>
                        <td>
                          <p className="font-medium text-slate-800 dark:text-slate-100">{module.name}</p>
                          <p className="text-[11px] text-slate-500">Valid {module.validityMonths} months</p>
                        </td>
                        <td>
                          <StatusBadge status={record?.status ?? 'Not Started'} size="xs" />
                        </td>
                        <td className="whitespace-nowrap tabular-nums text-xs">{fmtDate(record?.completedAt)}</td>
                        <td className={`whitespace-nowrap tabular-nums text-xs ${expired ? 'text-red-700 dark:text-red-300' : ''}`}>{fmtDate(record?.expiresAt)}</td>
                        <td className="text-right tabular-nums">{record?.score !== null && record?.score !== undefined ? `${record.score}%` : '—'}</td>
                        {manage && (
                          <td className="no-print">
                            <Select
                              value={record?.status ?? 'Not Started'}
                              aria-label={`Update status for ${module.name}`}
                              className="!w-auto !py-1 text-xs"
                              disabled={busy !== null}
                              onChange={(e) => {
                                const status = e.target.value as TrainingStatus
                                void run(module.id, `${module.name} → ${status}`, (d, ctx) => updateShopperTraining(d, ctx, shopper.id, module.id, status))
                              }}
                            >
                              {TRAINING_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </Select>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="Assigned & recent visits" subtitle={`${visits.length} visit${visits.length === 1 ? '' : 's'} linked to this shopper`} />
            <DataTable columns={visitColumns} rows={visits} rowKey={(v) => v.id} onRowClick={(v) => navigate(`/operations/visits/${v.id}`)} initialSort={{ key: 'scheduledDate', dir: 'desc' }} pageSize={8} dense caption="Visits for this shopper" emptyTitle="No visits yet" emptyMessage="This shopper has not been assigned any visits." />
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmStatus}
        title={active ? `Deactivate ${shopper.name}?` : `Reactivate ${shopper.name}?`}
        tone={active ? 'danger' : 'default'}
        confirmLabel={active ? 'Deactivate' : 'Reactivate'}
        busy={busy === 'status'}
        onCancel={() => setConfirmStatus(false)}
        onConfirm={async () => {
          const status: Shopper['status'] = active ? 'Inactive' : 'Active'
          await run('status', `${shopper.name} ${active ? 'deactivated' : 'reactivated'}`, (d, ctx) => updateShopper(d, ctx, shopper.id, { status, availability: active ? 'Unavailable' : 'Available' }))
          setConfirmStatus(false)
        }}
        message={active ? 'The shopper will no longer appear in assignment recommendations and will be marked unavailable. Existing visit assignments are kept.' : 'The shopper will be marked active and available for new assignments.'}
      />
    </div>
  )
}
