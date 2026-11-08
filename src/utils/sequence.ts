import type { KpiKind, Question, Section, SequenceKpi, TimingRole } from '@/types'
import { TIMING_KPI_KEY, TOTAL_TIME_KEY } from '@/utils/scoring'

/**
 * Presentation helpers for service sequence templates: the stage table every
 * surface draws, and one place that knows how each kind of KPI is written.
 */

export const KPI_KIND_LABEL: Record<KpiKind, string> = {
  weighted: 'Score',
  derived: 'Compliance',
  timing: 'Timing',
  satisfaction: 'Satisfaction',
}

export const TIMING_LABEL: Record<TimingRole, string> = {
  queue: 'Queue',
  order: 'Order',
  preparation: 'Preparation',
}

/** A stage weight, written without a trailing `.0`: `14.2`, `5`, `7.6`. */
export function weightText(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : weight.toFixed(1)
}

export interface StageRow {
  section: Section
  /** Percent of the visit score this stage carries. */
  weight: number
  questions: number
  score: number | null
  /** Points this stage contributed to the visit score; the rows sum to the visit score. */
  contribution: number | null
}

/**
 * The stages of a sequence template in order. With `stageScores`, each row also
 * carries its contribution, renormalised over the stages that were scored —
 * exactly as the scoring engine computes the visit score — so the column total
 * equals the figure in the report header.
 */
export function stageRows(sections: Section[], questions: Question[], stageScores?: Record<string, number | null>): StageRow[] {
  const ordered = [...sections].filter((s) => s.stageWeight !== undefined).sort((a, b) => a.order - b.order)
  const scoredWeight = ordered.reduce((n, s) => n + (stageScores && stageScores[s.id] !== null && stageScores[s.id] !== undefined ? (s.stageWeight ?? 0) : 0), 0)
  return ordered.map((section) => {
    const weight = section.stageWeight ?? 0
    const score = stageScores?.[section.id] ?? null
    return {
      section,
      weight,
      questions: questions.filter((q) => q.sectionId === section.id).length,
      score,
      contribution: score === null || scoredWeight === 0 ? null : (weight * score) / scoredWeight,
    }
  })
}

/**
 * A KPI value in its own unit. Per visit, satisfaction is the 1-10 answer; across
 * a portfolio CSAT is the mean answer and NPS is the promoter-minus-detractor score.
 */
export function formatKpiValue(kpi: SequenceKpi, value: number | null | undefined, scope: 'visit' | 'portfolio'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  switch (kpi.kind) {
    case 'timing':
      return `${value.toFixed(1)} min`
    case 'satisfaction':
      if (kpi.key === 'nps' && scope === 'portfolio') return `${value > 0 ? '+' : ''}${Math.round(value)}`
      return `${value.toFixed(1)} / 10`
    default:
      return `${value.toFixed(1)}%`
  }
}

/** `Queue 4.0 + Order 1.5 + Preparation 6.0 = 11.5 min`, or null when no leg has been timed yet. */
export function timingChainText(chain: TimingRole[] | undefined, kpiScores: Record<string, number | null> | null | undefined): string | null {
  if (!chain?.length || !kpiScores) return null
  const legs = chain.map((role) => ({ role, value: kpiScores[TIMING_KPI_KEY[role]] }))
  if (legs.every((l) => l.value === null || l.value === undefined)) return null
  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(1))
  const total = kpiScores[TOTAL_TIME_KEY]
  return `${legs.map((l) => `${TIMING_LABEL[l.role]} ${fmt(l.value)}`).join(' + ')} = ${fmt(total)} min`
}
