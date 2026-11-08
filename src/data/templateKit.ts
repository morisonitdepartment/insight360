import type { AnswerValue, CategoryKey, JourneyType, QuestionType, Section, Segment, ServiceSequence, TimingRole } from '@/types'

/**
 * The shape a template is authored in, and the few pieces every sequence shares.
 *
 * Lives apart from `templates.ts` so a template large enough to deserve its own
 * file — a brand's complete framework rather than a reusable sequence — can be
 * written against the same vocabulary without the two files importing each other.
 */

export interface QuestionBlueprint {
  text: string
  type: QuestionType
  weight?: number
  critical?: boolean
  evidence?: boolean
  comment?: boolean
  /** Ask for a comment only when the answer falls short (a No, a Fail, a low rating). */
  commentOnFail?: boolean
  na?: boolean
  guidance?: string
  options?: string[]
  threshold?: number
  /** Storyline tag used by the demo data generator */
  tag?: string
  // ── Service sequence engine ──
  /** Local handle another question in the same stage can gate on (`when`). */
  key?: string
  /** Main KPIs this question feeds (SequenceKpi.key). */
  kpi?: string[]
  /** Timing-chain leg this time question measures. */
  timing?: TimingRole
  /** Ask only when the sibling with `key` was answered `equals`. */
  when?: { key: string; equals: AnswerValue }
  /** Minutes calculated from two `clock` questions, named by their local keys. */
  from?: string
  to?: string
}

export interface SectionBlueprint {
  code: string
  title: string
  category: CategoryKey
  description: string
  applicableTo: Segment[] | 'all'
  questions: QuestionBlueprint[]
  /** Stage weight (percent of the visit score) on a service sequence template. */
  stageWeight?: number
  /** The KPI the stage reports as. */
  kpiName?: string
}

export interface TemplateBlueprint {
  id: string
  code: string
  name: string
  description: string
  segment: Segment | 'Both'
  journey: JourneyType
  isFollowUp: boolean
  sections: SectionBlueprint[]
  /** Present on a service sequence template. */
  sequence?: ServiceSequence
  /**
   * Require a comment on every answer that falls short, across the whole template.
   * Set per question with `commentOnFail` when only some need it.
   */
  commentOnFail?: boolean
}

export const stage = (
  code: string,
  title: string,
  kpiName: string,
  stageWeight: number,
  category: CategoryKey,
  description: string,
  questions: QuestionBlueprint[],
): SectionBlueprint => ({ code, title, kpiName, stageWeight, category, description, applicableTo: 'all', questions })

export const PROBLEM_SOLVING_OPTIONS = ['Resolved immediately with empathy', 'Resolved after escalation', 'Partially resolved', 'Not resolved / ignored']

/** Excellent → Poor, best first: the scorer reads a choice list as a descending scale. */
export const QUALITY_SCALE = ['Excellent', 'Very Good', 'Good', 'Average', 'Poor']

export const CRITICAL_FAILURES_DINING = [
  'Unsafe food served (raw, spoiled or at an unsafe temperature)',
  'Serious hygiene issue in the dining area, kitchen or washroom',
  'Foreign object found in food',
  'Serious allergen or special-request failure',
  'Major pricing or billing issue',
  'Serious staff misconduct',
  'Customer safety issue',
]

/**
 * A stage whose every scored question is gated behind one switch — complaint
 * handling on a visit where nothing went wrong, cash handling on a card payment.
 *
 * It is excluded from the "weights sum to 100" rule, because it is not part of
 * every visit: when it does apply, the engine renormalises over the stages that
 * were actually scored and it takes its share. One definition, used by the
 * authoring guard and by every screen that draws the stage table.
 */
export function isConditionalStage(section: { questions: { weight?: number; when?: unknown }[] }): boolean {
  const scored = section.questions.filter((q) => (q.weight ?? 1) > 0)
  return scored.length > 0 && scored.every((q) => q.when)
}

/** The same question, asked of a built template rather than a blueprint. */
export function isConditionalSection(section: Section, questions: { sectionId: string; weight: number; condition?: unknown }[]): boolean {
  const scored = questions.filter((q) => q.sectionId === section.id && q.weight > 0)
  return scored.length > 0 && scored.every((q) => q.condition)
}
