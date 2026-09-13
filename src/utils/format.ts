import { format, parseISO, differenceInHours, differenceInDays, isValid } from 'date-fns'
import type { RiskRating, Severity } from '@/types'

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const d = typeof value === 'string' ? parseISO(value) : value
  return isValid(d) ? d : null
}

export function fmtDate(value: string | Date | null | undefined, pattern = 'dd MMM yyyy'): string {
  const d = toDate(value)
  return d ? format(d, pattern) : '—'
}

export function fmtDateTime(value: string | Date | null | undefined): string {
  return fmtDate(value, 'dd MMM yyyy HH:mm')
}

export function fmtTime(value: string | Date | null | undefined): string {
  return fmtDate(value, 'HH:mm')
}

export function fmtMonth(value: string | Date | null | undefined): string {
  return fmtDate(value, 'MMM yyyy')
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${value.toFixed(digits)}%`
}

export function fmtScore(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toFixed(digits)
}

export function fmtNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-US').format(value)
}

export function fmtCurrency(value: number | null | undefined, currency = 'QAR'): string {
  if (value === null || value === undefined) return '—'
  return `${currency} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)}`
}

export function fmtDelta(value: number | null | undefined, digits = 1, suffix = ''): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}${suffix}`
}

export function hoursBetween(a: string | null, b: string | null): number | null {
  const da = toDate(a)
  const db = toDate(b)
  if (!da || !db) return null
  return differenceInHours(db, da)
}

export function daysBetween(a: string | null, b: string | null): number | null {
  const da = toDate(a)
  const db = toDate(b)
  if (!da || !db) return null
  return differenceInDays(db, da)
}

export function relativeTime(value: string | null | undefined, now: Date): string {
  const d = toDate(value)
  if (!d) return '—'
  const mins = Math.round((now.getTime() - d.getTime()) / 60000)
  if (Math.abs(mins) < 1) return 'just now'
  if (Math.abs(mins) < 60) return mins > 0 ? `${mins}m ago` : `in ${-mins}m`
  const hrs = Math.round(mins / 60)
  if (Math.abs(hrs) < 24) return hrs > 0 ? `${hrs}h ago` : `in ${-hrs}h`
  const days = Math.round(hrs / 24)
  if (Math.abs(days) < 30) return days > 0 ? `${days}d ago` : `in ${-days}d`
  return fmtDate(d)
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('')
}

export function riskFromScore(score: number | null | undefined): RiskRating | 'Not Assessed' {
  if (score === null || score === undefined || Number.isNaN(score)) return 'Not Assessed'
  if (score >= 90) return 'Excellent'
  if (score >= 80) return 'Good'
  if (score >= 70) return 'Needs Improvement'
  return 'Critical'
}

export const SEVERITY_ORDER: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

export function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function avg(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v))
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function round(n: number, digits = 1): number {
  const p = 10 ** digits
  return Math.round(n * p) / p
}
