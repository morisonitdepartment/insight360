import { useEffect, useMemo, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import {
  AlertOctagon,
  Bell,
  BellRing,
  Info,
  Lock,
  Mail,
  MessageSquare,
  Radio,
  Send,
  Smartphone,
  Timer,
  Users as UsersIcon,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle } from '@/hooks'
import type { NotificationRule, Role, Severity } from '@/types'
import { ROLE_LABELS } from '@/config/permissions'
import { updateNotificationRule } from '@/services/actions'
import { PageHeader } from '@/components/ui/PageHeader'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge, SeverityBadge, type Tone } from '@/components/ui/Badge'
import { Drawer } from '@/components/ui/Modal'
import { Checkbox, Field, Input, Select, Toggle } from '@/components/ui/Form'
import { Divider } from '@/components/ui/Misc'
import { cn } from '@/utils/cn'

type Channel = NotificationRule['channel'][number]
type RuleSeverity = Severity | 'Info'

const CHANNELS: Channel[] = ['In-app', 'Email', 'SMS']
const ALL_ROLES: Role[] = ['super_admin', 'client_admin', 'ops_manager', 'shopper', 'analyst', 'executive']
const SEVERITIES: RuleSeverity[] = ['Critical', 'High', 'Medium', 'Low', 'Info']

const CHANNEL_ICON: Record<Channel, LucideIcon> = {
  'In-app': Bell,
  Email: Mail,
  SMS: Smartphone,
}
const CHANNEL_TONE: Record<Channel, Tone> = {
  'In-app': 'navy',
  Email: 'teal',
  SMS: 'violet',
}

/** 'Info' is not a Severity — render it as a neutral blue badge instead. */
function RuleSeverityBadge({ severity, size = 'sm' }: { severity: RuleSeverity; size?: 'xs' | 'sm' | 'md' }) {
  if (severity === 'Info')
    return (
      <Badge tone="blue" icon={Info} size={size}>
        Info
      </Badge>
    )
  return <SeverityBadge severity={severity} size={size} />
}

interface RuleDraft {
  name: string
  trigger: string
  severity: RuleSeverity
  channel: Channel[]
  recipients: Role[]
  escalationHours: string
}

function toDraft(r: NotificationRule): RuleDraft {
  return {
    name: r.name,
    trigger: r.trigger,
    severity: r.severity,
    channel: [...r.channel],
    recipients: [...r.recipients],
    escalationHours: r.escalationHours === null ? '' : String(r.escalationHours),
  }
}

export default function NotificationRulesPage() {
  useDocumentTitle('Notification Rules')
  const { can } = useAuth()
  const { data, dispatch } = useData()
  const canEdit = can('admin.notifications')

  const rules = data.notificationRules
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = useMemo(() => rules.find((r) => r.id === selectedId) ?? null, [rules, selectedId])
  const [draft, setDraft] = useState<RuleDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(selected ? toDraft(selected) : null)
    setError(null)
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const kpi = useMemo(() => {
    const enabled = rules.filter((r) => r.enabled)
    const critical = rules.filter((r) => r.severity === 'Critical')
    const fastEscalation = rules.filter((r) => r.escalationHours !== null && r.escalationHours <= 12)
    const channels = new Set<Channel>()
    enabled.forEach((r) => r.channel.forEach((c) => channels.add(c)))
    return { enabled: enabled.length, critical: critical.length, fastEscalation: fastEscalation.length, channels: channels.size }
  }, [rules])

  /** Live recipient count for a rule — users holding one of the target roles. */
  const recipientCount = (recipients: Role[]) => data.users.filter((u) => u.status !== 'inactive' && recipients.includes(u.role)).length

  const toggleEnabled = async (rule: NotificationRule, next: boolean) => {
    if (!canEdit) return
    setBusy(true)
    try {
      await dispatch((d, ctx) => updateNotificationRule(d, ctx, rule.id, { enabled: next }))
      toast.success(`${rule.name} ${next ? 'enabled' : 'disabled'}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the rule')
    } finally {
      setBusy(false)
    }
  }

  const toggleIn = <T,>(list: T[], value: T): T[] => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value])

  const save = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!selected || !draft || !canEdit) return
    if (!draft.name.trim()) {
      setError('Rule name is required.')
      return
    }
    if (!draft.trigger.trim()) {
      setError('A trigger condition is required.')
      return
    }
    if (draft.channel.length === 0) {
      setError('Select at least one delivery channel.')
      return
    }
    if (draft.recipients.length === 0) {
      setError('Select at least one recipient role.')
      return
    }
    const hours = draft.escalationHours.trim() === '' ? null : Number(draft.escalationHours)
    if (hours !== null && (!Number.isFinite(hours) || hours <= 0 || hours > 168)) {
      setError('Escalation must be between 1 and 168 hours, or left empty.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await dispatch((d, ctx) =>
        updateNotificationRule(d, ctx, selected.id, {
          name: draft.name.trim(),
          trigger: draft.trigger.trim(),
          severity: draft.severity,
          channel: draft.channel,
          recipients: draft.recipients,
          escalationHours: hours,
        }),
      )
      toast.success(`${draft.name.trim()} saved`)
      setSelectedId(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the rule')
    } finally {
      setBusy(false)
    }
  }

  const sendTest = () => {
    if (!draft) return
    const n = recipientCount(draft.recipients)
    toast.success(`Test notification queued for ${n} recipient${n === 1 ? '' : 's'} (demo)`)
  }

  const columns: Column<NotificationRule>[] = [
    {
      key: 'name',
      header: 'Rule',
      render: (r) => (
        <div className="min-w-0">
          <p className="font-medium text-slate-900 dark:text-white truncate">{r.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{r.enabled ? 'Active' : 'Paused'}</p>
        </div>
      ),
    },
    { key: 'trigger', header: 'Trigger', render: (r) => <span className="text-xs text-slate-600 dark:text-slate-300">{r.trigger}</span> },
    { key: 'severity', header: 'Severity', render: (r) => <RuleSeverityBadge severity={r.severity} />, sortValue: (r) => SEVERITIES.indexOf(r.severity) },
    {
      key: 'channel',
      header: 'Channels',
      sortable: false,
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.channel.map((c) => (
            <Badge key={c} tone={CHANNEL_TONE[c]} icon={CHANNEL_ICON[c]} size="xs">
              {c}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'recipients',
      header: 'Recipients',
      sortable: false,
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.recipients.map((role) => (
            <Badge key={role} tone="slate" size="xs">
              {ROLE_LABELS[role]}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'escalationHours',
      header: 'Escalation',
      align: 'right',
      render: (r) =>
        r.escalationHours === null ? (
          <span className="text-xs text-slate-400">—</span>
        ) : (
          <span className={cn('text-xs font-medium tabular-nums', r.escalationHours <= 12 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-600 dark:text-slate-300')}>{r.escalationHours}h</span>
        ),
      sortValue: (r) => r.escalationHours ?? 9999,
    },
    {
      key: 'enabled',
      header: 'Enabled',
      align: 'center',
      sortValue: (r) => (r.enabled ? 1 : 0),
      render: (r) =>
        canEdit ? (
          <span className="inline-flex" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
            <Toggle checked={r.enabled} onChange={(v) => void toggleEnabled(r, v)} disabled={busy} label={<span className="sr-only">{`Enable ${r.name}`}</span>} />
          </span>
        ) : r.enabled ? (
          <Badge tone="green" icon={BellRing} size="xs">
            Enabled
          </Badge>
        ) : (
          <Badge tone="slate" icon={Lock} size="xs">
            Disabled
          </Badge>
        ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notification Rules"
        subtitle="Alert engine triggers, channels, recipients and escalation targets"
        badge={!canEdit ? <Badge tone="slate" icon={Lock}>Read only</Badge> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard compact label="Rules enabled" value={`${kpi.enabled} / ${rules.length}`} icon={BellRing} tone="accent" sub="Firing on matching events" />
        <KpiCard compact label="Critical rules" value={kpi.critical} icon={AlertOctagon} tone={kpi.critical ? 'critical' : 'default'} sub="Highest severity triggers" />
        <KpiCard compact label="Escalation ≤ 12h" value={kpi.fastEscalation} icon={Timer} tone={kpi.fastEscalation ? 'warn' : 'default'} sub="Fast-track escalation" />
        <KpiCard compact label="Channels in use" value={`${kpi.channels} / ${CHANNELS.length}`} icon={Radio} sub="Across enabled rules" />
      </div>

      <Card>
        <DataTable
          columns={columns}
          rows={rules}
          rowKey={(r) => r.id}
          onRowClick={(r) => setSelectedId(r.id)}
          selectedKey={selectedId}
          pageSize={0}
          initialSort={{ key: 'severity', dir: 'asc' }}
          caption="Notification rules"
          rowClassName={(r) => (r.enabled ? undefined : 'opacity-60')}
          emptyTitle="No notification rules"
          emptyMessage="The alert engine has no configured rules."
        />
      </Card>

      <Card>
        <CardHeader title="Escalation policy" subtitle="How the alert engine chases unacknowledged events" />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-navy-800 dark:bg-navy-800/50">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Escalation SLA</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{data.organization.escalationSlaHours}h</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Default window before an unacknowledged alert is escalated to the next management level.</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-navy-800 dark:bg-navy-800/50">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Reporting SLA</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{data.organization.reportingSlaHours}h</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Shoppers must submit an assessment within this window; a breach raises a “Report SLA breach” notification.</p>
          </div>
          <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <li className="flex items-start gap-2">
              <AlertOctagon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
              <span>Critical events notify immediately on every configured channel and escalate after {Math.min(12, data.organization.escalationSlaHours)} hours.</span>
            </li>
            <li className="flex items-start gap-2">
              <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <span>High-severity events escalate after {data.organization.escalationSlaHours} hours without acknowledgement.</span>
            </li>
            <li className="flex items-start gap-2">
              <UsersIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
              <span>Escalation targets are the recipient roles of the rule plus the outlet’s operations manager and the client administrator.</span>
            </li>
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
              <span>Rules without an escalation window notify once and stay in the alert queue until resolved.</span>
            </li>
          </ul>
        </CardBody>
      </Card>

      <Drawer
        open={!!selected && !!draft}
        onClose={() => setSelectedId(null)}
        title={selected ? (canEdit ? 'Edit notification rule' : 'Notification rule') : ''}
        subtitle={selected ? `${selected.id.toUpperCase()} · ${selected.enabled ? 'Enabled' : 'Disabled'}` : undefined}
        width="lg"
        footer={
          selected && draft ? (
            <>
              <button type="button" className="btn-secondary btn-sm" onClick={sendTest} disabled={busy || draft.recipients.length === 0}>
                <Send className="h-3.5 w-3.5" aria-hidden /> Send test
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setSelectedId(null)} disabled={busy}>
                Close
              </button>
              {canEdit && (
                <button type="submit" form="rule-form" className="btn-primary btn-sm" disabled={busy}>
                  {busy ? 'Saving…' : 'Save rule'}
                </button>
              )}
            </>
          ) : undefined
        }
      >
        {selected && draft && (
          <form id="rule-form" onSubmit={save} className="space-y-5" noValidate>
            {!canEdit && (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-navy-800 dark:bg-navy-800/60 dark:text-slate-300">
                Your role can review notification rules but not change them.
              </p>
            )}
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300" role="alert">
                {error}
              </p>
            )}

            <Field label="Rule name" required htmlFor="rule-name">
              <Input id="rule-name" value={draft.name} onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))} disabled={!canEdit} />
            </Field>

            <Field label="Trigger condition" required htmlFor="rule-trigger" hint="Plain-language description of the event the alert engine listens for.">
              <Input id="rule-trigger" value={draft.trigger} onChange={(e) => setDraft((d) => (d ? { ...d, trigger: e.target.value } : d))} disabled={!canEdit} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Severity" required htmlFor="rule-severity">
                <Select id="rule-severity" value={draft.severity} onChange={(e) => setDraft((d) => (d ? { ...d, severity: e.target.value as RuleSeverity } : d))} disabled={!canEdit}>
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Escalation (hours)" htmlFor="rule-escalation" hint="Leave empty for no automatic escalation.">
                <Input
                  id="rule-escalation"
                  type="number"
                  min={1}
                  max={168}
                  value={draft.escalationHours}
                  onChange={(e) => setDraft((d) => (d ? { ...d, escalationHours: e.target.value } : d))}
                  placeholder="—"
                  disabled={!canEdit}
                />
              </Field>
            </div>

            <Divider />

            <fieldset>
              <legend className="section-title">Delivery channels</legend>
              <div className="mt-2 space-y-1.5">
                {CHANNELS.map((c) => {
                  const Icon = CHANNEL_ICON[c]
                  return (
                    <Checkbox
                      key={c}
                      label={
                        <span className="inline-flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                          {c}
                        </span>
                      }
                      checked={draft.channel.includes(c)}
                      onChange={() => setDraft((d) => (d ? { ...d, channel: toggleIn(d.channel, c) } : d))}
                      disabled={!canEdit}
                    />
                  )
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="section-title">Recipient roles</legend>
              <div className="mt-2 grid grid-cols-1 gap-y-1.5 sm:grid-cols-2">
                {ALL_ROLES.map((role) => {
                  const n = data.users.filter((u) => u.status !== 'inactive' && u.role === role).length
                  return (
                    <Checkbox
                      key={role}
                      label={
                        <span>
                          {ROLE_LABELS[role]} <span className="text-[10px] text-slate-400">· {n} account{n === 1 ? '' : 's'}</span>
                        </span>
                      }
                      checked={draft.recipients.includes(role)}
                      onChange={() => setDraft((d) => (d ? { ...d, recipients: toggleIn(d.recipients, role) } : d))}
                      disabled={!canEdit}
                    />
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                <MessageSquare className="mr-1 inline h-3.5 w-3.5 align-text-bottom text-slate-400" aria-hidden />
                {recipientCount(draft.recipients)} active account{recipientCount(draft.recipients) === 1 ? '' : 's'} would receive this notification.
              </p>
            </fieldset>
          </form>
        )}
      </Drawer>
    </div>
  )
}
