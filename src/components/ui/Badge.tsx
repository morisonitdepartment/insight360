import type { ReactNode } from 'react'
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDashed,
  Clock,
  Eye,
  FileCheck2,
  Hourglass,
  Info,
  Lock,
  MinusCircle,
  PauseCircle,
  PlayCircle,
  Send,
  ShieldAlert,
  ThumbsUp,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { RiskRating, Severity } from '@/types'
import { riskFromScore } from '@/utils/format'

export type Tone = 'green' | 'blue' | 'amber' | 'red' | 'slate' | 'navy' | 'teal' | 'violet'

const TONE_CLASSES: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
  blue: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30',
  amber: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  red: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30',
  slate: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/30',
  navy: 'bg-navy-50 text-navy-800 border-navy-200 dark:bg-navy-700/60 dark:text-slate-200 dark:border-navy-600',
  teal: 'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/30',
  violet: 'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30',
}

export function Badge({ tone = 'slate', icon: Icon, children, className, size = 'sm' }: { tone?: Tone; icon?: LucideIcon; children: ReactNode; className?: string; size?: 'xs' | 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border font-medium whitespace-nowrap',
        size === 'xs' ? 'px-1.5 py-0 text-[10px]' : size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {Icon && <Icon className={size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3'} aria-hidden />}
      {children}
    </span>
  )
}

interface StatusStyle {
  tone: Tone
  icon: LucideIcon
}

const STATUS_STYLES: Record<string, StatusStyle> = {
  // Visit
  Planned: { tone: 'slate', icon: CircleDashed },
  Assigned: { tone: 'blue', icon: Circle },
  'In Progress': { tone: 'amber', icon: PlayCircle },
  Draft: { tone: 'amber', icon: Hourglass },
  Submitted: { tone: 'violet', icon: Send },
  'Under Review': { tone: 'violet', icon: Eye },
  Approved: { tone: 'green', icon: CheckCircle2 },
  Rejected: { tone: 'red', icon: XCircle },
  Closed: { tone: 'navy', icon: Lock },
  // Report
  'Not Started': { tone: 'slate', icon: CircleDashed },
  'Pending Review': { tone: 'violet', icon: Eye },
  Published: { tone: 'teal', icon: FileCheck2 },
  Final: { tone: 'green', icon: FileCheck2 },
  // SLA
  'Within Target': { tone: 'green', icon: CheckCircle2 },
  'Within SLA': { tone: 'teal', icon: CheckCircle2 },
  'At Risk': { tone: 'amber', icon: Clock },
  Breached: { tone: 'red', icon: AlertTriangle },
  Pending: { tone: 'slate', icon: Clock },
  // Alerts / findings / CAPA
  New: { tone: 'red', icon: AlertOctagon },
  Acknowledged: { tone: 'blue', icon: ThumbsUp },
  Investigating: { tone: 'violet', icon: Eye },
  'Action Required': { tone: 'amber', icon: AlertTriangle },
  Resolved: { tone: 'green', icon: CheckCircle2 },
  Open: { tone: 'red', icon: AlertOctagon },
  Verified: { tone: 'teal', icon: ShieldAlert },
  'Awaiting Evidence': { tone: 'amber', icon: Hourglass },
  'Awaiting Verification': { tone: 'violet', icon: Eye },
  Overdue: { tone: 'red', icon: AlertTriangle },
  // Users / shoppers / templates
  active: { tone: 'green', icon: CheckCircle2 },
  inactive: { tone: 'slate', icon: MinusCircle },
  invited: { tone: 'blue', icon: Send },
  Active: { tone: 'green', icon: CheckCircle2 },
  Inactive: { tone: 'slate', icon: MinusCircle },
  'On Leave': { tone: 'amber', icon: PauseCircle },
  'Under Renovation': { tone: 'amber', icon: PauseCircle },
  Seasonal: { tone: 'blue', icon: Info },
  Available: { tone: 'green', icon: CheckCircle2 },
  Limited: { tone: 'amber', icon: Clock },
  Unavailable: { tone: 'slate', icon: MinusCircle },
  Completed: { tone: 'green', icon: CheckCircle2 },
  Expired: { tone: 'red', icon: AlertTriangle },
  Certified: { tone: 'green', icon: ShieldAlert },
}

export function StatusBadge({ status, size = 'sm', className }: { status: string; size?: 'xs' | 'sm' | 'md'; className?: string }) {
  const style = STATUS_STYLES[status] ?? { tone: 'slate' as Tone, icon: Circle }
  return (
    <Badge tone={style.tone} icon={style.icon} size={size} className={className}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}

export const RISK_STYLES: Record<RiskRating | 'Not Assessed', StatusStyle & { text: string }> = {
  Excellent: { tone: 'green', icon: CheckCircle2, text: 'text-emerald-700 dark:text-emerald-300' },
  Good: { tone: 'blue', icon: ThumbsUp, text: 'text-blue-700 dark:text-blue-300' },
  'Needs Improvement': { tone: 'amber', icon: AlertTriangle, text: 'text-amber-700 dark:text-amber-300' },
  Critical: { tone: 'red', icon: AlertOctagon, text: 'text-red-700 dark:text-red-300' },
  'Not Assessed': { tone: 'slate', icon: CircleDashed, text: 'text-slate-500' },
}

export function RiskBadge({ risk, size = 'sm', className }: { risk: RiskRating | 'Not Assessed' | null | undefined; size?: 'xs' | 'sm' | 'md'; className?: string }) {
  const r = risk ?? 'Not Assessed'
  const s = RISK_STYLES[r]
  return (
    <Badge tone={s.tone} icon={s.icon} size={size} className={className}>
      {r}
    </Badge>
  )
}

const SEVERITY_STYLES: Record<Severity, StatusStyle> = {
  Critical: { tone: 'red', icon: AlertOctagon },
  High: { tone: 'amber', icon: AlertTriangle },
  Medium: { tone: 'blue', icon: Info },
  Low: { tone: 'slate', icon: Circle },
}

export function SeverityBadge({ severity, size = 'sm', className }: { severity: Severity; size?: 'xs' | 'sm' | 'md'; className?: string }) {
  const s = SEVERITY_STYLES[severity]
  return (
    <Badge tone={s.tone} icon={s.icon} size={size} className={className}>
      {severity}
    </Badge>
  )
}

/** Score pill: colour + icon + label so status is never colour-only. */
export function ScoreBadge({ score, size = 'sm', showLabel = false, className }: { score: number | null | undefined; size?: 'xs' | 'sm' | 'md'; showLabel?: boolean; className?: string }) {
  const risk = riskFromScore(score)
  const s = RISK_STYLES[risk]
  return (
    <Badge tone={s.tone} icon={s.icon} size={size} className={cn('tabular-nums', className)}>
      {score === null || score === undefined ? '—' : `${score.toFixed(1)}%`}
      {showLabel && score !== null && score !== undefined && <span className="opacity-70">· {risk}</span>}
    </Badge>
  )
}

export function SegmentBadge({ segment, size = 'sm' }: { segment: string; size?: 'xs' | 'sm' | 'md' }) {
  return (
    <Badge tone={segment === 'F&B' ? 'teal' : 'violet'} size={size}>
      {segment}
    </Badge>
  )
}

export function scoreTextClass(score: number | null | undefined): string {
  return RISK_STYLES[riskFromScore(score)].text
}

export function scoreBarClass(score: number | null | undefined): string {
  const r = riskFromScore(score)
  return r === 'Excellent' ? 'bg-emerald-500' : r === 'Good' ? 'bg-blue-500' : r === 'Needs Improvement' ? 'bg-amber-500' : r === 'Critical' ? 'bg-red-500' : 'bg-slate-300'
}
