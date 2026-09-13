import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  Globe2,
  KeyRound,
  LogOut,
  Moon,
  ShieldCheck,
  ShieldOff,
  Sun,
  UserRound,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useDocumentTitle, useNow } from '@/hooks'
import { isDemoMode } from '@/config/app'
import { PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS, type Permission } from '@/config/permissions'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, StatusBadge, type Tone } from '@/components/ui/Badge'
import { EmptyState, LoadingState } from '@/components/ui/States'
import { Toggle } from '@/components/ui/Form'
import { Avatar, DescriptionList, Divider, ProgressBar, Stat, Timeline } from '@/components/ui/Misc'
import { fmtDate, fmtDateTime, fmtPct, relativeTime } from '@/utils/format'

const ROLE_TONE: Record<string, Tone> = {
  super_admin: 'navy',
  client_admin: 'teal',
  ops_manager: 'blue',
  shopper: 'violet',
  analyst: 'slate',
  executive: 'amber',
}

/** Permission-key prefix → human group label, in display order. */
const GROUPS: { prefix: string; label: string }[] = [
  { prefix: 'dashboard', label: 'Dashboards' },
  { prefix: 'analytics', label: 'Analytics' },
  { prefix: 'outlets', label: 'Outlet performance' },
  { prefix: 'visits', label: 'Visits & assessments' },
  { prefix: 'calendar', label: 'Calendar' },
  { prefix: 'shoppers', label: 'Mystery shoppers' },
  { prefix: 'findings', label: 'Findings' },
  { prefix: 'actions', label: 'Corrective actions' },
  { prefix: 'alerts', label: 'Alerts & escalations' },
  { prefix: 'reports', label: 'Reports & exports' },
  { prefix: 'evidence', label: 'Evidence' },
  { prefix: 'admin', label: 'Administration' },
]

export default function ProfilePage() {
  useDocumentTitle('My Profile')
  const now = useNow()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { data } = useData()
  const { theme, toggleTheme } = useTheme()
  const [busy, setBusy] = useState(false)

  const permissions: Permission[] = user ? ROLE_PERMISSIONS[user.role] : []

  const grouped = useMemo(() => {
    const granted = new Set(permissions)
    return GROUPS.map((g) => ({
      label: g.label,
      items: (Object.keys(PERMISSIONS) as Permission[]).filter((p) => p.split('.')[0] === g.prefix && granted.has(p)),
    })).filter((g) => g.items.length > 0)
  }, [permissions])

  const outlets = useMemo(() => (user && user.outletIds.length ? user.outletIds.map((id) => data.outlets.find((o) => o.id === id)).filter((o): o is NonNullable<typeof o> => !!o) : []), [user, data.outlets])

  const activity = useMemo(
    () =>
      user
        ? data.activityLogs
            .filter((l) => l.userId === user.id)
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
            .slice(0, 10)
        : [],
    [user, data.activityLogs],
  )

  const shopper = useMemo(() => (user?.shopperId ? data.shoppers.find((s) => s.id === user.shopperId) ?? null : null), [user?.shopperId, data.shoppers])

  if (!user) return <LoadingState full label="Loading your profile…" />

  const handleSignOut = async () => {
    setBusy(true)
    try {
      await signOut()
      toast.success('You have been signed out')
      navigate('/login')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not sign out')
      setBusy(false)
    }
  }

  const changePassword = () => {
    toast.success(isDemoMode() ? 'Password changes are managed by your administrator in demo mode.' : 'A reset link will be sent to your email.')
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Profile"
        subtitle={`${ROLE_LABELS[user.role]} · ${data.organization.name}`}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={changePassword} disabled={busy}>
              <KeyRound className="h-4 w-4" aria-hidden /> Change password
            </button>
            <button type="button" className="btn-danger" onClick={() => void handleSignOut()} disabled={busy}>
              <LogOut className="h-4 w-4" aria-hidden /> {busy ? 'Signing out…' : 'Sign out'}
            </button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── Account ── */}
        <Card className="lg:col-span-2">
          <CardHeader title="Account" subtitle="Identity and sign-in details held by the platform" />
          <CardBody className="space-y-5">
            <div className="flex flex-wrap items-start gap-4">
              <Avatar name={user.name} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{user.name}</h2>
                  <Badge tone={ROLE_TONE[user.role] ?? 'slate'} size="md">
                    {ROLE_LABELS[user.role]}
                  </Badge>
                  <StatusBadge status={user.status} />
                  {user.mfaEnabled ? (
                    <Badge tone="green" icon={ShieldCheck}>
                      MFA enabled
                    </Badge>
                  ) : (
                    <Badge tone="amber" icon={ShieldOff}>
                      MFA not enrolled
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{user.title || 'No job title recorded'}</p>
              </div>
            </div>

            <DescriptionList
              columns={2}
              items={[
                { label: 'Email', value: <span className="break-all">{user.email}</span> },
                { label: 'Job title', value: user.title || '—' },
                { label: 'Member since', value: fmtDate(user.createdAt) },
                { label: 'Last login', value: user.lastLogin ? `${fmtDateTime(user.lastLogin)} (${relativeTime(user.lastLogin, now)})` : 'This session' },
                { label: 'Multi-factor authentication', value: user.mfaEnabled ? 'Enrolled' : 'Not enrolled' },
                { label: 'Account status', value: <StatusBadge status={user.status} /> },
              ]}
            />
          </CardBody>
        </Card>

        {/* ── Preferences ── */}
        <Card>
          <CardHeader title="Preferences" subtitle="Stored on this device" />
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4 dark:border-navy-800">
              <span className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                {theme === 'dark' ? <Moon className="h-4 w-4 text-teal-500" aria-hidden /> : <Sun className="h-4 w-4 text-amber-500" aria-hidden />}
                <span>
                  <span className="block font-medium">{theme === 'dark' ? 'Dark theme' : 'Light theme'}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">Applies to this browser only.</span>
                </span>
              </span>
              <Toggle checked={theme === 'dark'} onChange={toggleTheme} label={<span className="sr-only">Dark theme</span>} />
            </div>
            <p className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-xs text-slate-500 dark:border-navy-800 dark:text-slate-400">
              <Globe2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              The outlet and reporting-period selectors live in the top bar — they apply across every page for the rest of your session.
            </p>
            <DescriptionList
              columns={1}
              items={[
                { label: 'Timezone', value: data.organization.timezone },
                { label: 'Locale', value: data.organization.locale },
                { label: 'Currency', value: data.organization.currency },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      {/* ── Shopper profile ── */}
      {shopper && (
        <Card>
          <CardHeader
            title="Shopper profile"
            subtitle={`${shopper.code} · ${shopper.profileType} · ${shopper.languages.join(', ')}`}
            actions={
              <Link to={`/operations/shoppers/${shopper.id}`} className="btn-secondary btn-sm">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open full profile
              </Link>
            }
          />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Completed visits" value={shopper.completedVisits} sub="Approved assessments" />
              <Stat label="On-time submission" value={fmtPct(shopper.onTimeSubmissionPct, 0)} sub="Within reporting SLA" />
              <Stat label="Avg report quality" value={shopper.avgReportQuality.toFixed(1)} sub="Reviewer rating out of 5" />
              <Stat label="Availability" value={<StatusBadge status={shopper.availability} />} sub={`Status: ${shopper.status}`} />
            </div>
            <Divider />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="section-title">Training</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={shopper.trainingStatus} />
                  <StatusBadge status={shopper.certificationStatus} />
                </div>
                <ul className="mt-3 space-y-1.5">
                  {shopper.training.map((t) => {
                    const mod = data.trainingModules.find((m) => m.id === t.moduleId)
                    return (
                      <li key={t.moduleId} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-slate-600 dark:text-slate-300">{mod?.name ?? t.moduleId}</span>
                        <span className="flex items-center gap-2">
                          {t.score !== null && <span className="tabular-nums text-slate-500 dark:text-slate-400">{t.score}%</span>}
                          <StatusBadge status={t.status} size="xs" />
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
              <div>
                <p className="section-title">Report quality</p>
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">On-time submission</p>
                    <ProgressBar value={shopper.onTimeSubmissionPct} tone="accent" showValue label="On-time submission rate" />
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Average report quality</p>
                    <ProgressBar value={(shopper.avgReportQuality / 5) * 100} tone="navy" showValue label="Average report quality" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {shopper.experienceYears} year{shopper.experienceYears === 1 ? '' : 's'} of experience · assigned to {shopper.assignedCategories.join(' & ')}.
                  </p>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── Access ── */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Access"
            subtitle={`${permissions.length} of ${Object.keys(PERMISSIONS).length} permissions granted by the ${ROLE_LABELS[user.role]} role`}
          />
          <CardBody className="space-y-5">
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {grouped.map((g) => (
                <section key={g.label}>
                  <h3 className="section-title">{g.label}</h3>
                  <ul className="mt-1.5 space-y-1">
                    {g.items.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
                        <span>
                          {PERMISSIONS[p]} <span className="font-mono text-[10px] text-slate-400">{p}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <Divider />

            <section>
              <h3 className="section-title">Authorised outlets</h3>
              {outlets.length === 0 ? (
                <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <Building2 className="h-4 w-4 text-slate-400" aria-hidden />
                  All outlets
                  <span className="text-xs text-slate-500 dark:text-slate-400">({data.outlets.length} in the programme)</span>
                </p>
              ) : (
                <>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    You see data for {outlets.length} of {data.outlets.length} outlets.
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {outlets.map((o) => (
                      <li key={o.id}>
                        <Link to={`/performance/outlets/${o.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:border-teal-300 hover:text-teal-700 dark:border-navy-700 dark:text-slate-200 dark:hover:border-teal-700 dark:hover:text-teal-300">
                          <span className="font-mono text-[10px] text-slate-400">{o.code}</span>
                          {o.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </CardBody>
        </Card>

        {/* ── My activity ── */}
        <Card>
          <CardHeader title="My activity" subtitle="Your ten most recent recorded actions" />
          <CardBody>
            {activity.length === 0 ? (
              <EmptyState title="No activity yet" message="Actions you take in the platform are recorded in the audit trail." icon={UserRound} />
            ) : (
              <Timeline
                items={activity.map((l) => ({
                  at: l.timestamp,
                  by: `${l.module} · ${l.result}`,
                  action: l.action,
                  note: l.details ? `${l.recordId} — ${l.details}` : l.recordId,
                }))}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
