import { useMemo, useState } from 'react'
import { format, subDays } from 'date-fns'
import toast from 'react-hot-toast'
import { Activity, AlertTriangle, CheckCircle2, Download, Layers, Lock, ShieldX, Users as UsersIcon } from 'lucide-react'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import type { ActivityLog } from '@/types'
import { logExport } from '@/services/actions'
import { PageHeader } from '@/components/ui/PageHeader'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { FilterBar, applyFilters, matchesSearch, type FilterDef } from '@/components/ui/FilterBar'
import { Badge, type Tone } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Form'
import { Avatar } from '@/components/ui/Misc'
import { ChartCard, GroupedBarChart, CHART_COLORS } from '@/components/charts'
import { exportCsv } from '@/utils/export'
import { fmtDate, fmtDateTime, truncate } from '@/utils/format'

const RESULT_STYLE: Record<ActivityLog['result'], { tone: Tone; icon: typeof CheckCircle2 }> = {
  Success: { tone: 'green', icon: CheckCircle2 },
  Failed: { tone: 'amber', icon: AlertTriangle },
  Denied: { tone: 'red', icon: ShieldX },
}

export default function ActivityLogsPage() {
  useDocumentTitle('Activity Logs')
  const now = useNow()
  const { data, dispatch } = useData()

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const logs = data.activityLogs

  const options = useMemo(() => {
    const users = Array.from(new Set(logs.map((l) => l.userName))).sort((a, b) => a.localeCompare(b))
    const modules = Array.from(new Set(logs.map((l) => l.module))).sort((a, b) => a.localeCompare(b))
    const actions = Array.from(new Set(logs.map((l) => l.action))).sort((a, b) => a.localeCompare(b))
    return { users, modules, actions }
  }, [logs])

  const filterDefs: FilterDef[] = [
    { key: 'user', label: 'User', options: options.users.map((u) => ({ value: u, label: u })) },
    { key: 'module', label: 'Module', options: options.modules.map((m) => ({ value: m, label: m })) },
    { key: 'result', label: 'Result', options: (['Success', 'Failed', 'Denied'] as ActivityLog['result'][]).map((r) => ({ value: r, label: r })) },
    { key: 'action', label: 'Action', options: options.actions.map((a) => ({ value: a, label: a })) },
  ]

  const rows = useMemo(() => {
    let list = applyFilters(logs, filters, {
      user: (l) => l.userName,
      module: (l) => l.module,
      result: (l) => l.result,
      action: (l) => l.action,
    })
    if (from) list = list.filter((l) => l.timestamp.slice(0, 10) >= from)
    if (to) list = list.filter((l) => l.timestamp.slice(0, 10) <= to)
    return [...matchesSearch(list, search, (l) => [l.userName, l.action, l.recordId, l.details, l.module, l.ip])].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }, [logs, filters, search, from, to])

  const kpi = useMemo(() => {
    const dayAgo = format(subDays(now, 1), "yyyy-MM-dd'T'HH:mm:ss")
    const weekAgo = format(subDays(now, 7), "yyyy-MM-dd'T'HH:mm:ss")
    const last24 = logs.filter((l) => l.timestamp >= dayAgo).length
    const failed = logs.filter((l) => l.result !== 'Success').length
    const users7 = new Set(logs.filter((l) => l.timestamp >= weekAgo).map((l) => l.userId)).size
    const counts = new Map<string, number>()
    logs.forEach((l) => counts.set(l.module, (counts.get(l.module) ?? 0) + 1))
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]
    return { last24, failed, users7, topModule: top?.[0] ?? '—', topModuleCount: top?.[1] ?? 0 }
  }, [logs, now])

  const daily = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => subDays(now, 13 - i))
    const buckets = new Map<string, { name: string; Success: number; Failed: number; Denied: number }>()
    days.forEach((d) => buckets.set(format(d, 'yyyy-MM-dd'), { name: format(d, 'dd MMM'), Success: 0, Failed: 0, Denied: 0 }))
    logs.forEach((l) => {
      const b = buckets.get(l.timestamp.slice(0, 10))
      if (b) b[l.result] += 1
    })
    const list = Array.from(buckets.values())
    const max = Math.max(4, ...list.map((b) => b.Success + b.Failed + b.Denied))
    return { list, max: Math.ceil(max * 1.1) }
  }, [logs, now])

  const doExport = () => {
    if (!rows.length) {
      toast.error('Nothing to export for the current filters.')
      return
    }
    const out = rows.map((l) => ({
      Timestamp: l.timestamp,
      User: l.userName,
      'User ID': l.userId,
      Action: l.action,
      Module: l.module,
      'Record ID': l.recordId,
      IP: l.ip,
      Result: l.result,
      Details: l.details ?? '',
    }))
    exportCsv(out, `insight360-activity-log-${fmtDate(now, 'yyyyMMdd')}`)
    void dispatch((d, ctx) => logExport(d, ctx, `Activity logs (${out.length} rows)`, 'CSV')).then(() => toast.success(`Exported ${out.length} log entries to CSV`))
  }

  const columns: Column<ActivityLog>[] = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      width: '160px',
      render: (l) => (
        <time className="font-mono text-[11px] tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-300" dateTime={l.timestamp}>
          {fmtDateTime(l.timestamp)}
        </time>
      ),
    },
    {
      key: 'userName',
      header: 'User',
      render: (l) => (
        <span className="inline-flex min-w-0 items-center gap-2">
          <Avatar name={l.userName} size="xs" />
          <span className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">{l.userName}</span>
        </span>
      ),
    },
    { key: 'action', header: 'Action', render: (l) => <span className="text-xs text-slate-700 dark:text-slate-200">{l.action}</span> },
    { key: 'module', header: 'Module', render: (l) => <Badge tone="slate" size="xs">{l.module}</Badge> },
    { key: 'recordId', header: 'Record ID', render: (l) => <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{l.recordId}</span> },
    { key: 'ip', header: 'IP', render: (l) => <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{l.ip}</span> },
    {
      key: 'result',
      header: 'Result',
      render: (l) => {
        const s = RESULT_STYLE[l.result]
        return (
          <Badge tone={s.tone} icon={s.icon} size="xs">
            {l.result}
          </Badge>
        )
      },
    },
    {
      key: 'details',
      header: 'Details',
      sortable: false,
      render: (l) =>
        l.details ? (
          <span className="block max-w-[280px] truncate text-xs text-slate-500 dark:text-slate-400" title={l.details}>
            {truncate(l.details, 72)}
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activity Logs"
        subtitle="Immutable audit trail of user and system actions"
        actions={
          <button type="button" className="btn-secondary" onClick={doExport}>
            <Download className="h-4 w-4" aria-hidden /> Export CSV
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard compact label="Events (last 24h)" value={kpi.last24} icon={Activity} tone="accent" sub="Recorded in the trail" />
        <KpiCard compact label="Failed / denied" value={kpi.failed} icon={ShieldX} tone={kpi.failed ? 'critical' : 'good'} sub="All time" />
        <KpiCard compact label="Distinct users (7d)" value={kpi.users7} icon={UsersIcon} sub="Active accounts" />
        <KpiCard compact label="Most active module" value={kpi.topModule} icon={Layers} sub={`${kpi.topModuleCount.toLocaleString()} events`} />
      </div>

      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search user, action, record or details…"
        filters={filterDefs}
        values={filters}
        onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
        onReset={() => {
          setFilters({})
          setSearch('')
          setFrom('')
          setTo('')
        }}
        resultCount={rows.length}
      >
        <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="sr-only sm:not-sr-only whitespace-nowrap">From</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="!w-auto !py-1.5 text-xs" aria-label="From date" max={to || undefined} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="sr-only sm:not-sr-only whitespace-nowrap">To</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="!w-auto !py-1.5 text-xs" aria-label="To date" min={from || undefined} />
        </label>
      </FilterBar>

      <ChartCard title="Events per day" subtitle="Last 14 days by outcome" height={240}>
        <GroupedBarChart
          data={daily.list}
          series={[
            { key: 'Success', label: 'Success', color: CHART_COLORS.teal },
            { key: 'Failed', label: 'Failed', color: CHART_COLORS.amber },
            { key: 'Denied', label: 'Denied', color: CHART_COLORS.red },
          ]}
          xKey="name"
          domain={[0, daily.max]}
          unit=""
          stacked
        />
      </ChartCard>

      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(l) => l.id}
          pageSize={25}
          dense
          initialSort={{ key: 'timestamp', dir: 'desc' }}
          caption="Activity log entries"
          emptyTitle="No log entries match"
          emptyMessage="Adjust the filters or the date range."
          footer={
            <p className="flex items-center gap-2 border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500 dark:border-navy-800 dark:text-slate-400">
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Entries cannot be edited or deleted.
            </p>
          }
        />
      </Card>
    </div>
  )
}
