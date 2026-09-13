import { useMemo, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import {
  Building2,
  CalendarRange,
  CheckCircle2,
  Database,
  FlaskConical,
  Globe2,
  HardDrive,
  Moon,
  Palette,
  RotateCcw,
  ShieldCheck,
  Sun,
  Timer,
  UserCircle2,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useDocumentTitle, useNow } from '@/hooks'
import type { OrganizationSettings } from '@/types'
import { APP_CONFIG, isDemoMode } from '@/config/app'
import { ROLE_LABELS } from '@/config/permissions'
import { updateOrganization } from '@/services/actions'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Field, Input, Select, Toggle } from '@/components/ui/Form'
import { DescriptionList, Divider, Stat, Tabs, type TabItem } from '@/components/ui/Misc'
import { isCompleted } from '@/services/derive'
import { fmtDate, fmtDateTime } from '@/utils/format'

type TabKey = 'organisation' | 'engagement' | 'appearance' | 'security'

const TIMEZONES = ['Asia/Qatar', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Kuwait', 'Europe/London', 'UTC']
const CURRENCIES = ['QAR', 'AED', 'SAR', 'KWD', 'USD', 'EUR', 'GBP']
const LOCALES = [
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'en-US', label: 'English (United States)' },
  { value: 'ar-QA', label: 'Arabic (Qatar)' },
  { value: 'ar-AE', label: 'Arabic (United Arab Emirates)' },
]

const DEMO_DATA_KEY = `${APP_CONFIG.storagePrefix}.demo.data.v1`

const SECURITY_CHECKLIST: { title: string; detail: string }[] = [
  { title: 'No service-role key in the frontend', detail: 'Only the anonymous key is bundled; privileged operations run server-side.' },
  { title: 'RLS policies mirror the permission matrix', detail: 'Every table enforces row-level security equivalent to the role/permission map.' },
  { title: 'Demo credentials only in demo mode', detail: 'Seeded logins are compiled out of live builds; live mode authenticates against the identity provider.' },
  { title: 'Upload type and size validation', detail: 'Evidence uploads are checked for MIME type and size before they are accepted.' },
  { title: 'Role resolved server-side', detail: 'The client never asserts its own role; it is read from the verified session claim.' },
  { title: 'Immutable activity log', detail: 'Audit entries are append-only — they cannot be edited or deleted from the application.' },
]

function readStorageKb(): number | null {
  try {
    const raw = localStorage.getItem(DEMO_DATA_KEY)
    if (raw === null) return null
    return Math.round((new Blob([raw]).size / 1024) * 10) / 10
  } catch {
    return null
  }
}

export default function SettingsPage() {
  useDocumentTitle('System Settings')
  const now = useNow()
  const { user, can } = useAuth()
  const { data, dispatch, resetDemo } = useData()
  const { theme, toggleTheme } = useTheme()

  const canEdit = can('admin.settings')
  const demo = isDemoMode()
  const [tab, setTab] = useState<TabKey>('organisation')
  const [busy, setBusy] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  const org = data.organization
  const [orgForm, setOrgForm] = useState({ name: org.name, timezone: org.timezone, currency: org.currency, locale: org.locale })
  const [engForm, setEngForm] = useState({
    engagementName: org.engagementName,
    engagementStart: org.engagementStart.slice(0, 10),
    engagementEnd: org.engagementEnd.slice(0, 10),
    reportingTargetHours: String(org.reportingTargetHours),
    reportingSlaHours: String(org.reportingSlaHours),
    escalationSlaHours: String(org.escalationSlaHours),
  })
  const [engError, setEngError] = useState<string | null>(null)

  // Live validation for the 24–48h reporting range (RFP 2.1): the target may never exceed the maximum.
  const targetError = useMemo(() => {
    const target = Number(engForm.reportingTargetHours)
    const maximum = Number(engForm.reportingSlaHours)
    if (!Number.isFinite(target) || engForm.reportingTargetHours.trim() === '' || target < 12 || target > 48) return 'Enter a target between 12 and 48 hours.'
    if (Number.isFinite(maximum) && target > maximum) return `The target must be less than or equal to the reporting maximum (${maximum}h).`
    return null
  }, [engForm.reportingTargetHours, engForm.reportingSlaHours])

  const storageKb = useMemo(() => readStorageKb(), [data])

  const programme = useMemo(() => {
    const outlets = data.outlets.length
    const planned = data.visits.length
    const completed = data.visits.filter(isCompleted).length
    const inFlight = data.visits.filter((v) => !isCompleted(v)).length
    const pct = planned ? Math.round((completed / planned) * 100) : 0
    return { outlets, planned, completed, inFlight, pct }
  }, [data.outlets, data.visits])

  const tabs: TabItem<TabKey>[] = [
    { key: 'organisation', label: 'Organisation' },
    { key: 'engagement', label: 'Engagement & SLA' },
    { key: 'appearance', label: 'Appearance & Mode' },
    { key: 'security', label: 'Data & Security' },
  ]

  const save = async (patch: Partial<OrganizationSettings>, message: string) => {
    setBusy(true)
    try {
      await dispatch((d, ctx) => updateOrganization(d, ctx, patch))
      toast.success(message)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save settings')
    } finally {
      setBusy(false)
    }
  }

  const submitOrg = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!canEdit) return
    if (!orgForm.name.trim()) {
      toast.error('Organisation name is required.')
      return
    }
    await save({ name: orgForm.name.trim(), timezone: orgForm.timezone, currency: orgForm.currency, locale: orgForm.locale }, 'Organisation profile saved')
  }

  const submitEngagement = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!canEdit) return
    const reporting = Number(engForm.reportingSlaHours)
    const target = Number(engForm.reportingTargetHours)
    const escalation = Number(engForm.escalationSlaHours)
    if (!engForm.engagementName.trim()) {
      setEngError('Engagement name is required.')
      return
    }
    if (!engForm.engagementStart || !engForm.engagementEnd || engForm.engagementEnd <= engForm.engagementStart) {
      setEngError('The engagement end date must fall after the start date.')
      return
    }
    if (!Number.isFinite(reporting) || reporting < 24 || reporting > 72) {
      setEngError('Reporting maximum must be between 24 and 72 hours.')
      return
    }
    if (!Number.isFinite(target) || target < 12 || target > 48) {
      setEngError('Reporting target must be between 12 and 48 hours.')
      return
    }
    if (target > reporting) {
      setEngError('The reporting target must be less than or equal to the reporting maximum.')
      return
    }
    if (!Number.isFinite(escalation) || escalation < 12 || escalation > 24) {
      setEngError('Escalation SLA must be between 12 and 24 hours.')
      return
    }
    setEngError(null)
    await save(
      {
        engagementName: engForm.engagementName.trim(),
        engagementStart: engForm.engagementStart,
        engagementEnd: engForm.engagementEnd,
        reportingSlaHours: reporting,
        reportingTargetHours: target,
        escalationSlaHours: escalation,
      },
      'Engagement & SLA settings saved',
    )
  }

  const runReset = async () => {
    setBusy(true)
    try {
      await resetDemo()
      toast.success('Demo data restored to its seeded state')
      setResetOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reset the demo data')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="System Settings"
        subtitle="Organisation profile, engagement parameters, appearance and data governance"
        badge={<Badge tone={demo ? 'amber' : 'teal'} icon={demo ? FlaskConical : ShieldCheck}>{demo ? 'Demo mode' : 'Live mode'}</Badge>}
      />

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {/* ───────────────────────── Organisation ───────────────────────── */}
      {tab === 'organisation' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Organisation profile" subtitle="Client identity, regional formatting and reporting currency" />
            <CardBody>
              <form onSubmit={submitOrg} className="space-y-4" noValidate>
                <Field label="Organisation name" required htmlFor="org-name">
                  <Input id="org-name" value={orgForm.name} onChange={(e) => setOrgForm((f) => ({ ...f, name: e.target.value }))} disabled={!canEdit} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Timezone" htmlFor="org-tz" hint="Drives scheduling and SLA clocks.">
                    <Select id="org-tz" value={orgForm.timezone} onChange={(e) => setOrgForm((f) => ({ ...f, timezone: e.target.value }))} disabled={!canEdit}>
                      {(TIMEZONES.includes(orgForm.timezone) ? TIMEZONES : [orgForm.timezone, ...TIMEZONES]).map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Currency" htmlFor="org-currency" hint="Used for mystery-shopper spend.">
                    <Select id="org-currency" value={orgForm.currency} onChange={(e) => setOrgForm((f) => ({ ...f, currency: e.target.value }))} disabled={!canEdit}>
                      {(CURRENCIES.includes(orgForm.currency) ? CURRENCIES : [orgForm.currency, ...CURRENCIES]).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Locale" htmlFor="org-locale" hint="Date and number formatting.">
                    <Select id="org-locale" value={orgForm.locale} onChange={(e) => setOrgForm((f) => ({ ...f, locale: e.target.value }))} disabled={!canEdit}>
                      {(LOCALES.some((l) => l.value === orgForm.locale) ? LOCALES : [{ value: orgForm.locale, label: orgForm.locale }, ...LOCALES]).map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  {!canEdit && <span className="mr-auto text-xs text-slate-500 dark:text-slate-400">Your role can review these settings but not change them.</span>}
                  <button type="submit" className="btn-primary" disabled={!canEdit || busy}>
                    {busy ? 'Saving…' : 'Save organisation'}
                  </button>
                </div>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Current configuration" subtitle="Applied across every module" />
            <CardBody>
              <DescriptionList
                columns={1}
                items={[
                  { label: 'Organisation', value: <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-slate-400" aria-hidden />{org.name}</span> },
                  { label: 'Engagement', value: org.engagementName },
                  { label: 'Timezone', value: <span className="inline-flex items-center gap-1.5"><Globe2 className="h-3.5 w-3.5 text-slate-400" aria-hidden />{org.timezone}</span> },
                  { label: 'Currency', value: org.currency },
                  { label: 'Locale', value: org.locale },
                  { label: 'Brands', value: `${data.brands.length} brands · ${data.outlets.length} outlets` },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      )}

      {/* ───────────────────────── Engagement & SLA ───────────────────────── */}
      {tab === 'engagement' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Engagement & SLA" subtitle="Contract window and the service levels the alert engine enforces" />
            <CardBody>
              <form onSubmit={submitEngagement} className="space-y-4" noValidate>
                {engError && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300" role="alert">
                    {engError}
                  </p>
                )}
                <Field label="Engagement name" required htmlFor="eng-name">
                  <Input id="eng-name" value={engForm.engagementName} onChange={(e) => setEngForm((f) => ({ ...f, engagementName: e.target.value }))} disabled={!canEdit} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Start date" required htmlFor="eng-start">
                    <Input id="eng-start" type="date" value={engForm.engagementStart} onChange={(e) => setEngForm((f) => ({ ...f, engagementStart: e.target.value }))} disabled={!canEdit} />
                  </Field>
                  <Field label="End date" required htmlFor="eng-end">
                    <Input id="eng-end" type="date" value={engForm.engagementEnd} onChange={(e) => setEngForm((f) => ({ ...f, engagementEnd: e.target.value }))} disabled={!canEdit} />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Reporting target (hours)" required htmlFor="eng-target" hint="12–48h. Preferred turnaround; reports inside it are graded Within Target." error={targetError ?? undefined}>
                    <Input id="eng-target" type="number" min={12} max={48} value={engForm.reportingTargetHours} onChange={(e) => setEngForm((f) => ({ ...f, reportingTargetHours: e.target.value }))} disabled={!canEdit} invalid={!!targetError} />
                  </Field>
                  <Field label="Reporting maximum (hours)" required htmlFor="eng-reporting" hint="24–72h. Contractual deadline for a shopper to submit an assessment.">
                    <Input id="eng-reporting" type="number" min={24} max={72} value={engForm.reportingSlaHours} onChange={(e) => setEngForm((f) => ({ ...f, reportingSlaHours: e.target.value }))} disabled={!canEdit} />
                  </Field>
                  <Field label="Escalation SLA (hours)" required htmlFor="eng-escalation" hint="12–24h. Window before an unacknowledged alert escalates.">
                    <Input id="eng-escalation" type="number" min={12} max={24} value={engForm.escalationSlaHours} onChange={(e) => setEngForm((f) => ({ ...f, escalationSlaHours: e.target.value }))} disabled={!canEdit} />
                  </Field>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  {!canEdit && <span className="mr-auto text-xs text-slate-500 dark:text-slate-400">Your role can review these settings but not change them.</span>}
                  <button type="submit" className="btn-primary" disabled={!canEdit || busy}>
                    {busy ? 'Saving…' : 'Save engagement'}
                  </button>
                </div>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Programme status" subtitle={`${fmtDate(org.engagementStart)} → ${fmtDate(org.engagementEnd)}`} />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Outlets" value={programme.outlets} sub="In scope" />
                <Stat label="Planned visits" value={programme.planned} sub="Full programme" />
                <Stat label="Completed" value={programme.completed} sub={`${programme.pct}% of plan`} />
                <Stat label="In flight" value={programme.inFlight} sub="Not yet closed" />
              </div>
              <Divider />
              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <p className="flex items-center gap-2">
                  <CalendarRange className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  Reference date: <span className="font-medium text-slate-800 dark:text-slate-100">{fmtDate(now)}</span>
                </p>
                <p className="flex items-center gap-2">
                  <Timer className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  Reporting <span className="font-medium text-slate-800 dark:text-slate-100">{org.reportingTargetHours}–{org.reportingSlaHours}h</span> · Escalation SLA{' '}
                  <span className="font-medium text-slate-800 dark:text-slate-100">{org.escalationSlaHours}h</span>
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ───────────────────────── Appearance & Mode ───────────────────────── */}
      {tab === 'appearance' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Appearance" subtitle="Theme preference is stored on this device only" />
            <CardBody className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4 dark:border-navy-800">
                <span className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  {theme === 'dark' ? <Moon className="h-4 w-4 text-teal-500" aria-hidden /> : <Sun className="h-4 w-4 text-amber-500" aria-hidden />}
                  <span>
                    <span className="block font-medium">{theme === 'dark' ? 'Dark theme' : 'Light theme'}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">Switch the interface between light and dark.</span>
                  </span>
                </span>
                <Toggle checked={theme === 'dark'} onChange={toggleTheme} label={<span className="sr-only">Dark theme</span>} />
              </div>
              <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Palette className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Charts, badges and tables follow the selected theme automatically. Printed and exported PDFs always render on a light background for legibility.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Application mode" subtitle="Where the platform reads and writes its data" actions={<Badge tone={demo ? 'amber' : 'teal'} icon={demo ? FlaskConical : ShieldCheck}>{demo ? 'Demo' : 'Live'}</Badge>} />
            <CardBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className={`rounded-lg border p-3 ${demo ? 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10' : 'border-slate-200 dark:border-navy-800'}`}>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">Demo mode</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    A fully generated dataset is held in browser storage. Every action persists locally, the clock is fixed so the storyline stays stable, and the data can be reset at any time.
                  </p>
                </div>
                <div className={`rounded-lg border p-3 ${demo ? 'border-slate-200 dark:border-navy-800' : 'border-teal-300 bg-teal-50 dark:border-teal-500/40 dark:bg-teal-500/10'}`}>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">Live mode</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    The platform talks to the hosted backend. Authentication, row-level security and storage are enforced server-side, and the real clock applies.
                  </p>
                </div>
              </div>

              <Divider />

              <div>
                <h4 className="section-title">Environment variables</h4>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Configured at build time. Values are never displayed in the interface.</p>
                <ul className="mt-2 space-y-1.5">
                  {[
                    { name: 'VITE_APP_MODE', note: 'demo or live', set: true },
                    { name: 'VITE_SUPABASE_URL', note: 'Backend project URL', set: !demo },
                    { name: 'VITE_SUPABASE_ANON_KEY', note: 'Public anonymous key', set: !demo },
                  ].map((v) => (
                    <li key={v.name} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 dark:border-navy-800">
                      <span className="font-mono text-[11px] text-slate-700 dark:text-slate-200">{v.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{v.note}</span>
                        <Badge tone={v.set ? 'green' : 'slate'} size="xs">
                          {v.set ? 'Configured' : 'Not required in demo'}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <DescriptionList
                columns={2}
                items={[
                  { label: 'Application', value: `${APP_CONFIG.name} ${APP_CONFIG.version}` },
                  { label: 'Mode', value: demo ? 'Demo' : 'Live' },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      )}

      {/* ───────────────────────── Data & Security ───────────────────────── */}
      {tab === 'security' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Security posture" subtitle="Controls applied to this deployment" />
            <CardBody>
              <ul className="grid gap-3 sm:grid-cols-2">
                {SECURITY_CHECKLIST.map((c) => (
                  <li key={c.title} className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 dark:border-navy-800">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
                    <span>
                      <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{c.title}</span>
                      <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{c.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader title="Session" subtitle="The account this browser is signed in as" />
              <CardBody>
                <DescriptionList
                  columns={1}
                  items={[
                    { label: 'Name', value: <span className="inline-flex items-center gap-1.5"><UserCircle2 className="h-3.5 w-3.5 text-slate-400" aria-hidden />{user?.name ?? '—'}</span> },
                    { label: 'Email', value: user?.email ?? '—' },
                    { label: 'Role', value: user ? <Badge tone="navy">{ROLE_LABELS[user.role]}</Badge> : '—' },
                    { label: 'Status', value: user ? <StatusBadge status={user.status} /> : '—' },
                    { label: 'Last login', value: user?.lastLogin ? fmtDateTime(user.lastLogin) : 'This session' },
                  ]}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Local data" subtitle="Browser storage used by the demo dataset" />
              <CardBody className="space-y-3">
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-navy-800">
                  <HardDrive className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{storageKb === null ? 'Not stored' : `${storageKb.toLocaleString()} KB`}</p>
                    <p className="truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">{DEMO_DATA_KEY}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {storageKb === null
                    ? 'Nothing has been persisted yet in this browser — the seeded dataset is generated on demand.'
                    : 'Approximate size of the persisted dataset. It is private to this browser and never leaves the device in demo mode.'}
                </p>
                {demo && (
                  <button type="button" className="btn-danger w-full justify-center" onClick={() => setResetOpen(true)} disabled={busy}>
                    <RotateCcw className="h-4 w-4" aria-hidden /> Reset demo data
                  </button>
                )}
                {!demo && (
                  <p className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-navy-800 dark:text-slate-400">
                    <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    Resetting data is only available in demo mode; live data is managed by the backend.
                  </p>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={resetOpen}
        title="Reset demo data"
        message={
          <>
            Every change made in this browser — visits, approvals, findings, corrective actions, users and settings — will be discarded and the seeded dataset regenerated. This cannot be undone.
          </>
        }
        confirmLabel="Reset demo data"
        tone="danger"
        busy={busy}
        onConfirm={runReset}
        onCancel={() => setResetOpen(false)}
      />
    </div>
  )
}
