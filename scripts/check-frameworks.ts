/*
 * check-frameworks.ts — proves every questionnaire can actually be scored.
 *
 *   npm run check:frameworks                       # the default client
 *   VITE_CLIENT=hermanos npm run check:frameworks  # another client
 *
 * WHY THIS EXISTS
 *
 * A mystery-shopping score is only as trustworthy as the weakest link between a
 * question and the number it produces. Most ways of breaking that link are
 * SILENT: the app renders, the visit submits, a score appears — and a criterion
 * the client is paying for contributed nothing, or a KPI reads in the wrong unit.
 * Nothing crashes, so nothing tells you.
 *
 * Four real examples this catches, all of them invisible at runtime:
 *
 *   1. A weighted `time` question with no threshold. scoreQuestion returns null
 *      when `threshold <= 0`, and a null score is skipped before it reaches the
 *      weight sum — so the question is dropped from the stage entirely while
 *      still looking authoritative on screen.
 *   2. A KPI fed by a `time` question but declared anything other than 'timing'.
 *      The engine stores raw minutes; formatKpiValue prints every non-timing,
 *      non-satisfaction kind as a percentage. "15.0 min" shows as "15.0%".
 *   3. A gate written `equals: 'Yes'` on a yes/no parent. The UI stores a
 *      boolean and visibleQuestions compares with ===, so the gated question
 *      never appears to any shopper, ever.
 *   4. A critical question on a type scoreQuestion cannot score (clock, text,
 *      photo). `q.critical && s < 0.5` never runs, so the critical can never fire.
 *
 * buildTemplates already throws on the structural slips (weights off 100, a gate
 * or a clock stamp naming a key that does not exist). This file covers the ones
 * that are well-formed but meaningless, and prints the stage and threshold
 * tables so a human can check the numbers against the client's brief.
 *
 * Exits 1 on any error, 0 when only warnings remain.
 */
import { buildTemplates } from '@/data/templates'
import { isConditionalSection } from '@/data/templateKit'
import { SATISFACTION_KEYS, TIMING_KPI_KEY, TOTAL_TIME_KEY } from '@/utils/scoring'
import { CLIENT } from '@/config/client'
import type { Question, QuestionType, Section } from '@/types'

/** The types scoreQuestion can turn into a number. Anything else scores null. */
const SCOREABLE = new Set<QuestionType>(['yes_no', 'pass_fail', 'rating_5', 'rating_10', 'multiple_choice', 'numeric', 'time'])
/** Types whose stored answer is a stable value a gate can compare with ===. */
const GATEABLE = new Set<QuestionType>(['yes_no', 'pass_fail', 'multiple_choice'])

interface Problem {
  level: 'error' | 'warning'
  template: string
  where: string
  message: string
}
const problems: Problem[] = []
const fail = (template: string, where: string, message: string) => problems.push({ level: 'error', template, where, message })
const warn = (template: string, where: string, message: string) => problems.push({ level: 'warning', template, where, message })

const { templates, sections, questions, tags } = buildTemplates()
const pct = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

console.log(`\n${'='.repeat(78)}\n  ${CLIENT.name} — questionnaire integrity\n${'='.repeat(78)}`)

for (const t of templates) {
  const secs = sections.filter((s) => s.templateId === t.id).sort((a, b) => a.order - b.order)
  const qsFor = (s: Section) => questions.filter((q) => q.sectionId === s.id).sort((a, b) => a.order - b.order)
  const tq = secs.flatMap(qsFor)
  const byCode = new Map(tq.map((q) => [q.code, q]))
  /** Document order across the whole template, so "before" and "after" mean something. */
  const rank = new Map(tq.map((q, i) => [q.code, i]))

  // ── Stage weights ────────────────────────────────────────────────────────
  if (t.sequence) {
    const conditional = secs.filter((s) => isConditionalSection(s, questions))
    const fixed = secs.filter((s) => !conditional.includes(s))
    const total = fixed.reduce((n, s) => n + (s.stageWeight ?? 0), 0)

    console.log(`\n${t.code}  ${t.name}`)
    console.log(`  ${t.sequence.industry} · ${t.sequence.serviceModel} · ${t.sequence.visitMode}`)
    console.log(`  ${'─'.repeat(74)}`)
    console.log(`  ${'Stage'.padEnd(34)}${'Weight'.padStart(8)}${'Qs'.padStart(5)}${'Scored'.padStart(8)}  KPI`)
    for (const s of secs) {
      const qs = qsFor(s)
      const scored = qs.filter((q) => q.weight > 0 && SCOREABLE.has(q.type)).length
      const cond = conditional.includes(s) ? ' †' : ''
      const w = s.stageWeight === undefined ? '—' : `${pct(s.stageWeight)}%`
      console.log(`  ${(s.code + ' ' + s.title).slice(0, 33).padEnd(34)}${(w + cond).padStart(8)}${String(qs.length).padStart(5)}${String(scored).padStart(8)}  ${s.kpiName ?? ''}`)
    }
    console.log(`  ${'─'.repeat(74)}`)
    console.log(`  ${'Weighted stages'.padEnd(34)}${(pct(total) + '%').padStart(8)}${String(tq.length).padStart(5)}`)
    if (conditional.length) {
      console.log(`  † conditional — scored only when raised, then renormalised: ${conditional.map((s) => `${s.code} ${pct(s.stageWeight ?? 0)}%`).join(', ')}`)
    }
    // buildTemplates throws before we get here, so this is belt and braces.
    if (Math.round(total * 10) !== 1000) fail(t.code, 'stage weights', `weighted stages sum to ${pct(total)}, not 100`)

    for (const s of secs) {
      const qs = qsFor(s)
      const scorable = qs.filter((q) => q.weight > 0 && SCOREABLE.has(q.type))
      if ((s.stageWeight ?? 0) > 0 && scorable.length === 0) {
        fail(t.code, s.code, `carries ${pct(s.stageWeight ?? 0)}% but has no scorable weighted question, so it can never score`)
      }
      if (s.stageWeight === 0 && qs.some((q) => q.weight > 0)) {
        const which = qs.filter((q) => q.weight > 0).map((q) => q.code)
        fail(t.code, s.code, `is an unweighted stage, so the weights on ${which.join(', ')} are silently ignored`)
      }
    }
  }

  // ── Can each question actually be scored? ────────────────────────────────
  for (const q of tq) {
    const at = `${q.code}`
    if (q.weight > 0 && !SCOREABLE.has(q.type)) {
      fail(t.code, at, `weight ${q.weight} on a '${q.type}' question, which scoreQuestion never scores — the weight is dead`)
    }
    if (q.weight > 0 && (q.type === 'time' || q.type === 'numeric') && !(q.threshold && q.threshold > 0)) {
      fail(t.code, at, `weighted '${q.type}' question with no threshold — scoreQuestion returns null and the question is dropped from the stage score`)
    }
    if (q.weight > 0 && q.type === 'multiple_choice' && (q.options?.length ?? 0) < 2) {
      fail(t.code, at, `weighted multiple_choice with ${q.options?.length ?? 0} option(s) — needs at least 2 to form a scale`)
    }
    if (q.critical && !SCOREABLE.has(q.type)) {
      fail(t.code, at, `marked critical on a '${q.type}' question, which never produces a score, so the critical can never fire`)
    }
    if (q.critical && !q.commentRequired && !q.commentOnFail) {
      warn(t.code, at, 'critical with no comment required — a fired critical would carry no explanation')
    }
  }

  // ── Gates ────────────────────────────────────────────────────────────────
  for (const q of tq.filter((x) => x.condition)) {
    const cond = q.condition!
    const parent = byCode.get(cond.questionCode)
    if (!parent) {
      fail(t.code, q.code, `gates on ${cond.questionCode}, which is not in this questionnaire`)
      continue
    }
    const at = `${q.code} → ${parent.code}`
    if (!GATEABLE.has(parent.type)) {
      warn(t.code, at, `gates on a '${parent.type}' answer; only yes_no, pass_fail and multiple_choice store a value a gate can match exactly`)
    }
    if ((parent.type === 'yes_no' || parent.type === 'pass_fail') && typeof cond.equals !== 'boolean') {
      fail(t.code, at, `gate expects ${JSON.stringify(cond.equals)} but a ${parent.type} answer is stored as a boolean — the question would never appear`)
    }
    if (parent.type === 'multiple_choice' && !(parent.options ?? []).includes(String(cond.equals))) {
      fail(t.code, at, `gate expects ${JSON.stringify(cond.equals)}, which is not one of its options (${(parent.options ?? []).join(' / ')}) — the question would never appear`)
    }
    if ((rank.get(parent.code) ?? 0) > (rank.get(q.code) ?? 0)) {
      fail(t.code, at, 'gate is asked after the question it controls, so the shopper reaches the gated question first')
    }
    if (parent.allowNA) {
      warn(t.code, at, 'gate allows N/A; an N/A answer hides the gated question, which may be the intent or may lose a scored criterion')
    }
  }

  // ── Calculated durations ─────────────────────────────────────────────────
  for (const q of tq.filter((x) => x.derivedFrom)) {
    const { from, to } = q.derivedFrom!
    const a = byCode.get(from)
    const b = byCode.get(to)
    const at = `${q.code}`
    if (q.type !== 'time') fail(t.code, at, `is calculated from two stamps but typed '${q.type}'; only 'time' is read as minutes`)
    for (const [code, stamp] of [[from, a] as const, [to, b] as const]) {
      if (!stamp) fail(t.code, at, `times against ${code}, which is not in this questionnaire`)
      else if (stamp.type !== 'clock') fail(t.code, at, `times against ${code}, which is a '${stamp.type}' question, not a clock stamp`)
    }
    if (a && b && (rank.get(a.code) ?? 0) > (rank.get(b.code) ?? 0)) {
      warn(t.code, at, `measures ${from} → ${to}, but ${from} is asked after ${to}`)
    }
  }

  // ── Main KPIs: declared, fed, and in the right unit ──────────────────────
  if (t.sequence) {
    const declared = t.sequence.mainKpis
    const seen = new Set<string>()
    for (const k of declared) {
      if (seen.has(k.key)) fail(t.code, `KPI ${k.key}`, 'declared twice in mainKpis')
      seen.add(k.key)
    }

    /** Which question types feed each KPI key — the unit the engine will store. */
    const feeders = new Map<string, Question[]>()
    for (const q of tq) for (const key of q.kpiKeys ?? []) feeders.set(key, [...(feeders.get(key) ?? []), q])
    const roleQs = new Map<string, Question[]>()
    for (const q of tq.filter((x) => x.timingRole)) roleQs.set(q.timingRole!, [...(roleQs.get(q.timingRole!) ?? []), q])

    for (const [key, qs] of feeders) {
      if (!seen.has(key)) {
        fail(t.code, `KPI ${key}`, `is mapped on ${qs.map((q) => q.code).join(', ')} but not declared in mainKpis, so nothing ever displays it`)
      }
    }

    for (const k of declared) {
      const fed = feeders.get(k.key) ?? []
      const timingRole = Object.entries(TIMING_KPI_KEY).find(([, v]) => v === k.key)?.[0]
      const isTotal = k.key === TOTAL_TIME_KEY
      const legs = Object.keys(TIMING_KPI_KEY).filter((r) => (roleQs.get(r) ?? []).length > 0)

      // Fed by something?
      if (!fed.length && !timingRole && !isTotal) {
        fail(t.code, `KPI ${k.key}`, 'is declared but no question maps to it, so it reads "—" on every visit and report')
      }
      if (timingRole && !(roleQs.get(timingRole) ?? []).length) {
        fail(t.code, `KPI ${k.key}`, `is the ${timingRole} leg but no question carries timingRole '${timingRole}'`)
      }
      if (isTotal && legs.length < 3) {
        fail(t.code, `KPI ${k.key}`, `is the sum of all three legs, but only ${legs.length} (${legs.join(', ') || 'none'}) are timed — the engine only computes the total when all three are present`)
      }

      // Unit matches kind? This is the class of bug that renders minutes as "%".
      const rawMinutes = fed.some((q) => q.type === 'time') || !!timingRole || isTotal
      const satisfaction = SATISFACTION_KEYS.has(k.key)
      if (rawMinutes && k.kind !== 'timing') {
        fail(t.code, `KPI ${k.key}`, `holds raw minutes but is declared '${k.kind}'; formatKpiValue would print it as a percentage. Declare it 'timing'`)
      }
      if (satisfaction && k.kind !== 'satisfaction') {
        fail(t.code, `KPI ${k.key}`, `holds a 1-10 answer but is declared '${k.kind}'; declare it 'satisfaction' so it reads "/ 10"`)
      }
      if (k.kind === 'timing' && !rawMinutes) {
        fail(t.code, `KPI ${k.key}`, `is declared 'timing' but is fed by ${fed.map((q) => `${q.code} (${q.type})`).join(', ') || 'nothing'}; a percentage mean would print as minutes`)
      }
      if (k.kind === 'satisfaction' && !satisfaction) {
        fail(t.code, `KPI ${k.key}`, `is declared 'satisfaction' but is not one of ${[...SATISFACTION_KEYS].join(', ')}; the engine averages it as a percentage and it would print as "/ 10"`)
      }
    }

    // Timing chain
    for (const [role, qs] of roleQs) {
      if (qs.length > 1) fail(t.code, `timing ${role}`, `measured by ${qs.length} questions (${qs.map((q) => q.code).join(', ')}); the engine keeps only the last`)
      if (t.sequence.timingChain && !t.sequence.timingChain.includes(role as never)) {
        warn(t.code, `timing ${role}`, `is measured on ${qs[0].code} but not listed in timingChain, so it is left out of the chain display`)
      }
    }
    for (const role of t.sequence.timingChain ?? []) {
      if (!(roleQs.get(role) ?? []).length) fail(t.code, `timing ${role}`, 'is listed in timingChain but no question measures it')
    }
    if (t.sequence.timingChain && !seen.has(TOTAL_TIME_KEY)) {
      warn(t.code, 'timing chain', `declares a chain but no '${TOTAL_TIME_KEY}' KPI, so the total is computed and never shown`)
    }

    if (!t.sequence.criticalFailures.length) warn(t.code, 'critical failures', 'the sequence lists none, so the report checklist is empty')
  }

  // ── One storyline food-safety critical per template ──────────────────────
  const foodSafety = tq.filter((q) => q.critical && tags.get(q.id) === 'food_safety')
  if (foodSafety.length > 1) {
    warn(t.code, 'tags', `${foodSafety.length} criticals tagged food_safety (${foodSafety.map((q) => q.code).join(', ')}); the demo generator forces that tag and would double-count the storyline critical`)
  }
}

// ── Threshold register ──────────────────────────────────────────────────────
// Every threshold is a pass/fail line the client is judged against, so they all
// belong in one list somebody can check against the brief. See docs/THRESHOLDS.md
// for which of these came from a brief and which are assumptions awaiting sign-off.
console.log(`\n${'='.repeat(78)}\n  Thresholds — every timing and numeric standard in force\n${'='.repeat(78)}`)
let thresholdCount = 0
for (const t of templates) {
  const secs = sections.filter((s) => s.templateId === t.id).sort((a, b) => a.order - b.order)
  const rows = secs.flatMap((s) =>
    questions
      .filter((q) => q.sectionId === s.id && q.threshold !== undefined && (q.type === 'time' || q.type === 'numeric'))
      .sort((a, b) => a.order - b.order)
      .map((q) => ({ q, s })),
  )
  if (!rows.length) continue
  console.log(`\n${t.code}`)
  for (const { q, s } of rows) {
    thresholdCount++
    const unit = q.type === 'time' ? 'min' : ''
    const kind = q.derivedFrom ? 'calculated' : 'entered'
    console.log(`  ${q.code.padEnd(9)}${(String(q.threshold) + ' ' + unit).padStart(8)}  ${kind.padEnd(10)}  ${s.code}  ${q.text.slice(0, 44)}`)
  }
}
console.log(`\n  ${thresholdCount} thresholds in force.`)

// ── Verdict ─────────────────────────────────────────────────────────────────
const errors = problems.filter((p) => p.level === 'error')
const warnings = problems.filter((p) => p.level === 'warning')
console.log(`\n${'='.repeat(78)}`)
for (const group of [errors, warnings]) {
  if (!group.length) continue
  console.log(`\n  ${group[0].level === 'error' ? 'ERRORS — these mis-score a visit' : 'WARNINGS — worth a look'}\n`)
  for (const p of group) console.log(`  ${p.level === 'error' ? '✗' : '!'} ${p.template}  ${p.where}\n      ${p.message}`)
}
const counted = `${templates.length} questionnaires, ${sections.length} stages, ${questions.length} questions`
if (errors.length) {
  console.log(`\n  ${counted} — ${errors.length} error(s), ${warnings.length} warning(s).\n`)
  // exitCode rather than exit(), so the Vite loader in the runner closes cleanly.
  process.exitCode = 1
} else {
  console.log(`\n  ${counted} — every question reachable and scorable, every KPI fed and in its own unit.`)
  console.log(`  ${warnings.length} warning(s).\n`)
}
