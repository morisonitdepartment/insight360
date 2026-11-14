import type {
  AnswerValue,
  CategoryKey,
  CategoryScores,
  KpiConfig,
  Question,
  RiskRating,
  ScoreThreshold,
  Section,
  TimingRole,
  VisitAnswer,
} from '@/types'
import { CLIENT } from '@/config/client'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * INSIGHT360 Scoring Engine
 *
 *   Question score (0..1)
 *     → Section score (weighted by question weight)
 *       → Category score (weighted by section question-weight totals)
 *         → Visit score (weighted by KPI category weights)
 *           → Outlet score (latest approved visit)  → Brand → Organisation
 *
 * Service sequence templates give each section a stage weight. There the visit
 * score is the stage-weighted mean of the section scores instead, while the
 * category scores are still computed as the cross-concept roll-up the dashboards
 * read. Questions mapped to main KPIs also produce per-visit KPI values.
 *
 * Critical questions override the normal score: any failed critical question forces
 * the visit risk rating to "Critical" regardless of the numeric result.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const CATEGORY_KEYS: CategoryKey[] = [
  'customer_experience',
  'service_speed',
  'operational_compliance',
  'product_environment',
  'upselling_sales',
  'safety_entertainment',
]

/** Whether this client's estate includes entertainment venues at all. */
const HAS_ENTERTAINMENT = CLIENT.portfolio.brands.some((b) => b.segment === 'Entertainment')

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  customer_experience: 'Customer Experience',
  service_speed: 'Service Speed',
  operational_compliance: 'Operational Compliance',
  product_environment: 'Product & Environment',
  upselling_sales: 'Upselling & Sales',
  // The category key is fixed, but the word "Entertainment" is only true of an
  // estate that has entertainment venues. On a food-only estate the same
  // category is the food-safety score, and should say so wherever it appears.
  safety_entertainment: HAS_ENTERTAINMENT ? 'Safety & Entertainment' : 'Food Safety',
}

/** Executive KPI card label for the safety category, with the same split. */
export const SAFETY_KPI_LABEL = HAS_ENTERTAINMENT ? 'Entertainment Safety Compliance' : 'Food Safety Compliance'

export const CATEGORY_SHORT: Record<CategoryKey, string> = {
  customer_experience: 'Cust. Exp.',
  service_speed: 'Speed',
  operational_compliance: 'Compliance',
  product_environment: 'Product/Env.',
  upselling_sales: 'Upselling',
  safety_entertainment: 'Safety',
}

export const DEFAULT_THRESHOLDS: ScoreThreshold[] = [
  { label: 'Excellent', min: 90, max: 100, description: 'Consistently exceeds brand standards' },
  { label: 'Good', min: 80, max: 89.99, description: 'Meets standards with minor gaps' },
  { label: 'Needs Improvement', min: 70, max: 79.99, description: 'Below standard; corrective action recommended' },
  { label: 'Critical', min: 0, max: 69.99, description: 'Immediate intervention required' },
]

export function riskFromScore(score: number | null | undefined, thresholds: ScoreThreshold[] = DEFAULT_THRESHOLDS): RiskRating | 'Not Assessed' {
  if (score === null || score === undefined || Number.isNaN(score)) return 'Not Assessed'
  const t = thresholds.find((th) => score >= th.min && score <= th.max + 0.0049)
  return t?.label ?? 'Critical'
}

/**
 * Whether the shopper may mark this question N/A.
 *
 * Any question may be N/A — a visit always meets situations the questionnaire
 * did not foresee — except two kinds: a critical question, where N/A would let
 * a food-safety failure go unrecorded, and a calculated duration, which follows
 * its two clock times (N/A when either of them is). Where the questionnaire did not plan for N/A
 * (`allowNA` false) the shopper must say why; see `naNeedsReason`.
 */
export function naAllowed(q: Question): boolean {
  return q.allowNA || !q.critical
}

/** Whether the shopper ticks N/A themselves. A calculated duration is N/A only when one of its clock times is. */
export function naSelectable(q: Question): boolean {
  return naAllowed(q) && !q.derivedFrom
}

/** N/A on a question that was not written to allow it must be explained. */
export function naNeedsReason(q: Question): boolean {
  return !q.allowNA && naSelectable(q)
}

/** Scores a single answer to 0..1. Returns null when the question is informational or unanswered / N/A. */
export function scoreQuestion(q: Question, value: AnswerValue, na: boolean): number | null {
  if (na && naAllowed(q)) return null
  if (value === null || value === undefined || value === '') return null
  switch (q.type) {
    case 'yes_no':
      return value === true || value === 'Yes' ? 1 : 0
    case 'pass_fail':
      return value === true || value === 'Pass' ? 1 : 0
    case 'rating_5': {
      const v = Number(value)
      return Number.isFinite(v) ? Math.max(0, Math.min(1, (v - 1) / 4)) : null
    }
    case 'rating_10': {
      const v = Number(value)
      return Number.isFinite(v) ? Math.max(0, Math.min(1, (v - 1) / 9)) : null
    }
    case 'multiple_choice': {
      const opts = q.options ?? []
      const idx = opts.indexOf(String(value))
      if (idx < 0 || opts.length < 2) return null
      // Options are ordered best → worst
      return 1 - idx / (opts.length - 1)
    }
    case 'numeric':
    case 'time': {
      const v = Number(value)
      if (!Number.isFinite(v)) return null
      const threshold = q.threshold ?? 0
      if (threshold <= 0) return null
      if (v <= threshold) return 1
      // Linear decay: 2x threshold → 0
      return Math.max(0, 1 - (v - threshold) / threshold)
    }
    case 'clock':
    case 'photo':
    case 'video':
    case 'text':
    default:
      return null
  }
}

export function isQuestionAnswered(q: Question, a: VisitAnswer | undefined): boolean {
  if (!a) return false
  if (a.na && naAllowed(q)) return true
  if (q.type === 'photo' || q.type === 'video') return a.evidenceIds.length > 0
  if (q.type === 'text' || q.type === 'clock') return typeof a.value === 'string' && a.value.trim().length > 0
  return a.value !== null && a.value !== undefined && a.value !== ''
}

export interface SectionScore {
  sectionId: string
  score: number | null
  weightAnswered: number
  answered: number
  total: number
}

export interface VisitScoreResult {
  overall: number | null
  categoryScores: CategoryScores | null
  sectionScores: SectionScore[]
  criticalFailures: string[]
  risk: RiskRating | 'Not Assessed'
  answeredMandatory: number
  totalMandatory: number
  progress: number
  /** True when the visit score came from stage weights rather than KPI category weights. */
  stageWeighted: boolean
  /** Section id → stage score, for sequence templates; null otherwise. */
  stageScores: Record<string, number | null> | null
  /** Main KPI key → value in the KPI's unit; null when no question maps to a KPI. */
  kpiScores: Record<string, number | null> | null
}

/** KPI keys the timing-chain legs report under, and the derived total. */
export const TIMING_KPI_KEY: Record<TimingRole, string> = {
  queue: 'queue_time',
  order: 'order_taking_time',
  preparation: 'preparation_time',
}
export const TOTAL_TIME_KEY = 'total_service_time'
/** KPI keys that store the raw 1-10 answer rather than a 0-100 score. */
export const SATISFACTION_KEYS = new Set(['csat', 'nps', 'return_likelihood'])

/** `HH:MM` → minutes since midnight, or null for anything else. */
export function clockMinutes(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * The longest gap a backwards pair of stamps may be read as crossing midnight.
 * Anything longer is a typing slip, not a six-hour wait.
 */
const MAX_OVERNIGHT_MINUTES = 6 * 60

/**
 * Minutes between two `HH:MM` stamps. A service that crosses midnight — a late
 * dinner billed at 00:10 against an order at 23:40 — is taken as the next day
 * (30 minutes). A backwards pair that cannot be a short overnight gap is an
 * entry mistake and gives null: seated 19:17, approached 19:14 used to come
 * out as 1,437 minutes and fail the standard by nearly a day.
 */
export function minutesBetween(from: unknown, to: unknown): number | null {
  const a = clockMinutes(from)
  const b = clockMinutes(to)
  if (a === null || b === null) return null
  if (b >= a) return b - a
  const overnight = b + 24 * 60 - a
  return overnight <= MAX_OVERNIGHT_MINUTES ? overnight : null
}

/**
 * Why a calculated duration has no value although both of its clock times are
 * filled in — the later stamp is before the earlier one — or null when there
 * is nothing wrong. Shown under the duration and blocks submission, so the
 * shopper corrects the stamp instead of submitting an impossible time.
 */
export function clockOrderProblem(q: Question, questions: Question[], answers: VisitAnswer[]): string | null {
  if (!q.derivedFrom) return null
  const from = questions.find((x) => x.code === q.derivedFrom!.from)
  const to = questions.find((x) => x.code === q.derivedFrom!.to)
  if (!from || !to) return null
  const fv = answers.find((a) => a.questionId === from.id)?.value
  const tv = answers.find((a) => a.questionId === to.id)?.value
  if (clockMinutes(fv) === null || clockMinutes(tv) === null || minutesBetween(fv, tv) !== null) return null
  return `"${to.text}" (${String(tv)}) is earlier than "${from.text}" (${String(fv)}). Check both clock times.`
}

/**
 * Fills in every question whose minutes are calculated from two clock stamps.
 *
 * The brief asks for elapsed times to be worked out automatically wherever the
 * shopper has recorded the stamps, and one function doing it keeps the three
 * places that need the answer — the assessment screen, the seeded data and any
 * recomputation on load — from drifting apart. Returns only the answers it
 * changed, so a caller can merge them without touching anything else.
 */
export function deriveTimedAnswers(questions: Question[], answers: VisitAnswer[], visitId: string): VisitAnswer[] {
  const derived = questions.filter((q) => q.derivedFrom)
  if (!derived.length) return []
  const byCode = new Map(questions.map((q) => [q.code, q]))
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]))
  const out: VisitAnswer[] = []
  for (const q of derived) {
    const from = byCode.get(q.derivedFrom!.from)
    const to = byCode.get(q.derivedFrom!.to)
    const fromAnswer = from && byQuestion.get(from.id)
    const toAnswer = to && byQuestion.get(to.id)
    // No appetizer, no appetizer time: a clock marked N/A makes the duration N/A.
    const na = !!(fromAnswer?.na || toAnswer?.na)
    const value = na ? null : minutesBetween(fromAnswer?.value, toAnswer?.value)
    const current = byQuestion.get(q.id)
    if ((current?.value ?? null) === (value ?? null) && (current?.na ?? false) === na) continue
    const base = current ?? { id: `${visitId}-${q.id}`, visitId, questionId: q.id, value: null, na: false, comment: '', evidenceIds: [], score: null }
    out.push({ ...base, value, na, score: scoreQuestion(q, value, na) })
  }
  return out
}

/**
 * The questions a visit actually asks, given the answers so far.
 *
 * A question with a `condition` is asked only when the sibling it names was
 * answered with the given value; unanswered or N/A parents hide it. Scoring,
 * progress, the assessment screen and the demo generator all go through this
 * one filter so they can never disagree about what was asked.
 */
export function visibleQuestions(questions: Question[], answers: VisitAnswer[]): Question[] {
  if (!questions.some((q) => q.condition)) return questions
  const byCode = new Map(questions.map((q) => [q.code, q]))
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]))
  return questions.filter((q) => {
    if (!q.condition) return true
    const parent = byCode.get(q.condition.questionCode)
    if (!parent) return true
    const a = byQuestion.get(parent.id)
    if (!a || a.na) return false
    return a.value === q.condition.equals
  })
}

export function computeVisitScores(
  questions: Question[],
  sections: Section[],
  answers: VisitAnswer[],
  kpiConfig: KpiConfig[],
  thresholds: ScoreThreshold[] = DEFAULT_THRESHOLDS,
): VisitScoreResult {
  questions = visibleQuestions(questions, answers)
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]))
  const sectionMap = new Map(sections.map((s) => [s.id, s]))
  const sectionScores: SectionScore[] = []
  const criticalFailures: string[] = []
  let answeredMandatory = 0
  let totalMandatory = 0
  // Main KPI accumulators: scores average; satisfaction and timings keep the raw answer.
  const kpiAcc = new Map<string, { sum: number; n: number }>()
  const kpiRaw: Record<string, number | null> = {}
  let anyKpi = false

  for (const section of sections) {
    const qs = questions.filter((q) => q.sectionId === section.id)
    let weighted = 0
    let weightSum = 0
    let answered = 0
    for (const q of qs) {
      const a = byQuestion.get(q.id)
      const scorable = q.weight > 0 && q.type !== 'text' && q.type !== 'photo' && q.type !== 'video'
      if (scorable) totalMandatory++
      if (isQuestionAnswered(q, a)) {
        answered++
        if (scorable) answeredMandatory++
      }
      if (!a) continue
      const s = scoreQuestion(q, a.value, a.na)
      if (s === null) continue
      if (q.critical && s < 0.5) criticalFailures.push(q.id)
      if (q.timingRole) {
        anyKpi = true
        kpiRaw[TIMING_KPI_KEY[q.timingRole]] = Number(a.value)
      }
      for (const key of q.kpiKeys ?? []) {
        anyKpi = true
        // A time question reports its minutes; satisfaction reports the 1-10 answer.
        if (q.type === 'time' || SATISFACTION_KEYS.has(key)) {
          kpiRaw[key] = Number(a.value)
          continue
        }
        const acc = kpiAcc.get(key) ?? { sum: 0, n: 0 }
        acc.sum += s
        acc.n++
        kpiAcc.set(key, acc)
      }
      // Weight-0 questions are informational: they feed KPIs but not the stage score.
      weighted += s * q.weight
      weightSum += q.weight
    }
    sectionScores.push({
      sectionId: section.id,
      score: weightSum > 0 ? (weighted / weightSum) * 100 : null,
      weightAnswered: weightSum,
      answered,
      total: qs.length,
    })
  }

  // Category = weighted average of section scores by answered weight
  const catAcc: Record<string, { w: number; s: number }> = {}
  for (const ss of sectionScores) {
    if (ss.score === null) continue
    const cat = sectionMap.get(ss.sectionId)?.category
    if (!cat) continue
    catAcc[cat] = catAcc[cat] ?? { w: 0, s: 0 }
    catAcc[cat].w += ss.weightAnswered
    catAcc[cat].s += ss.score * ss.weightAnswered
  }
  const categoryScores = {} as CategoryScores
  let any = false
  for (const key of CATEGORY_KEYS) {
    const acc = catAcc[key]
    if (acc && acc.w > 0) {
      categoryScores[key] = acc.s / acc.w
      any = true
    } else {
      categoryScores[key] = Number.NaN
    }
  }

  // Visit = stage-weighted mean of the section scores on a service sequence template,
  // otherwise the KPI-weighted average across the categories present in this assessment.
  const stageWeighted = sections.some((s) => s.stageWeight !== undefined)
  let overall: number | null = null
  let stageScores: Record<string, number | null> | null = null
  if (stageWeighted) {
    stageScores = {}
    let ws = 0
    let acc = 0
    for (const ss of sectionScores) {
      stageScores[ss.sectionId] = ss.score
      const w = sectionMap.get(ss.sectionId)?.stageWeight ?? 0
      if (ss.score === null || w <= 0) continue
      ws += w
      acc += ss.score * w
    }
    overall = ws > 0 ? acc / ws : null
  } else if (any) {
    let ws = 0
    let acc = 0
    for (const k of kpiConfig) {
      const v = categoryScores[k.key]
      if (Number.isNaN(v)) continue
      ws += k.weight
      acc += v * k.weight
    }
    overall = ws > 0 ? acc / ws : null
  }

  let kpiScores: Record<string, number | null> | null = null
  if (anyKpi) {
    kpiScores = { ...kpiRaw }
    for (const [key, acc] of kpiAcc) kpiScores[key] = acc.n ? (acc.sum / acc.n) * 100 : null
    const legs = Object.values(TIMING_KPI_KEY).map((k) => kpiScores![k])
    if (legs.every((v): v is number => typeof v === 'number' && Number.isFinite(v))) kpiScores[TOTAL_TIME_KEY] = legs.reduce((a, b) => a + b, 0)
  }

  let risk = riskFromScore(overall, thresholds)
  if (criticalFailures.length && overall !== null) risk = 'Critical'

  return {
    overall,
    categoryScores: any ? categoryScores : null,
    sectionScores,
    criticalFailures,
    risk,
    answeredMandatory,
    totalMandatory,
    progress: totalMandatory ? Math.round((answeredMandatory / totalMandatory) * 100) : 0,
    stageWeighted,
    stageScores,
    kpiScores,
  }
}

/** Rounds every stored stage / KPI value to one decimal, keeping nulls; undefined when there is nothing to store. */
export function roundScoreMap(map: Record<string, number | null> | null): Record<string, number | null> | undefined {
  if (!map) return undefined
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v === null ? null : Math.round(v * 10) / 10]))
}

/** Aggregates category scores across many visits (simple mean per category, ignoring NaN). */
export function averageCategoryScores(list: Array<CategoryScores | null>): CategoryScores | null {
  const out = {} as CategoryScores
  let any = false
  for (const key of CATEGORY_KEYS) {
    const vals = list.map((c) => c?.[key]).filter((v): v is number => typeof v === 'number' && !Number.isNaN(v))
    out[key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : Number.NaN
    if (vals.length) any = true
  }
  return any ? out : null
}

export function weightedOverall(cat: CategoryScores | null, kpiConfig: KpiConfig[]): number | null {
  if (!cat) return null
  let ws = 0
  let acc = 0
  for (const k of kpiConfig) {
    const v = cat[k.key]
    if (Number.isNaN(v)) continue
    ws += k.weight
    acc += v * k.weight
  }
  return ws > 0 ? acc / ws : null
}
