import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  AlertOctagon,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Layers,
  ListChecks,
  RotateCcw,
  Save,
  ShieldAlert,
  Store,
  TrendingUp,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import type { KpiConfig, Segment } from '@/types'
import { updateKpiConfig } from '@/services/actions'
import { CATEGORY_SHORT } from '@/utils/scoring'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, RiskBadge } from '@/components/ui/Badge'
import { Input, Select, Textarea } from '@/components/ui/Form'
import { ChartCard, DonutChart, SERIES_COLORS } from '@/components/charts'
import { EmptyState } from '@/components/ui/States'
import { ProgressBar, Stat } from '@/components/ui/Misc'
import { fmtDateTime, round } from '@/utils/format'
import { cn } from '@/utils/cn'

type ApplicableChoice = 'all' | 'F&B' | 'Entertainment'

const APPLICABLE_LABELS: Record<ApplicableChoice, string> = {
  all: 'All segments',
  'F&B': 'F&B only',
  Entertainment: 'Entertainment only',
}

const toApplicable = (v: Segment[] | 'all'): ApplicableChoice => (v === 'all' ? 'all' : v[0] === 'Entertainment' ? 'Entertainment' : 'F&B')
const fromApplicable = (v: ApplicableChoice): Segment[] | 'all' => (v === 'all' ? 'all' : [v])

const HIERARCHY: { label: string; icon: typeof Gauge; detail: string }[] = [
  { label: 'Question', icon: ListChecks, detail: 'Each answer is normalised to 0–100% and multiplied by its question weight (0–10).' },
  { label: 'Section', icon: Layers, detail: 'Weighted average of its answered questions; unanswered and N/A items are excluded.' },
  { label: 'Category', icon: ClipboardCheck, detail: 'Sections mapped to the same KPI category are averaged by their answered weight.' },
  { label: 'Visit', icon: Gauge, detail: 'Category scores combined using the KPI weightings below — this is the visit score.' },
  { label: 'Outlet', icon: Store, detail: 'The latest approved visit sets the outlet score, risk rating and rank.' },
  { label: 'Brand', icon: Building2, detail: 'Mean of the outlet scores belonging to the brand, weighted equally per outlet.' },
  { label: 'Organisation', icon: TrendingUp, detail: 'Programme-wide score across all assessed outlets, reported monthly to the board.' },
]

export default function KpiConfigPage() {
  useDocumentTitle('KPI Configuration')
  const now = useNow()
  const { can } = useAuth()
  const { data, dispatch } = useData()

  const canEdit = can('admin.kpi')

  // Snapshot taken at mount — restored by "Reset".
  const [snapshot] = useState<KpiConfig[]>(() => data.kpiConfig.map((k) => ({ ...k })))
  const [rows, setRows] = useState<KpiConfig[]>(() => data.kpiConfig.map((k) => ({ ...k })))
  const [busy, setBusy] = useState(false)

  const total = useMemo(() => round(rows.reduce((a, k) => a + (Number.isFinite(k.weight) ? k.weight : 0), 0), 2), [rows])
  const balanced = Math.abs(total - 100) < 0.001
  const dirty = useMemo(() => JSON.stringify(rows) !== JSON.stringify(snapshot), [rows, snapshot])

  const patch = (key: string, change: Partial<KpiConfig>) => setRows((list) => list.map((k) => (k.key === key ? { ...k, ...change } : k)))

  const num = (value: string): number => {
    const n = Number(value)
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0
  }

  const save = async () => {
    if (!canEdit || !balanced) return
    setBusy(true)
    try {
      await dispatch((d, ctx) => updateKpiConfig(d, ctx, rows))
      toast.success('KPI weighting model saved — future visit scores use the new weights')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the KPI configuration')
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setRows(snapshot.map((k) => ({ ...k })))
    toast.success('Reverted to the configuration loaded at page open')
  }

  const segments = useMemo(
    () => rows.filter((k) => k.weight > 0).map((k, i) => ({ value: round(k.weight, 1), color: SERIES_COLORS[i % SERIES_COLORS.length], label: CATEGORY_SHORT[k.key] })),
    [rows],
  )

  const criticalQuestions = useMemo(() => {
    return data.questions
      .filter((q) => q.critical)
      .map((q) => {
        const section = data.sections.find((s) => s.id === q.sectionId)
        const template = section ? data.templates.find((t) => t.id === section.templateId) : undefined
        return { id: q.id, code: q.code, text: q.text, sectionTitle: section?.title ?? 'Unassigned section', templateName: template?.name ?? 'Unassigned template', templateId: template?.id ?? null }
      })
      .sort((a, b) => a.templateName.localeCompare(b.templateName) || a.code.localeCompare(b.code))
  }, [data.questions, data.sections, data.templates])

  return (
    <div className="space-y-5">
      <PageHeader
        title="KPI Configuration"
        subtitle="Weighted scoring model: question → section → category → visit → outlet → organisation"
        badge={balanced ? <Badge tone="green" icon={CheckCircle2}>Balanced</Badge> : <Badge tone="red" icon={AlertOctagon}>{total > 100 ? 'Over-weighted' : 'Under-weighted'}</Badge>}
        actions={
          canEdit ? (
            <>
              <button type="button" className="btn-secondary" onClick={reset} disabled={busy || !dirty}>
                <RotateCcw className="h-4 w-4" aria-hidden /> Reset
              </button>
              <button type="button" className="btn-primary" onClick={() => void save()} disabled={busy || !balanced} title={balanced ? undefined : 'Total weighting must equal 100%'}>
                <Save className="h-4 w-4" aria-hidden /> {busy ? 'Saving…' : 'Save configuration'}
              </button>
            </>
          ) : (
            <Badge tone="slate">Read only — requires KPI configuration rights</Badge>
          )
        }
      />

      {/* ── Weighting table ── */}
      <Card>
        <CardHeader
          title="KPI weighting model"
          subtitle="Every approved visit score is the weighted average of these six categories"
          actions={<span className="text-xs text-slate-500 dark:text-slate-400">{rows.length} KPIs</span>}
        />
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Editable KPI weighting configuration</caption>
            <thead>
              <tr>
                <th scope="col" className="min-w-[280px]">KPI &amp; description</th>
                <th scope="col" className="text-right w-[120px]">Weight %</th>
                <th scope="col" className="text-right w-[110px]">Target %</th>
                <th scope="col" className="text-right w-[140px]">Critical threshold %</th>
                <th scope="col" className="min-w-[180px]">Data source</th>
                <th scope="col" className="min-w-[170px]">Applicable category</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k, i) => {
                const share = total > 0 ? (k.weight / total) * 100 : 0
                return (
                  <tr key={k.key} className="align-top">
                    <td>
                      <div className="flex items-start gap-2">
                        <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} aria-hidden />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <Input aria-label={`KPI name for ${k.name}`} value={k.name} onChange={(e) => patch(k.key, { name: e.target.value })} disabled={!canEdit} className="font-medium" />
                          <Textarea aria-label={`Description for ${k.name}`} value={k.description} onChange={(e) => patch(k.key, { description: e.target.value })} disabled={!canEdit} className="min-h-[60px] text-xs" />
                          <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500">{k.key}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Input type="number" min={0} max={100} step={1} aria-label={`Weight for ${k.name}`} value={k.weight} onChange={(e) => patch(k.key, { weight: num(e.target.value) })} disabled={!canEdit} className="text-right tabular-nums" />
                      <p className="mt-1 text-right text-[10px] tabular-nums text-slate-400 dark:text-slate-500">{share.toFixed(1)}% of total</p>
                    </td>
                    <td>
                      <Input type="number" min={0} max={100} step={1} aria-label={`Target for ${k.name}`} value={k.target} onChange={(e) => patch(k.key, { target: num(e.target.value) })} disabled={!canEdit} className="text-right tabular-nums" />
                    </td>
                    <td>
                      <Input type="number" min={0} max={100} step={1} aria-label={`Critical threshold for ${k.name}`} value={k.criticalThreshold} onChange={(e) => patch(k.key, { criticalThreshold: num(e.target.value) })} disabled={!canEdit} className="text-right tabular-nums" />
                      <p className="mt-1 text-right text-[10px] text-slate-400 dark:text-slate-500">Alert below</p>
                    </td>
                    <td>
                      <Input aria-label={`Data source for ${k.name}`} value={k.dataSource} onChange={(e) => patch(k.key, { dataSource: e.target.value })} disabled={!canEdit} className="text-xs" />
                    </td>
                    <td>
                      <Select aria-label={`Applicable category for ${k.name}`} value={toApplicable(k.applicableTo)} onChange={(e) => patch(k.key, { applicableTo: fromApplicable(e.target.value as ApplicableChoice) })} disabled={!canEdit} className="text-xs">
                        <option value="all">All</option>
                        <option value="F&B">F&amp;B</option>
                        <option value="Entertainment">Entertainment</option>
                      </Select>
                      <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">{APPLICABLE_LABELS[toApplicable(k.applicableTo)]}</p>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-200 dark:border-navy-800 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={cn('inline-flex items-center gap-2 text-sm font-medium', balanced ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>
              {balanced ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <AlertOctagon className="h-4 w-4" aria-hidden />}
              <span>
                Total weighting: <span className="tabular-nums">{total}%</span> — must equal 100%
              </span>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {dirty ? 'Unsaved changes' : 'No changes since page open'} · as at {fmtDateTime(now)}
            </p>
          </div>
          <ProgressBar value={Math.min(total, 100)} tone={balanced ? 'green' : total > 100 ? 'red' : 'amber'} className="mt-3" label="Total KPI weighting" />
          {!balanced && (
            <p className="mt-2 text-xs text-red-700 dark:text-red-300">
              {total > 100 ? `Reduce weights by ${round(total - 100, 2)} points` : `Distribute a further ${round(100 - total, 2)} points`} before the configuration can be saved.
            </p>
          )}
        </div>
      </Card>

      {/* ── Distribution, thresholds, hierarchy ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard title="Weight distribution" subtitle="Share of the visit score per KPI category" height={300}>
          {segments.length === 0 ? (
            <EmptyState title="No weights set" message="Assign a weight to at least one KPI." icon={Gauge} />
          ) : (
            <DonutChart value={Math.min(total, 100)} max={100} label={`${total}%`} sublabel="Total weighting" segments={segments} size={168} />
          )}
        </ChartCard>

        <Card>
          <CardHeader title="Risk thresholds" subtitle="Score bands applied to every visit and outlet" />
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Risk rating thresholds</caption>
              <thead>
                <tr>
                  <th scope="col">Rating</th>
                  <th scope="col">Range</th>
                </tr>
              </thead>
              <tbody>
                {data.thresholds.map((t) => (
                  <tr key={t.label}>
                    <td>
                      <RiskBadge risk={t.label} />
                      <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">{t.description}</span>
                    </td>
                    <td className="whitespace-nowrap tabular-nums align-top">
                      {t.min.toFixed(0)}–{t.max.toFixed(t.max % 1 ? 2 : 0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 dark:border-navy-800 px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
            Labels and icons accompany every rating — never colour alone.
          </div>
        </Card>

        <Card>
          <CardHeader title="Scoring hierarchy" subtitle="How a single answer rolls up to the programme score" />
          <CardBody>
            <ol className="relative ml-3 space-y-4 border-l border-slate-200 dark:border-navy-700">
              {HIERARCHY.map((step, i) => {
                const Icon = step.icon
                return (
                  <li key={step.label} className="ml-5">
                    <span className="absolute -left-[13px] inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-navy-800 ring-4 ring-white dark:border-navy-700 dark:bg-navy-800 dark:text-teal-300 dark:ring-navy-900" aria-hidden>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                      <span className="tabular-nums text-[11px] font-normal text-slate-400">{i + 1}</span>
                      {step.label}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{step.detail}</p>
                  </li>
                )
              })}
            </ol>
          </CardBody>
        </Card>
      </div>

      {/* ── Critical override ── */}
      <Card>
        <CardHeader
          title="Critical question override"
          subtitle="Scoring rule that supersedes the weighted model"
          actions={<Badge tone="red" icon={ShieldAlert}>{criticalQuestions.length} critical question{criticalQuestions.length === 1 ? '' : 's'}</Badge>}
        />
        <CardBody className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50/70 p-4 dark:border-red-500/30 dark:bg-red-500/10">
            <p className="flex items-start gap-2 text-sm text-red-900 dark:text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                Any <strong>failed critical question</strong> forces the visit risk rating to <strong>Critical</strong> regardless of the numeric score, raises an immediate alert with a 12-hour escalation clock, and opens a Critical finding for corrective action.
              </span>
            </p>
            <p className="mt-2 text-xs text-red-800/80 dark:text-red-200/80">
              The weighted score is still calculated and reported — the override applies to the risk rating, alerting and escalation only, so the numeric trend remains comparable month on month.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Critical questions" value={criticalQuestions.length} sub="Across all templates" />
            <Stat label="Templates covered" value={new Set(criticalQuestions.map((q) => q.templateName)).size} sub="With at least one critical check" />
            <Stat label="Escalation clock" value={`${data.organization.escalationSlaHours}h`} sub="Owner must acknowledge" />
            <Stat label="Reporting SLA" value={`${data.organization.reportingSlaHours}h`} sub="Submission after the visit" />
          </div>

          {criticalQuestions.length === 0 ? (
            <EmptyState title="No critical questions defined" message="Mark questions as critical in the audit template builder to enable the override." icon={ShieldAlert} />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-navy-800 rounded-lg border border-slate-200 dark:border-navy-800">
              {criticalQuestions.map((q) => (
                <li key={q.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800 dark:text-slate-100">
                      <span className="mr-2 font-mono text-[11px] text-slate-400">{q.code}</span>
                      {q.text}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {q.sectionTitle} ·{' '}
                      {q.templateId ? (
                        <Link to={`/admin/templates?template=${q.templateId}`} className="link">
                          {q.templateName}
                        </Link>
                      ) : (
                        q.templateName
                      )}
                    </p>
                  </div>
                  <Badge tone="red" icon={AlertOctagon}>Critical</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
