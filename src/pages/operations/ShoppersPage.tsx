import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Award, Download, GraduationCap, Star, Timer, Users } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import type { Shopper, ShopperProfileType } from '@/types'
import { logExport } from '@/services/actions'
import { PageHeader } from '@/components/ui/PageHeader'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { FilterBar, applyFilters, matchesSearch, type FilterDef } from '@/components/ui/FilterBar'
import { SegmentBadge, StatusBadge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Misc'
import { exportCsv } from '@/utils/export'
import { avg, fmtDate, fmtPct } from '@/utils/format'

const PROFILE_TYPES: ShopperProfileType[] = ['Individual', 'Family', 'Tourist', 'Young Adult', 'Professional', 'Parent']

export default function ShoppersPage() {
  useDocumentTitle('Mystery shoppers')
  const navigate = useNavigate()
  const now = useNow()
  const { can } = useAuth()
  const { data, dispatch } = useData()

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})

  const filterDefs: FilterDef[] = [
    { key: 'status', label: 'Status', options: ['Active', 'On Leave', 'Inactive'].map((s) => ({ value: s, label: s })) },
    { key: 'availability', label: 'Availability', options: ['Available', 'Limited', 'Unavailable'].map((s) => ({ value: s, label: s })) },
    { key: 'category', label: 'Category', options: [{ value: 'F&B', label: 'F&B' }, { value: 'Entertainment', label: 'Entertainment' }] },
    { key: 'profile', label: 'Profile type', options: PROFILE_TYPES.map((p) => ({ value: p, label: p })) },
    { key: 'certification', label: 'Certification', options: ['Certified', 'Pending', 'Expired'].map((s) => ({ value: s, label: s })) },
  ]

  const rows = useMemo(() => {
    let list = applyFilters(data.shoppers, filters, {
      status: (s) => s.status,
      availability: (s) => s.availability,
      profile: (s) => s.profileType,
      certification: (s) => s.certificationStatus,
    })
    if (filters.category && filters.category !== 'all') list = list.filter((s) => s.assignedCategories.includes(filters.category as 'F&B' | 'Entertainment'))
    return matchesSearch(list, search, (s) => [s.code, s.name, s.nationality, s.email, ...s.languages])
  }, [data.shoppers, filters, search])

  const kpi = useMemo(() => {
    const active = data.shoppers.filter((s) => s.status === 'Active')
    return {
      active: active.length,
      certified: data.shoppers.filter((s) => s.certificationStatus === 'Certified').length,
      trainingIssues: data.shoppers.filter((s) => s.trainingStatus === 'Expired' || s.certificationStatus === 'Pending' || s.certificationStatus === 'Expired').length,
      onTime: avg(active.map((s) => s.onTimeSubmissionPct)),
      quality: avg(active.map((s) => s.avgReportQuality)),
    }
  }, [data.shoppers])

  const doExport = () => {
    if (!rows.length) {
      toast.error('Nothing to export for the current filters.')
      return
    }
    exportCsv(
      rows.map((s) => ({
        'Shopper ID': s.code,
        Name: s.name,
        Gender: s.gender,
        'Age Range': s.ageRange,
        Nationality: s.nationality,
        'Profile Type': s.profileType,
        Languages: s.languages.join('; '),
        'Experience (years)': s.experienceYears,
        Categories: s.assignedCategories.join('; '),
        Availability: s.availability,
        Training: s.trainingStatus,
        Certification: s.certificationStatus,
        'Completed Visits': s.completedVisits,
        'Avg Report Quality': s.avgReportQuality,
        'On-Time %': s.onTimeSubmissionPct,
        Status: s.status,
      })),
      `insight360-shoppers-${fmtDate(now, 'yyyyMMdd')}`,
    )
    void dispatch((d, ctx) => logExport(d, ctx, `Shoppers (${rows.length} rows)`, 'CSV')).then(() => toast.success(`Exported ${rows.length} shoppers to CSV`))
  }

  const columns: Column<Shopper>[] = [
    { key: 'code', header: 'Shopper ID', render: (s) => <span className="font-mono text-xs font-semibold">{s.code}</span> },
    {
      key: 'name',
      header: 'Name',
      render: (s) => (
        <div className="flex items-center gap-2.5 min-w-[180px]">
          <Avatar name={s.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-800 dark:text-slate-100">{s.name}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{s.nationality}</p>
          </div>
        </div>
      ),
    },
    { key: 'gender', header: 'Gender' },
    { key: 'ageRange', header: 'Age', render: (s) => <span className="whitespace-nowrap">{s.ageRange}</span> },
    { key: 'profileType', header: 'Profile', render: (s) => <span className="whitespace-nowrap">{s.profileType}</span> },
    { key: 'languages', header: 'Languages', sortValue: (s) => s.languages.join(', '), render: (s) => <span className="text-xs">{s.languages.join(', ')}</span> },
    { key: 'experienceYears', header: 'Exp.', align: 'right', render: (s) => `${s.experienceYears} yr${s.experienceYears === 1 ? '' : 's'}` },
    {
      key: 'categories',
      header: 'Categories',
      sortValue: (s) => s.assignedCategories.join(','),
      render: (s) => (
        <span className="flex flex-wrap gap-1">
          {s.assignedCategories.map((c) => (
            <SegmentBadge key={c} segment={c} size="xs" />
          ))}
        </span>
      ),
    },
    { key: 'availability', header: 'Availability', render: (s) => <StatusBadge status={s.availability} size="xs" /> },
    { key: 'trainingStatus', header: 'Training', render: (s) => <StatusBadge status={s.trainingStatus} size="xs" /> },
    { key: 'certificationStatus', header: 'Certification', render: (s) => <StatusBadge status={s.certificationStatus} size="xs" /> },
    { key: 'completedVisits', header: 'Visits', align: 'right' },
    { key: 'avgReportQuality', header: 'Quality', align: 'right', render: (s) => <span className="inline-flex items-center gap-1 tabular-nums"><Star className="h-3 w-3 text-amber-500" aria-hidden />{s.avgReportQuality.toFixed(1)}<span className="text-slate-400">/5</span></span> },
    { key: 'onTimeSubmissionPct', header: 'On-time', align: 'right', render: (s) => <span className={s.onTimeSubmissionPct < 85 ? 'text-amber-700 dark:text-amber-300' : ''}>{fmtPct(s.onTimeSubmissionPct, 0)}</span> },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} size="xs" /> },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mystery shoppers"
        subtitle={`${data.shoppers.length} auditors in the programme · ${kpi.active} active`}
        actions={
          can('reports.export') || can('shoppers.manage') ? (
            <button type="button" className="btn-secondary" onClick={doExport}>
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard compact label="Active shoppers" value={kpi.active} sub={`of ${data.shoppers.length} total`} icon={Users} tone="accent" onClick={() => setFilters({ status: 'Active' })} />
        <KpiCard compact label="Certified" value={kpi.certified} sub="Current certification" icon={Award} tone="good" onClick={() => setFilters({ certification: 'Certified' })} />
        <KpiCard compact label="Training attention" value={kpi.trainingIssues} sub="Expired or pending" icon={GraduationCap} tone={kpi.trainingIssues ? 'warn' : 'default'} onClick={() => setFilters({ certification: 'Pending' })} />
        <KpiCard compact label="Avg on-time submission" value={fmtPct(kpi.onTime, 0)} sub="Active shoppers" icon={Timer} tone={(kpi.onTime ?? 0) >= 90 ? 'good' : 'warn'} />
        <KpiCard compact label="Avg report quality" value={kpi.quality !== null ? `${kpi.quality.toFixed(1)} / 5` : '—'} sub="Reviewer rating" icon={Star} />
      </div>

      <FilterBar search={search} onSearch={setSearch} searchPlaceholder="Search name, code, nationality, language…" filters={filterDefs} values={filters} onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={() => { setFilters({}); setSearch('') }} resultCount={rows.length} />

      <Card>
        <DataTable columns={columns} rows={rows} rowKey={(s) => s.id} onRowClick={(s) => navigate(`/operations/shoppers/${s.id}`)} initialSort={{ key: 'name', dir: 'asc' }} caption="Mystery shoppers" emptyTitle="No shoppers match" emptyMessage="Adjust the filters to see more shoppers." />
      </Card>
    </div>
  )
}
