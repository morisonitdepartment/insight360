import { useData } from '@/contexts/DataContext'
import { getVisitSections } from '@/services/actions'
import { RESTROOM_STAGE_CODE } from '@/data/templateKit'
import { isQuestionAnswered } from '@/utils/scoring'
import { ProgressBar } from '@/components/ui/Misc'
import { scoreTextClass } from '@/components/ui/Badge'
import type { Visit } from '@/types'

/**
 * Where the restroom inspection stands on one visit: how many of its checks are
 * done and, once any are scored, the restroom score itself.
 *
 * Read from the answers rather than from the stored category scores, so it is
 * right while the visit is still being filled in, and on a visit scored before
 * the restroom stage existed it says plainly that the inspection is outstanding
 * instead of showing nothing.
 */
export function RestroomStatus({ visit }: { visit: Visit }) {
  const { data } = useData()
  const section = getVisitSections(data, visit).find((s) => s.code === RESTROOM_STAGE_CODE)
  if (!section) return null

  const questions = data.questions.filter((q) => q.sectionId === section.id)
  const answers = new Map(data.answers.filter((a) => a.visitId === visit.id).map((a) => [a.questionId, a]))
  const done = questions.filter((q) => isQuestionAnswered(q, answers.get(q.id))).length

  let weight = 0
  let earned = 0
  for (const q of questions) {
    const a = answers.get(q.id)
    if (!a || a.na || a.score === null || q.weight <= 0) continue
    weight += q.weight
    earned += q.weight * a.score
  }
  const score = weight > 0 ? (earned / weight) * 100 : null
  // Marked N/A as a whole (no customer restroom, or closed): say so, with the
  // shopper's reason, rather than "All 21 checks done" with no score.
  const allNa = questions.length > 0 && questions.every((q) => answers.get(q.id)?.na)
  const reason = allNa ? questions.map((q) => answers.get(q.id)?.comment?.trim()).find(Boolean) : undefined
  const status = allNa ? `Not applicable${reason ? `: ${reason}` : ''}` : done === 0 ? 'Not inspected yet' : done < questions.length ? `${done} of ${questions.length} checks done` : `All ${questions.length} checks done`

  return (
    <div className="border-t border-slate-200 pt-3 dark:border-navy-800">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-slate-700 dark:text-slate-200">
          {section.title}
          {section.stageWeight ? <span className="ml-1.5 font-normal text-slate-400">weight {section.stageWeight}%</span> : null}
        </span>
        <span className="tabular-nums">
          <span className="text-slate-500 dark:text-slate-400">{status}</span>
          {score !== null && <span className={`ml-2 font-semibold ${scoreTextClass(score)}`}>{score.toFixed(1)}%</span>}
        </span>
      </div>
      <ProgressBar value={questions.length ? (done / questions.length) * 100 : 0} tone="accent" label={`${section.title}: ${status}`} />
    </div>
  )
}
