import type { Finding, Outlet, ScoreThreshold, Visit, VisitStatus } from '@/types'
import { riskFromScore } from '@/utils/scoring'

export const COMPLETED_STATUSES: VisitStatus[] = ['Approved', 'Closed']
export const SCORED_STATUSES: VisitStatus[] = ['Submitted', 'Under Review', 'Approved', 'Closed']
export const AWAITING_APPROVAL_STATUSES: VisitStatus[] = ['Submitted', 'Under Review']
export const IN_PROGRESS_STATUSES: VisitStatus[] = ['In Progress', 'Draft']

export const isCompleted = (v: Visit) => COMPLETED_STATUSES.includes(v.status)
export const isScored = (v: Visit) => SCORED_STATUSES.includes(v.status) && v.score !== null
export const isAwaitingApproval = (v: Visit) => AWAITING_APPROVAL_STATUSES.includes(v.status)
export const isInProgress = (v: Visit) => IN_PROGRESS_STATUSES.includes(v.status)
export const isMainAudit = (v: Visit) => v.type.startsWith('Main')
export const isFollowUp = (v: Visit) => v.type.startsWith('Follow')
export const isOpenFinding = (f: Finding) => f.status === 'Open' || f.status === 'In Progress'

/** Sort helper: visit date (falls back to scheduled date) */
export const visitDateOf = (v: Visit) => v.visitDate ?? v.scheduledDate

/**
 * Recomputes every derived outlet field from visits & findings. Called on initial load and
 * after any mutation that affects scores (approval, rejection, finding closure...).
 */
export function deriveOutlets(outlets: Outlet[], visits: Visit[], findings: Finding[], thresholds: ScoreThreshold[]): Outlet[] {
  const derived: Outlet[] = outlets.map((o) => {
    const ov = visits.filter((v) => v.outletId === o.id)
    const completed = ov.filter(isCompleted).sort((a, b) => visitDateOf(b).localeCompare(visitDateOf(a)))
    const latest = completed[0]
    const previous = completed[1]
    const upcoming = ov.filter((v) => !isCompleted(v) && !isScored(v)).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
    const of = findings.filter((f) => f.outletId === o.id)
    const open = of.filter(isOpenFinding)
    const criticalOpen = open.filter((f) => f.severity === 'Critical').length
    const overall = latest?.score ?? null
    let risk = riskFromScore(overall, thresholds)
    if (criticalOpen > 0 && overall !== null) risk = 'Critical'

    return {
      ...o,
      mainAuditsCompleted: completed.filter(isMainAudit).length,
      followUpsCompleted: completed.filter(isFollowUp).length,
      lastAudit: latest?.visitDate ?? null,
      nextAudit: upcoming[0]?.scheduledDate ?? null,
      overallScore: overall,
      previousScore: previous?.score ?? null,
      riskRating: risk,
      openIssues: open.length,
      criticalFindings: criticalOpen,
      categoryScores: latest?.categoryScores ?? null,
      rank: null,
    }
  })

  const ranked = derived.filter((o) => o.overallScore !== null).sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0))
  const rankMap = new Map(ranked.map((o, i) => [o.id, i + 1]))
  return derived.map((o) => ({ ...o, rank: rankMap.get(o.id) ?? null }))
}
