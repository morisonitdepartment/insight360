import { hasPermission } from '@/config/permissions'
import type { Dataset, Segment, Shopper, User, Visit, VisitStatus } from '@/types'

/**
 * The life of a visit, as the people involved see it.
 *
 *   Booked ─► Assigned ─► In progress ─► Submitted ─► Under review ─► Approved
 *                              ▲                                         │
 *                              └──────────── Returned (rejected) ◄───────┘
 *
 * An administrator books the visit and names a shopper and a reviewer. The
 * shopper carries it out and submits it. The named reviewer approves it, which
 * releases the report, or returns it to the shopper with a reason.
 */
export const WORKFLOW_STEPS: { key: string; label: string; statuses: VisitStatus[] }[] = [
  { key: 'booked', label: 'Booked', statuses: ['Planned'] },
  { key: 'assigned', label: 'Assigned', statuses: ['Assigned'] },
  { key: 'progress', label: 'In progress', statuses: ['In Progress', 'Draft', 'Rejected'] },
  { key: 'submitted', label: 'Submitted', statuses: ['Submitted'] },
  { key: 'review', label: 'Under review', statuses: ['Under Review'] },
  { key: 'approved', label: 'Approved', statuses: ['Approved', 'Closed'] },
]

export function workflowStepIndex(status: VisitStatus): number {
  const i = WORKFLOW_STEPS.findIndex((s) => s.statuses.includes(status))
  return i < 0 ? 0 : i
}

/** People who may be named as a visit's reviewer. */
export function reviewerCandidates(users: User[]): User[] {
  return users
    .filter((u) => u.status === 'active' && hasPermission(u.role, 'visits.review'))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Whether this user may review this visit. Mirrors the `visits_review_update`
 * policy: the named reviewer, or anyone with the permission when nobody is
 * named. A super admin can always step in.
 */
export function canReviewVisit(user: User | null, visit: Visit): boolean {
  if (!user || !hasPermission(user.role, 'visits.review')) return false
  if (user.role === 'super_admin') return true
  return !visit.reviewerId || visit.reviewerId === user.id
}

/** Visits waiting for this user's decision. */
export function awaitingMyApproval(user: User | null, visits: Visit[]): Visit[] {
  if (!user) return []
  return visits.filter(
    (v) =>
      (v.status === 'Submitted' || v.status === 'Under Review') &&
      // A super admin's queue is the visits named to them plus the unnamed ones;
      // they can open any other from the full list.
      (v.reviewerId ? v.reviewerId === user.id : canReviewVisit(user, v)),
  )
}

/**
 * Whether a shopper may be sent to an outlet of this category.
 *
 * A shopper created from Administration → Users has no categories recorded at
 * all, and was therefore listed for none: the "Assign shopper" list came up
 * empty for every real shopper. No categories means no restriction.
 */
export function shopperCovers(shopper: Pick<Shopper, 'assignedCategories'>, segment: Segment): boolean {
  const cats = shopper.assignedCategories ?? []
  return cats.length === 0 || cats.includes(segment)
}

/** The platform user behind a shopper record, for addressing them directly. */
export function userIdForShopper(data: Pick<Dataset, 'users'>, shopperId: string | null): string | null {
  if (!shopperId) return null
  return data.users.find((u) => u.shopperId === shopperId)?.id ?? null
}
