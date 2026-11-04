import { AlertOctagon, ArrowRight, Timer } from 'lucide-react'
import type { AuditTemplate, Question, Section } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { CATEGORY_SHORT } from '@/utils/scoring'
import { KPI_KIND_LABEL, TIMING_LABEL, stageRows } from '@/utils/sequence'
import { cn } from '@/utils/cn'

/**
 * Read-only view of a service sequence template: where it sits in the hierarchy
 * (industry → service model → visit mode), its stages with their KPI names and
 * weights, the main KPIs it reports and the failures that are critical by
 * definition. Stage weights are reference data, so there is nothing to edit here.
 */
export function ServiceSequencePanel({ template, sections, questions }: { template: AuditTemplate; sections: Section[]; questions: Question[] }) {
  const seq = template.sequence
  if (!seq) return null
  const rows = stageRows(sections, questions)
  const total = rows.reduce((n, r) => n + r.weight, 0)
  const unweighted = sections.filter((s) => s.stageWeight === 0)

  return (
    <Card>
      <CardHeader
        title="Service sequence"
        subtitle="Stages in guest order; each stage is a KPI with its share of the visit score"
        actions={<Badge tone={total === 100 ? 'green' : 'red'}>{total === 100 ? 'Weights total 100%' : `Weights total ${total}%`}</Badge>}
      />
      <CardBody className="space-y-5">
        <dl className="grid grid-cols-3 gap-3 text-xs">
          {[
            ['Industry', seq.industry],
            ['Service model', seq.serviceModel],
            ['Visit mode', seq.visitMode],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-navy-800/60">
              <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{k}</dt>
              <dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-100">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="table-wrap">
          <table className="table text-xs">
            <caption className="sr-only">Stages and weights</caption>
            <thead>
              <tr>
                <th scope="col" className="w-8">#</th>
                <th scope="col">Stage</th>
                <th scope="col">KPI</th>
                <th scope="col">Category</th>
                <th scope="col" className="text-right">Weight</th>
                <th scope="col" className="text-right">Questions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.section.id} className={cn(r.weight === 0 && 'text-slate-500 dark:text-slate-400')}>
                  <td className="tabular-nums">{i + 1}</td>
                  <td>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{r.section.code}</span> <span className="font-medium text-slate-800 dark:text-slate-100">{r.section.title}</span>
                  </td>
                  <td>{r.section.kpiName}</td>
                  <td>{CATEGORY_SHORT[r.section.category]}</td>
                  <td className="text-right tabular-nums font-semibold">{r.weight === 0 ? <span className="font-normal">unweighted</span> : `${r.weight}%`}</td>
                  <td className="text-right tabular-nums">{r.questions}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td colSpan={4}>Total</td>
                <td className={cn('text-right tabular-nums', total === 100 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>{total}%</td>
                <td className="text-right tabular-nums">{rows.reduce((n, r) => n + r.questions, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {unweighted.length > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {unweighted.map((s) => s.title).join(', ')} {unweighted.length === 1 ? 'is' : 'are'} not weighted: {unweighted.length === 1 ? 'its' : 'their'} answers feed the satisfaction KPIs only.
          </p>
        )}

        {seq.timingChain && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-2 text-xs dark:border-teal-500/30 dark:bg-teal-500/10">
            <Timer className="h-3.5 w-3.5 text-teal-700 dark:text-teal-300" aria-hidden />
            <span className="font-semibold text-teal-800 dark:text-teal-200">Timing chain</span>
            {seq.timingChain.map((role, i) => (
              <span key={role} className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200">
                {i > 0 && <span aria-hidden>+</span>}
                {TIMING_LABEL[role]} time
              </span>
            ))}
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            <span className="font-medium text-slate-800 dark:text-slate-100">Total service time</span>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="section-title mb-2">Main KPIs</p>
            <ul className="space-y-1.5">
              {seq.mainKpis.map((k) => (
                <li key={k.key} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-700 dark:text-slate-200">{k.label}</span>
                  <Badge tone={k.kind === 'timing' ? 'blue' : k.kind === 'derived' ? 'violet' : k.kind === 'satisfaction' ? 'amber' : 'slate'} size="xs">
                    {KPI_KIND_LABEL[k.kind]}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="section-title mb-2 flex items-center gap-1.5">
              <AlertOctagon className="h-3.5 w-3.5 text-red-600" aria-hidden /> Critical failures
            </p>
            <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-200">
              {seq.criticalFailures.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-red-600" aria-hidden>•</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Any of these forces the visit to Critical risk regardless of the score.</p>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
