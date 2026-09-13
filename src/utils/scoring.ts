import type {
  AnswerValue,
  CategoryKey,
  CategoryScores,
  KpiConfig,
  Question,
  RiskRating,
  ScoreThreshold,
  Section,
  VisitAnswer,
} from '@/types'

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

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  customer_experience: 'Customer Experience',
  service_speed: 'Service Speed',
  operational_compliance: 'Operational Compliance',
  product_environment: 'Product & Environment',
  upselling_sales: 'Upselling & Sales',
  safety_entertainment: 'Safety & Entertainment',
}

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

/** Scores a single answer to 0..1. Returns null when the question is informational or unanswered / N/A. */
export function scoreQuestion(q: Question, value: AnswerValue, na: boolean): number | null {
  if (na && q.allowNA) return null
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
    case 'photo':
    case 'video':
    case 'text':
    default:
      return null
  }
}

export function isQuestionAnswered(q: Question, a: VisitAnswer | undefined): boolean {
  if (!a) return false
  if (a.na && q.allowNA) return true
  if (q.type === 'photo' || q.type === 'video') return a.evidenceIds.length > 0
  if (q.type === 'text') return typeof a.value === 'string' && a.value.trim().length > 0
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
}

export function computeVisitScores(
  questions: Question[],
  sections: Section[],
  answers: VisitAnswer[],
  kpiConfig: KpiConfig[],
  thresholds: ScoreThreshold[] = DEFAULT_THRESHOLDS,
): VisitScoreResult {
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]))
  const sectionMap = new Map(sections.map((s) => [s.id, s]))
  const sectionScores: SectionScore[] = []
  const criticalFailures: string[] = []
  let answeredMandatory = 0
  let totalMandatory = 0

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

  // Visit = KPI-weighted average across categories present in this assessment
  let overall: number | null = null
  if (any) {
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
  }
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
