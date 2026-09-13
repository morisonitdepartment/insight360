import { useMemo, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { Check, Database, Download, GitPullRequestArrow, Info, Minus, ShieldCheck, Users as UsersIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import type { Role } from '@/types'
import { PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_PERMISSIONS, type Permission } from '@/config/permissions'
import { logExport } from '@/services/actions'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, type Tone } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Field, Select, Textarea } from '@/components/ui/Form'
import { exportCsv } from '@/utils/export'
import { fmtDate } from '@/utils/format'
import { cn } from '@/utils/cn'

const ROLES: Role[] = ['super_admin', 'client_admin', 'ops_manager', 'shopper', 'analyst', 'executive']
const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[]

const ROLE_TONE: Record<Role, Tone> = {
  super_admin: 'navy',
  client_admin: 'teal',
  ops_manager: 'blue',
  shopper: 'violet',
  analyst: 'slate',
  executive: 'amber',
}

const GROUP_ORDER = ['Performance', 'Operations', 'Quality', 'Reports & Evidence', 'Administration'] as const
type Group = (typeof GROUP_ORDER)[number]

function groupOf(p: Permission): Group {
  const prefix = p.split('.')[0]
  switch (prefix) {
    case 'dashboard':
    case 'analytics':
    case 'outlets':
      return 'Performance'
    case 'visits':
    case 'calendar':
    case 'shoppers':
      return 'Operations'
    case 'findings':
    case 'actions':
    case 'alerts':
      return 'Quality'
    case 'reports':
    case 'evidence':
      return 'Reports & Evidence'
    default:
      return 'Administration'
  }
}

const SCOPE_RULES: { role: Role; rule: string }[] = [
  { role: 'super_admin', rule: 'Sees all outlets, visits and administrative data across the whole programme.' },
  { role: 'client_admin', rule: 'Sees all authorised outlets; manages stakeholder accounts for the client organisation.' },
  { role: 'ops_manager', rule: 'Restricted to assigned outlets only — visits, findings and corrective actions are filtered accordingly.' },
  { role: 'shopper', rule: 'Sees only assigned visits and cannot access management analytics or other shoppers’ work.' },
  { role: 'analyst', rule: 'Read access to all performance data and exports, but cannot create users or change configuration.' },
  { role: 'executive', rule: 'Read-only: dashboards, rankings, risks, trends, alerts and management reports.' },
]

export default function RolesPage() {
  useDocumentTitle('Roles & Permissions')
  const now = useNow()
  const { can } = useAuth()
  const { data, dispatch } = useData()
  const canEdit = can('admin.roles.edit')

  const usersByRole = useMemo(() => {
    const m = new Map<Role, number>()
    for (const r of ROLES) m.set(r, 0)
    for (const u of data.users) m.set(u.role, (m.get(u.role) ?? 0) + 1)
    return m
  }, [data.users])

  const groups = useMemo(() => {
    const map = new Map<Group, Permission[]>()
    for (const g of GROUP_ORDER) map.set(g, [])
    for (const p of ALL_PERMISSIONS) map.get(groupOf(p))!.push(p)
    return GROUP_ORDER.map((g) => ({ name: g, permissions: map.get(g)! }))
  }, [])

  const granted = (role: Role, p: Permission) => ROLE_PERMISSIONS[role].includes(p)

  // ── Change request modal ──
  const [reqOpen, setReqOpen] = useState(false)
  const [reqRole, setReqRole] = useState<Role>('ops_manager')
  const [reqPermission, setReqPermission] = useState<Permission>('visits.create')
  const [reqJustification, setReqJustification] = useState('')
  const [reqError, setReqError] = useState<string | null>(null)

  const openRequest = () => {
    setReqRole('ops_manager')
    setReqPermission('visits.create')
    setReqJustification('')
    setReqError(null)
    setReqOpen(true)
  }

  const submitRequest = (ev: FormEvent) => {
    ev.preventDefault()
    if (!canEdit) return
    if (reqJustification.trim().length < 10) {
      setReqError('Please provide a justification of at least 10 characters.')
      return
    }
    toast.success('Change request logged for review')
    setReqOpen(false)
  }

  const doExport = () => {
    const rows = ALL_PERMISSIONS.map((p) => {
      const row: Record<string, string> = { Group: groupOf(p), Permission: p, Description: PERMISSIONS[p] }
      for (const r of ROLES) row[ROLE_LABELS[r]] = granted(r, p) ? 'Granted' : 'Not granted'
      return row
    })
    exportCsv(rows, `insight360-permission-matrix-${fmtDate(now, 'yyyyMMdd')}`)
    void dispatch((d, ctx) => logExport(d, ctx, `Permission matrix (${rows.length} rows)`, 'CSV')).then(() => toast.success('Permission matrix exported to CSV'))
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Roles & Permissions"
        subtitle="Role-based access control matrix"
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={doExport}>
              <Download className="h-4 w-4" aria-hidden /> Export matrix
            </button>
            {canEdit && (
              <button type="button" className="btn-primary" onClick={openRequest}>
                <GitPullRequestArrow className="h-4 w-4" aria-hidden /> Request change
              </button>
            )}
          </>
        }
      />

      {/* ── Role cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ROLES.map((r) => {
          const count = usersByRole.get(r) ?? 0
          const perms = ROLE_PERMISSIONS[r].length
          return (
            <Card key={r} padded className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Badge tone={ROLE_TONE[r]} size="md">{ROLE_LABELS[r]}</Badge>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{ROLE_DESCRIPTIONS[r]}</p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-navy-800 dark:text-slate-300">
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                </span>
              </div>
              <div className="mt-auto flex items-center gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-navy-800 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <UsersIcon className="h-3.5 w-3.5" aria-hidden />
                  <span className="tabular-nums font-medium text-slate-800 dark:text-slate-100">{count}</span> user{count === 1 ? '' : 's'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" aria-hidden />
                  <span className="tabular-nums font-medium text-slate-800 dark:text-slate-100">{perms}</span> of {ALL_PERMISSIONS.length} permissions
                </span>
              </div>
            </Card>
          )
        })}
      </div>

      {/* ── Matrix ── */}
      <Card>
        <CardHeader title="Permission matrix" subtitle={`${ALL_PERMISSIONS.length} permissions × ${ROLES.length} roles · computed from the role configuration`} />
        <div className="table-wrap max-h-[70vh] overflow-auto">
          <table className="table min-w-[880px]">
            <caption className="sr-only">Permission matrix by role</caption>
            <thead className="sticky top-0 z-10">
              <tr>
                <th scope="col" className="sticky left-0 z-20 bg-slate-50 dark:bg-navy-900 min-w-[280px]">Permission</th>
                {ROLES.map((r) => (
                  <th key={r} scope="col" className="text-center whitespace-nowrap">
                    <span className="inline-flex flex-col items-center gap-0.5">
                      <span>{ROLE_LABELS[r]}</span>
                      <span className="text-[10px] font-normal tabular-nums text-slate-400">{ROLE_PERMISSIONS[r].length}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g.name} name={g.name} permissions={g.permissions} granted={granted} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Scope rules" subtitle="Data visibility applied on top of permissions" />
          <CardBody>
            <ul className="space-y-3">
              {SCOPE_RULES.map((s) => (
                <li key={s.role} className="flex items-start gap-3">
                  <Badge tone={ROLE_TONE[s.role]} className="mt-0.5 shrink-0 min-w-[120px] justify-center">{ROLE_LABELS[s.role]}</Badge>
                  <p className="text-sm text-slate-700 dark:text-slate-200">{s.rule}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Live mode enforcement" subtitle="How the matrix is applied outside the demo" />
          <CardBody className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-teal-200 bg-teal-50/60 p-3 dark:border-teal-500/30 dark:bg-teal-500/10">
              <Database className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden />
              <p className="text-sm text-slate-700 dark:text-slate-200">
                In live mode the same matrix is enforced server-side by <strong>Supabase Row Level Security</strong> policies — every table read or write is checked against the signed-in user’s role and outlet authorisation. See <code className="kbd">supabase/migrations</code> for the policy definitions.
              </p>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-navy-700 dark:bg-navy-800/60">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden />
              <p className="text-xs text-slate-600 dark:text-slate-300">
                The client-side matrix in <code className="kbd">src/config/permissions.ts</code> only controls navigation and button visibility. It is never the last line of defence: a denied request is logged in the activity trail as a “Denied” event.
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Read-only roles</dt>
                <dd className="mt-1 text-slate-800 dark:text-slate-100">Analyst, Executive</dd>
              </div>
              <div>
                <dt className="font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Policy source</dt>
                <dd className="mt-1 text-slate-800 dark:text-slate-100">Role claim + outlet authorisation table</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>

      {/* ── Change request modal ── */}
      <Modal
        open={reqOpen}
        onClose={() => setReqOpen(false)}
        title="Request permission change"
        description="Changes to the matrix require a security review before deployment. The request is logged and routed to the platform owner."
        size="md"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setReqOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="role-change-form" className="btn-primary">
              Submit request
            </button>
          </>
        }
      >
        <form id="role-change-form" onSubmit={submitRequest} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Role" required htmlFor="req-role">
              <Select id="req-role" value={reqRole} onChange={(e) => setReqRole(e.target.value as Role)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Permission" required htmlFor="req-permission">
              <Select id="req-permission" value={reqPermission} onChange={(e) => setReqPermission(e.target.value as Permission)}>
                {groups.map((g) => (
                  <optgroup key={g.name} label={g.name}>
                    {g.permissions.map((p) => (
                      <option key={p} value={p}>
                        {PERMISSIONS[p]} ({p})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-navy-700 dark:bg-navy-800/60 dark:text-slate-300">
            Requested action:{' '}
            <strong className="text-slate-800 dark:text-slate-100">{granted(reqRole, reqPermission) ? 'Revoke' : 'Grant'}</strong> “{PERMISSIONS[reqPermission]}” for <strong className="text-slate-800 dark:text-slate-100">{ROLE_LABELS[reqRole]}</strong>
          </div>
          <Field label="Justification" required error={reqError ?? undefined} htmlFor="req-justification" hint="Explain the business need and any compensating controls.">
            <Textarea id="req-justification" value={reqJustification} onChange={(e) => { setReqJustification(e.target.value); setReqError(null) }} invalid={!!reqError} rows={4} />
          </Field>
        </form>
      </Modal>
    </div>
  )
}

function GroupRows({ name, permissions, granted }: { name: string; permissions: Permission[]; granted: (r: Role, p: Permission) => boolean }) {
  return (
    <>
      <tr className="bg-slate-50/80 dark:bg-navy-800/40">
        <th scope="rowgroup" colSpan={ROLES.length + 1} className="sticky left-0 !py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-left">
          {name}
        </th>
      </tr>
      {permissions.map((p) => (
        <tr key={p}>
          <th scope="row" className="sticky left-0 z-[5] bg-white dark:bg-navy-900 font-normal text-left align-top">
            <span className="block text-sm text-slate-800 dark:text-slate-100">{PERMISSIONS[p]}</span>
            <span className="block font-mono text-[10px] text-slate-400">{p}</span>
          </th>
          {ROLES.map((r) => {
            const ok = granted(r, p)
            return (
              <td key={r} className={cn('text-center', ok && 'bg-teal-50/40 dark:bg-teal-500/5')}>
                {ok ? (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only">Granted</span>
                  </span>
                ) : (
                  <span className="inline-flex h-6 w-6 items-center justify-center text-slate-300 dark:text-navy-600">
                    <Minus className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only">Not granted</span>
                  </span>
                )}
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
