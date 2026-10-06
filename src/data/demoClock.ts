import { addDays, differenceInCalendarDays, format, startOfDay } from 'date-fns'

/**
 * Keeps the demonstration's "today" near the real one.
 *
 * The storyline is authored against a single fixed date — fifty-odd literal dates
 * across the seed (report timestamps, alert histories, approval trails) all sit in
 * a deliberate sequence around it. That made the demo correct on the day it was
 * written and progressively more stale afterwards: a prospect shown a dashboard
 * headed with a date three weeks gone notices.
 *
 * Rewriting every literal to be relative would be fifty chances to break the
 * sequence. Instead the storyline is still authored against the anchor, and the
 * finished dataset is shifted once, uniformly. Every interval inside it — the gap
 * between a visit and its report, an alert and its escalation — is preserved
 * exactly, because everything moves together.
 *
 * The shift is a whole number of weeks, so weekdays survive. The storyline leans
 * on them: visits are scheduled on working days and the dashboard names the day.
 * A shift of 23 days would move a Monday audit to a Wednesday and put weekend
 * visits in a business whose schedule avoids them.
 */

/** The date the storyline was written against: Sunday 13 September 2026, 10:00. */
export const STORYLINE_ANCHOR = new Date(2026, 8, 13, 10, 0, 0)

/**
 * Whole weeks between the anchor and today. Negative before the anchor date,
 * which is correct — the demo should track the viewer's clock in both directions.
 */
export const DEMO_SHIFT_DAYS = (() => {
  const elapsed = differenceInCalendarDays(startOfDay(new Date()), startOfDay(STORYLINE_ANCHOR))
  return Math.floor(elapsed / 7) * 7
})()

/**
 * "Today" for the demo: the anchor moved forward in whole weeks. Always the same
 * weekday as the anchor, and never more than six days behind the real date.
 */
export const DEMO_NOW = addDays(STORYLINE_ANCHOR, DEMO_SHIFT_DAYS)

/** `2026-09-13` or `2026-09-13T10:00:00` — the two shapes the seed emits. */
const DATE_LIKE = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}:\d{2}(?:\.\d+)?)?$/

function shiftDateString(value: string): string {
  const m = DATE_LIKE.exec(value)
  if (!m) return value
  const [, y, mo, d, time] = m
  // Constructed locally, so the shift cannot slip a day across a timezone offset.
  const shifted = addDays(new Date(Number(y), Number(mo) - 1, Number(d)), DEMO_SHIFT_DAYS)
  return `${format(shifted, 'yyyy-MM-dd')}${time ?? ''}`
}

/**
 * Moves every date in a seeded dataset by the shift, in place of nothing else.
 *
 * Deliberately narrow: only strings that are entirely a date are touched. Codes
 * that merely contain digits (`RPT-2026-001`, `F-2510-022`) and prose periods
 * ("Oct – Dec 2025") do not match and are returned untouched.
 */
export function shiftDemoDates<T>(value: T): T {
  if (DEMO_SHIFT_DAYS === 0) return value
  if (typeof value === 'string') return shiftDateString(value) as unknown as T
  if (Array.isArray(value)) return value.map((v) => shiftDemoDates(v)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = shiftDemoDates(v)
    return out as unknown as T
  }
  return value
}
