import { Check, RotateCcw } from 'lucide-react'
import type { Visit } from '@/types'
import { WORKFLOW_STEPS, workflowStepIndex } from '@/services/workflow'
import { cn } from '@/utils/cn'

/**
 * Where this visit is in its life, and whose move it is.
 *
 * The status badge alone says "Submitted"; it does not say that the next step
 * belongs to a particular reviewer, or that a returned visit is back with the
 * shopper. This puts the whole chain — book, assign, carry out, submit, review,
 * approve — on one line, with the name of the person holding it.
 */
export function WorkflowTracker({ visit, shopperName, reviewerName }: { visit: Visit; shopperName: string | null; reviewerName: string | null }) {
  const current = workflowStepIndex(visit.status)
  const returned = visit.status === 'Rejected'
  const done = visit.status === 'Approved' || visit.status === 'Closed'

  const holder = (() => {
    if (done) return `Approved${reviewerName ? ` by ${reviewerName}` : ''} — report released`
    switch (visit.status) {
      case 'Planned':
        return 'Waiting for a shopper to be assigned'
      case 'Assigned':
        return `With ${shopperName ?? 'the shopper'} — not started yet`
      case 'In Progress':
      case 'Draft':
        return `With ${shopperName ?? 'the shopper'} — ${visit.progress}% complete`
      case 'Rejected':
        return `Returned to ${shopperName ?? 'the shopper'} for revision`
      case 'Submitted':
      case 'Under Review':
        return `With ${reviewerName ?? 'a reviewer'} for approval`
      default:
        return ''
    }
  })()

  return (
    <section aria-label="Visit workflow" className="card px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Workflow</p>
        <p className={cn('text-xs font-medium', returned ? 'text-amber-700 dark:text-amber-300' : done ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200')}>
          {returned && <RotateCcw className="mr-1 inline h-3.5 w-3.5" aria-hidden />}
          {holder}
        </p>
      </div>
      <ol className="mt-3 grid grid-cols-6 gap-1">
        {WORKFLOW_STEPS.map((step, i) => {
          const complete = i < current || done
          const active = i === current && !done
          return (
            <li key={step.key} className="min-w-0" aria-current={active ? 'step' : undefined}>
              <div className={cn('h-1.5 rounded-full', complete ? 'bg-emerald-500' : active ? (returned ? 'bg-amber-500' : 'bg-teal-500') : 'bg-slate-200 dark:bg-navy-700')} />
              <p className={cn('mt-1.5 flex items-center gap-1 truncate text-[10px] sm:text-[11px]', active ? 'font-semibold text-slate-900 dark:text-white' : complete ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400')}>
                {complete && <Check className="hidden h-3 w-3 shrink-0 text-emerald-600 sm:inline" aria-hidden />}
                {active && returned ? 'Returned' : step.label}
              </p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
