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
  /** Must be answered before submission even when unscored (mandatory visit fields). */
  required?: boolean
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
  /**
   * Taken out of the questionnaire, with the reason. A retired question is not
   * built, but it keeps its place: question ids and codes are positional
   * (`ORD.3`), and answers already saved on the live system point at those ids,
   * so deleting the line would shift every later question onto someone else's
   * answer.
   */
  retired?: string
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

/**
 * The standard restroom inspection — part of every template, so every branch of
 * every brand is inspected against the same 21 checks (operator's standard,
 * 14 Nov 2026). Only the last question names the standard the restroom is held
 * to: "a fine-dining restaurant", "a casual-dining restaurant of Bennigan's
 * standard". Brand frameworks place it as a weighted stage; a template started
 * in the admin gets it unweighted (see `RESTROOM_STAGE_CODE` in actions).
 */
export const RESTROOM_STAGE_CODE = 'WC'
export const RESTROOM_TITLE = 'Toilet / Restroom Cleanliness'
export const RESTROOM_DESCRIPTION = 'A full restroom inspection. Photograph anything that falls short.'

export function restroomQuestions(standard: string): QuestionBlueprint[] {
  return [
    { text: 'Was the restroom clean?', type: 'yes_no', weight: 3, evidence: true, tag: 'washroom', kpi: ['restroom'] },
    { text: 'Was the toilet bowl clean?', type: 'yes_no', weight: 3, kpi: ['restroom'] },
    { text: 'Was the toilet seat clean?', type: 'yes_no', weight: 3, kpi: ['restroom'] },
    { text: 'Was the toilet floor clean?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: 'Was the floor dry?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: 'Was the washbasin clean?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: 'Was the mirror clean?', type: 'yes_no', weight: 1, kpi: ['restroom'] },
    { text: 'Was hand soap available?', type: 'yes_no', weight: 3, tag: 'hand_hygiene', kpi: ['restroom'] },
    { text: 'Was the soap dispenser adequately filled?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: 'Was hand sanitizer available, where applicable?', type: 'yes_no', weight: 1, na: true, kpi: ['restroom'] },
    { text: 'Was the hand sanitizer adequately filled?', type: 'yes_no', weight: 1, na: true, kpi: ['restroom'] },
    { text: 'Was toilet tissue available?', type: 'yes_no', weight: 3, kpi: ['restroom'] },
    { text: 'Was hand tissue / paper towel available?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: 'Was the tissue roll adequately stocked?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: 'Was the exhaust fan clean?', type: 'yes_no', weight: 1, kpi: ['restroom'] },
    { text: 'Was the exhaust fan operational?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: 'Was the toilet free from bad or unpleasant smells?', type: 'yes_no', weight: 3, tag: 'hygiene', kpi: ['restroom'] },
    { text: 'Were restroom lights operational?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: 'Was the waste bin clean?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: 'Was the waste bin not overflowing?', type: 'yes_no', weight: 2, kpi: ['restroom'] },
    { text: `Was the restroom overall suitable for ${standard}?`, type: 'rating_5', weight: 3, kpi: ['restroom'] },
  ]
}

/** The restroom inspection as a weighted stage of a brand framework. */
export const restroomStage = (stageWeight: number, standard: string, description = RESTROOM_DESCRIPTION): SectionBlueprint =>
  stage(RESTROOM_STAGE_CODE, RESTROOM_TITLE, 'Restroom Cleanliness', stageWeight, 'safety_entertainment', description, restroomQuestions(standard))

/** The KPI every restroom question feeds; brand frameworks list it among their main KPIs. */
export const RESTROOM_KPI = { key: 'restroom', label: 'Restroom Cleanliness Score', kind: 'weighted' } as const

/**
 * The dine-in red flags, in the words of the Bennigan's brief. Shebestan's brief
 * names none, so the same ten apply there (decided 14 Nov 2026); each is backed by
 * a critical question in both questionnaires.
 */
export const RED_FLAGS_DINE_IN = [
  'Serious food-safety or hygiene issue',
  'Foreign object in food',
  'Food served clearly undercooked or unsafe',
  'Rude, aggressive, discriminatory or seriously unprofessional staff behaviour',
  'Major order error not corrected',
  'Incorrect bill or incorrect cash change not corrected',
  'Complaint ignored or dismissed',
  'Excessive unexplained service delay',
  'Damaged or chipped serving ware creating a safety risk',
  'Seriously dirty dining area or table at the time of service',
]

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
export function isConditionalStage(section: { questions: { weight?: number; when?: unknown; retired?: string }[] }): boolean {
  const scored = section.questions.filter((q) => !q.retired && (q.weight ?? 1) > 0)
  return scored.length > 0 && scored.every((q) => q.when)
}

/** The same question, asked of a built template rather than a blueprint. */
export function isConditionalSection(section: Section, questions: { sectionId: string; weight: number; condition?: unknown }[]): boolean {
  const scored = questions.filter((q) => q.sectionId === section.id && q.weight > 0)
  return scored.length > 0 && scored.every((q) => q.condition)
}
