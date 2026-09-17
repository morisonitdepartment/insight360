import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Building2, Download, KeyRound, Mail, Pencil, Search, ShieldCheck, ShieldOff, UserCheck, UserMinus, UserPlus, Users as UsersIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useData } from '@/contexts/DataContext'
import { useDocumentTitle, useNow } from '@/hooks'
import type { Role, User, UserStatus } from '@/types'
import { PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS, type Permission } from '@/config/permissions'
import { isLiveMode } from '@/config/app'
import { provisionUser } from '@/services/provisionUser'
import { createUser, logExport, resetPassword, updateUser, type NewUserInput } from '@/services/actions'
import { PageHeader } from '@/components/ui/PageHeader'
import { KpiCard } from '@/components/ui/KpiCard'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { FilterBar, applyFilters, matchesSearch, type FilterDef } from '@/components/ui/FilterBar'
import { Badge, StatusBadge, type Tone } from '@/components/ui/Badge'
import { ConfirmDialog, Drawer, Modal } from '@/components/ui/Modal'
import { Checkbox, Field, Input, Select } from '@/components/ui/Form'
import { Avatar, DescriptionList, Divider } from '@/components/ui/Misc'
import { exportCsv } from '@/utils/export'
import { fmtDate, fmtDateTime, relativeTime } from '@/utils/format'
import { cn } from '@/utils/cn'

const ALL_ROLES: Role[] = ['super_admin', 'client_admin', 'ops_manager', 'shopper', 'analyst', 'executive']
/** Roles a client administrator may manage (stakeholder accounts only). */
const STAKEHOLDER_ROLES: Role[] = ['client_admin', 'executive', 'analyst', 'ops_manager']
const STATUSES: UserStatus[] = ['active', 'invited', 'inactive']

const ROLE_TONE: Record<Role, Tone> = {
  super_admin: 'navy',
  client_admin: 'teal',
  ops_manager: 'blue',
  shopper: 'violet',
  analyst: 'slate',
  executive: 'amber',
}

interface UserForm {
  name: string
  email: string
  role: Role
  title: string
  outletIds: string[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ───────────────────────────── Outlet picker (grouped by region, searchable) ─────────────────────────────

function OutletPicker({ selected, onChange, disabled }: { selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const { data } = useData()
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const filtered = data.outlets.filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()) || o.code.toLowerCase().includes(q.toLowerCase()))
    const map = new Map<string, typeof data.outlets>()
    for (const o of filtered) map.set(o.region, [...(map.get(o.region) ?? []), o])
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [data.outlets, q])
  const set = new Set(selected)
  const toggle = (id: string) => onChange(set.has(id) ? selected.filter((x) => x !== id) : [...selected, id])
  const toggleRegion = (ids: string[]) => {
    const all = ids.every((id) => set.has(id))
    onChange(all ? selected.filter((x) => !ids.includes(x)) : Array.from(new Set([...selected, ...ids])))
  }
  return (
    <div className="rounded-lg border border-slate-200 dark:border-navy-700">
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-navy-700 px-3 py-2">
        <Search className="h-4 w-4 text-slate-400" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter outlets…" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 text-slate-800 dark:text-slate-100" aria-label="Filter outlets" />
        <span className="text-xs tabular-nums text-slate-500 whitespace-nowrap">{selected.length} selected</span>
      </div>
      <div className="max-h-64 overflow-y-auto p-2 space-y-2">
        {groups.length === 0 && <p className="px-2 py-4 text-center text-xs text-slate-500">No outlets match.</p>}
        {groups.map(([region, list]) => {
          const ids = list.map((o) => o.id)
          const all = ids.every((id) => set.has(id))
          return (
            <div key={region}>
              <div className="flex items-center justify-between px-1 py-1">
                <span className="section-title">{region}</span>
                <button type="button" className="link text-[11px]" onClick={() => toggleRegion(ids)} disabled={disabled}>
                  {all ? 'Clear region' : 'Select region'}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
                {list.map((o) => (
                  <Checkbox key={o.id} label={<span className="truncate"><span className="font-mono text-[11px] text-slate-500 mr-1.5">{o.code}</span>{o.name}</span>} checked={set.has(o.id)} onChange={() => toggle(o.id)} disabled={disabled} className="py-0.5 min-w-0" />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ───────────────────────────── Page ─────────────────────────────

export default function UsersPage() {
  useDocumentTitle('Users')
  const now = useNow()
  const { user: me, can } = useAuth()
  const { data, dispatch, reload } = useData()
  const [params, setParams] = useSearchParams()

  const canAll = can('admin.users')
  const canStakeholders = can('admin.stakeholders')
  const canCreate = canAll || canStakeholders
  const manageableRoles: Role[] = canAll ? ALL_ROLES : canStakeholders ? STAKEHOLDER_ROLES : []
  const canManageUser = useCallback((u: User) => canAll || (canStakeholders && STAKEHOLDER_ROLES.includes(u.role)), [canAll, canStakeholders])

  const outletById = useMemo(() => new Map(data.outlets.map((o) => [o.id, o])), [data.outlets])

  // ── Filters ──
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const filterDefs: FilterDef[] = [
    { key: 'role', label: 'Role', options: ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })) },
    { key: 'status', label: 'Status', options: STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })) },
  ]
  const rows = useMemo(() => {
    const list = applyFilters(data.users, filters, { role: (u) => u.role, status: (u) => u.status })
    return [...matchesSearch(list, search, (u) => [u.name, u.email, u.title, ROLE_LABELS[u.role]])].sort((a, b) => a.name.localeCompare(b.name))
  }, [data.users, filters, search])

  const kpi = useMemo(() => {
    const total = data.users.length
    const active = data.users.filter((u) => u.status === 'active').length
    const invited = data.users.filter((u) => u.status === 'invited').length
    const inactive = data.users.filter((u) => u.status === 'inactive').length
    const mfa = total ? Math.round((data.users.filter((u) => u.mfaEnabled).length / total) * 100) : 0
    return { total, active, invited, inactive, mfa }
  }, [data.users])

  // ── Selection / drawer (deep link ?user=) ──
  const selectedId = params.get('user')
  const selected = useMemo(() => (selectedId ? data.users.find((u) => u.id === selectedId) ?? null : null), [selectedId, data.users])
  const select = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('user', id)
    else next.delete('user')
    setParams(next, { replace: true })
  }

  const [outletDraft, setOutletDraft] = useState<string[]>([])
  const [brandDraft, setBrandDraft] = useState<string[]>([])
  useEffect(() => {
    setOutletDraft(selected?.outletIds ?? [])
    setBrandDraft(selected?.brandIds ?? [])
  }, [selected?.id, selected?.outletIds, selected?.brandIds])

  // ── Dialog state ──
  const [busy, setBusy] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [confirm, setConfirm] = useState<'deactivate' | 'reactivate' | 'reset' | null>(null)
  const [form, setForm] = useState<UserForm>({ name: '', email: '', role: manageableRoles[0] ?? 'analyst', title: '', outletIds: [] })
  const [errors, setErrors] = useState<Partial<Record<keyof UserForm, string>>>({})
  // Shown once after a Live Mode account is created. The password is never
  // stored or re-readable, so closing this dialog is the last chance to copy it.
  const [credentials, setCredentials] = useState<{ name: string; email: string; password: string | null; warning: string | null } | null>(null)

  const run = async (label: string, recipe: Parameters<typeof dispatch>[0], after?: () => void) => {
    setBusy(true)
    try {
      await dispatch(recipe)
      toast.success(label)
      after?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const validate = (isCreate: boolean): boolean => {
    const e: Partial<Record<keyof UserForm, string>> = {}
    if (!form.name.trim()) e.name = 'Name is required.'
    if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email address.'
    else if (data.users.some((u) => u.email.toLowerCase() === form.email.trim().toLowerCase() && (isCreate || u.id !== selected?.id))) e.email = 'This email is already registered.'
    if (!manageableRoles.includes(form.role)) e.role = 'You cannot assign this role.'
    if (form.role === 'ops_manager' && form.outletIds.length === 0 && isCreate) e.outletIds = 'Assign at least one outlet to an operations manager.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const openCreate = () => {
    setForm({ name: '', email: '', role: manageableRoles[0] ?? 'analyst', title: '', outletIds: [] })
    setErrors({})
    setCreateOpen(true)
  }
  const openEdit = () => {
    if (!selected) return
    setForm({ name: selected.name, email: selected.email, role: selected.role, title: selected.title, outletIds: selected.outletIds })
    setErrors({})
    setEditOpen(true)
  }

  const submitCreate = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!canCreate || !validate(true)) return
    const input: NewUserInput = { name: form.name.trim(), email: form.email.trim().toLowerCase(), role: form.role, title: form.title.trim(), outletIds: form.role === 'ops_manager' ? form.outletIds : [] }

    if (!isLiveMode()) {
      await run(`Invitation sent to ${input.email}`, (d, ctx) => createUser(d, ctx, input), () => setCreateOpen(false))
      return
    }

    // Live Mode: the account is created server-side, because minting a login
    // needs a key that must never reach the browser. The local action is not
    // used here — it would write a profile with no password behind it.
    setBusy(true)
    try {
      const codes = data.outlets.filter((o) => input.outletIds.includes(o.id)).map((o) => o.code)
      const result = await provisionUser({ ...input, outletCodes: codes })
      await reload()
      setCreateOpen(false)
      setCredentials({ name: input.name, email: input.email, password: result.temporaryPassword, warning: result.warning })
      toast.success(result.reusedExisting ? `${input.name} linked to their existing login` : `${input.name} can now sign in`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the account.')
    } finally {
      setBusy(false)
    }
  }

  const submitEdit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!selected || !canManageUser(selected) || !validate(false)) return
    if (form.role !== selected.role && selected.id === me?.id) {
      toast.error('You cannot change your own role.')
      return
    }
    const patch: Partial<User> = { name: form.name.trim(), email: form.email.trim().toLowerCase(), title: form.title.trim() }
    if (form.role !== selected.role) patch.role = form.role
    await run(`${patch.name} updated`, (d, ctx) => updateUser(d, ctx, selected.id, patch), () => setEditOpen(false))
  }

  const assignRole = async (role: Role) => {
    if (!selected || role === selected.role) return
    if (selected.id === me?.id) {
      toast.error('You cannot change your own role.')
      return
    }
    if (!manageableRoles.includes(role) || !canManageUser(selected)) {
      toast.error('You are not permitted to assign this role.')
      return
    }
    await run(`${selected.name} is now ${ROLE_LABELS[role]}`, (d, ctx) => updateUser(d, ctx, selected.id, { role }))
  }

  const saveScope = async () => {
    if (!selected) return
    await run('Outlet authorisation saved', (d, ctx) => updateUser(d, ctx, selected.id, { outletIds: outletDraft, brandIds: brandDraft }))
  }

  const runConfirm = async () => {
    if (!selected || !confirm) return
    if (confirm === 'deactivate') {
      if (selected.id === me?.id) {
        toast.error('You cannot deactivate your own account.')
        setConfirm(null)
        return
      }
      await run(`${selected.name} deactivated`, (d, ctx) => updateUser(d, ctx, selected.id, { status: 'inactive' }), () => setConfirm(null))
    } else if (confirm === 'reactivate') {
      await run(`${selected.name} reactivated`, (d, ctx) => updateUser(d, ctx, selected.id, { status: 'active' }), () => setConfirm(null))
    } else {
      await run('Temporary password issued (demo)', (d, ctx) => resetPassword(d, ctx, selected.id), () => setConfirm(null))
    }
  }

  const doExport = () => {
    if (!rows.length) {
      toast.error('Nothing to export for the current filters.')
      return
    }
    const out = rows.map((u) => ({
      Name: u.name,
      Email: u.email,
      Title: u.title,
      Role: ROLE_LABELS[u.role],
      Status: u.status,
      'Authorised Outlets': u.outletIds.length ? u.outletIds.map((id) => outletById.get(id)?.code ?? id).join('; ') : 'All',
      'MFA Enabled': u.mfaEnabled ? 'Yes' : 'No',
      'Last Login': u.lastLogin ?? 'Never',
      'Created At': u.createdAt,
    }))
    exportCsv(out, `insight360-users-${fmtDate(now, 'yyyyMMdd')}`)
    void dispatch((d, ctx) => logExport(d, ctx, `Users (${out.length} rows)`, 'CSV')).then(() => toast.success(`Exported ${out.length} users to CSV`))
  }

  const outletSummary = (u: User) => {
    if (u.outletIds.length === 0) return u.role === 'ops_manager' ? <span className="text-amber-700 dark:text-amber-300 text-xs">No outlets assigned</span> : <span className="text-xs text-slate-500">All outlets</span>
    const names = u.outletIds.map((id) => outletById.get(id)?.name ?? id)
    return (
      <span className="inline-flex items-center gap-1 text-xs" title={names.join('\n')}>
        <Building2 className="h-3.5 w-3.5 text-slate-400" aria-hidden />
        {u.outletIds.length} outlet{u.outletIds.length === 1 ? '' : 's'}
      </span>
    )
  }

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'User',
      render: (u) => (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={u.name} size="sm" />
          <div className="min-w-0">
            <p className="font-medium text-slate-900 dark:text-white truncate">
              {u.name}
              {u.id === me?.id && <span className="ml-1.5 text-[10px] font-normal text-slate-400">(you)</span>}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{u.title}</p>
          </div>
        </div>
      ),
    },
    { key: 'email', header: 'Email', render: (u) => <span className="text-xs text-slate-600 dark:text-slate-300">{u.email}</span> },
    { key: 'role', header: 'Role', render: (u) => <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABELS[u.role]}</Badge>, sortValue: (u) => ROLE_LABELS[u.role] },
    { key: 'outlets', header: 'Authorised outlets', render: outletSummary, sortValue: (u) => u.outletIds.length },
    { key: 'lastLogin', header: 'Last login', render: (u) => <span className="text-xs tabular-nums whitespace-nowrap">{u.lastLogin ? fmtDateTime(u.lastLogin) : 'Never'}</span> },
    { key: 'mfa', header: 'MFA', render: (u) => (u.mfaEnabled ? <Badge tone="green" icon={ShieldCheck}>Enabled</Badge> : <Badge tone="slate" icon={ShieldOff}>Not enrolled</Badge>), sortValue: (u) => (u.mfaEnabled ? 1 : 0) },
    { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
  ]

  const grantedPermissions = (role: Role): Permission[] => ROLE_PERMISSIONS[role]
  const history = useMemo(() => (selected ? data.activityLogs.filter((l) => l.userId === selected.id).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 15) : []), [selected, data.activityLogs])
  const scopeDirty = selected ? JSON.stringify([...outletDraft].sort()) !== JSON.stringify([...selected.outletIds].sort()) || JSON.stringify([...brandDraft].sort()) !== JSON.stringify([...selected.brandIds].sort()) : false
  const selectedManageable = selected ? canManageUser(selected) : false

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        subtitle="Accounts, roles, outlet authorisation and MFA"
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={doExport}>
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </button>
            {canCreate && (
              <button type="button" className="btn-primary" onClick={openCreate}>
                <UserPlus className="h-4 w-4" aria-hidden /> Create user
              </button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard compact label="Total users" value={kpi.total} icon={UsersIcon} tone="accent" sub="All accounts" />
        <KpiCard compact label="Active" value={kpi.active} icon={UserCheck} tone="good" sub="Signed in recently" />
        <KpiCard compact label="Invited" value={kpi.invited} icon={Mail} tone={kpi.invited ? 'warn' : 'default'} sub="Pending first login" />
        <KpiCard compact label="Inactive" value={kpi.inactive} icon={UserMinus} sub="Access revoked" />
        <KpiCard compact label="MFA enabled" value={`${kpi.mfa}%`} icon={ShieldCheck} tone={kpi.mfa >= 80 ? 'good' : 'warn'} sub="Of all accounts" />
      </div>

      <FilterBar search={search} onSearch={setSearch} searchPlaceholder="Search name, email or title…" filters={filterDefs} values={filters} onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={() => { setFilters({}); setSearch('') }} resultCount={rows.length} />

      <Card>
        <DataTable columns={columns} rows={rows} rowKey={(u) => u.id} onRowClick={(u) => select(u.id)} selectedKey={selectedId} pageSize={15} initialSort={{ key: 'name', dir: 'asc' }} caption="User accounts" emptyTitle="No users match" />
      </Card>

      {/* ── User detail drawer ── */}
      <Drawer
        open={!!selected}
        onClose={() => select(null)}
        title={selected ? 'User detail' : ''}
        subtitle={selected ? `${selected.email} · ${ROLE_LABELS[selected.role]}` : undefined}
        width="xl"
        footer={
          selected && selectedManageable ? (
            <>
              <button type="button" className="btn-secondary btn-sm" onClick={openEdit} disabled={busy}>
                <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirm('reset')} disabled={busy}>
                <KeyRound className="h-3.5 w-3.5" aria-hidden /> Reset password
              </button>
              {selected.status === 'inactive' ? (
                <button type="button" className="btn-primary btn-sm" onClick={() => setConfirm('reactivate')} disabled={busy}>
                  <UserCheck className="h-3.5 w-3.5" aria-hidden /> Reactivate
                </button>
              ) : (
                <button type="button" className="btn-danger btn-sm" onClick={() => setConfirm('deactivate')} disabled={busy || selected.id === me?.id} title={selected.id === me?.id ? 'You cannot deactivate your own account' : undefined}>
                  <UserMinus className="h-3.5 w-3.5" aria-hidden /> Deactivate
                </button>
              )}
            </>
          ) : selected ? (
            <span className="text-xs text-slate-500">You can view this account but not manage it.</span>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <Avatar name={selected.name} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{selected.name}</h3>
                  <StatusBadge status={selected.status} />
                  {selected.mfaEnabled ? <Badge tone="green" icon={ShieldCheck}>MFA enabled</Badge> : <Badge tone="slate" icon={ShieldOff}>MFA not enrolled</Badge>}
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{selected.title}</p>
              </div>
            </div>

            <DescriptionList
              columns={2}
              items={[
                { label: 'Email', value: selected.email },
                { label: 'Created', value: fmtDate(selected.createdAt) },
                { label: 'Last login', value: selected.lastLogin ? `${fmtDateTime(selected.lastLogin)} (${relativeTime(selected.lastLogin, now)})` : 'Never' },
                { label: 'Linked shopper', value: selected.shopperId ? data.shoppers.find((s) => s.id === selected.shopperId)?.name ?? selected.shopperId : '—' },
              ]}
            />

            <Divider />

            <section>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="section-title">Role &amp; permissions</h4>
                {selectedManageable && (
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    Assign role
                    <Select value={selected.role} onChange={(e) => void assignRole(e.target.value as Role)} className="!w-auto !py-1.5 text-xs" aria-label="Assign role" disabled={busy || selected.id === me?.id}>
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r} disabled={!manageableRoles.includes(r)}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                <Badge tone={ROLE_TONE[selected.role]} size="md">{ROLE_LABELS[selected.role]}</Badge>
                <span className="ml-2 text-xs text-slate-500">{grantedPermissions(selected.role).length} of {Object.keys(PERMISSIONS).length} permissions</span>
              </p>
              <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {grantedPermissions(selected.role).map((p) => (
                  <li key={p} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
                    <span>
                      {PERMISSIONS[p]} <span className="font-mono text-[10px] text-slate-400">{p}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <Divider />

            <section>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="section-title">Authorised outlets</h4>
                {selectedManageable && (
                  <button type="button" className="btn-primary btn-sm" onClick={() => void saveScope()} disabled={busy || !scopeDirty}>
                    Save authorisation
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {selected.role === 'ops_manager' ? 'Operations managers only see the outlets ticked below.' : 'Leave empty to authorise all outlets for this role.'}
              </p>
              <div className="mt-3">
                <OutletPicker selected={outletDraft} onChange={setOutletDraft} disabled={!selectedManageable || busy} />
              </div>
              <h5 className="mt-4 text-xs font-medium text-slate-600 dark:text-slate-400">Brands</h5>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {data.brands.map((b) => (
                  <Checkbox key={b.id} label={<span>{b.name} <span className="text-[10px] text-slate-400">· {b.segment}</span></span>} checked={brandDraft.includes(b.id)} onChange={() => setBrandDraft((s) => (s.includes(b.id) ? s.filter((x) => x !== b.id) : [...s, b.id]))} disabled={!selectedManageable || busy} />
                ))}
              </div>
            </section>

            <Divider />

            <section>
              <h4 className="section-title">Activity history</h4>
              {history.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No activity recorded for this user.</p>
              ) : (
                <ol className="relative mt-3 ml-2 space-y-3 border-l border-slate-200 dark:border-navy-700">
                  {history.map((l) => (
                    <li key={l.id} className="ml-4">
                      <span className={cn('absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white dark:ring-navy-900', l.result === 'Success' ? 'bg-teal-500' : l.result === 'Denied' ? 'bg-red-500' : 'bg-amber-500')} aria-hidden />
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{l.action}</p>
                        <Badge tone="slate" size="xs">{l.module}</Badge>
                        <time className="text-[11px] text-slate-500" dateTime={l.timestamp}>{fmtDateTime(l.timestamp)}</time>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono">{l.recordId}</span>
                        {l.details ? ` · ${l.details}` : ''} · {l.result}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </Drawer>

      {/* ── Create / edit modals ── */}
      <Modal
        open={createOpen || editOpen}
        onClose={() => { setCreateOpen(false); setEditOpen(false) }}
        title={createOpen ? 'Create user' : `Edit ${selected?.name ?? 'user'}`}
        description={
          createOpen
            ? isLiveMode()
              ? 'Creates the login, the role and the outlet access in one step.'
              : 'The account is created in “Invited” status and receives an onboarding email (demo).'
            : 'Update profile details and role.'
        }
        size="md"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => { setCreateOpen(false); setEditOpen(false) }} disabled={busy}>
              Cancel
            </button>
            <button type="submit" form="user-form" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : createOpen ? 'Create user' : 'Save changes'}
            </button>
          </>
        }
      >
        <form id="user-form" onSubmit={createOpen ? submitCreate : submitEdit} className="space-y-4" noValidate>
          {/* In Live Mode the password lives in Supabase Auth, not here. Creating a
              profile alone leaves someone unable to sign in, which looks like a
              broken login rather than a missing step — so say it plainly. */}
          {createOpen && isLiveMode() && (
            <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                This creates a working login. A temporary password is generated and shown to you
                once, on the next screen — it is not emailed, so you will need to pass it on
                yourself and ask them to change it.
              </p>
            </div>
          )}
          <Field label="Full name" required error={errors.name} htmlFor="user-name">
            <Input id="user-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} invalid={!!errors.name} autoComplete="off" />
          </Field>
          <Field label="Email" required error={errors.email} htmlFor="user-email">
            <Input id="user-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} invalid={!!errors.email} autoComplete="off" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Role" required error={errors.role} htmlFor="user-role" hint={!canAll ? 'Client administrators can manage stakeholder roles only.' : undefined}>
              <Select id="user-role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))} invalid={!!errors.role} disabled={editOpen && selected?.id === me?.id}>
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r} disabled={!manageableRoles.includes(r)}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Job title" htmlFor="user-title">
              <Input id="user-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Regional Operations Manager" />
            </Field>
          </div>
          {createOpen && form.role === 'ops_manager' && (
            <Field label="Authorised outlets" required error={errors.outletIds} hint="Operations managers are restricted to their assigned outlets.">
              <OutletPicker selected={form.outletIds} onChange={(ids) => setForm((f) => ({ ...f, outletIds: ids }))} />
            </Field>
          )}
        </form>
      </Modal>

      {/* ── Credentials, shown once ──
          The temporary password exists nowhere else: it is not stored, not
          emailed and not recoverable. Closing this dialog is the last chance to
          copy it, so say so rather than letting it disappear quietly. */}
      <Modal
        open={credentials !== null}
        onClose={() => setCredentials(null)}
        title={credentials?.password ? 'Account created' : 'Account linked'}
        description={credentials?.password
          ? 'Share these details with the employee. The password is shown only once.'
          : 'This person already had a login, so their existing password still applies.'}
        size="md"
        footer={
          <button type="button" className="btn-primary" onClick={() => setCredentials(null)}>
            Done
          </button>
        }
      >
        {credentials && (
          <div className="space-y-4">
            <DescriptionList
              columns={1}
              items={[
                { label: 'Name', value: credentials.name },
                { label: 'Email', value: <span className="font-mono text-sm">{credentials.email}</span> },
                ...(credentials.password
                  ? [{
                      label: 'Temporary password',
                      value: (
                        <span className="flex items-center gap-2">
                          <code className="select-all rounded bg-slate-100 px-2 py-1 font-mono text-sm tracking-wide dark:bg-navy-800">
                            {credentials.password}
                          </code>
                          <button
                            type="button"
                            className="link text-xs"
                            onClick={() => {
                              void navigator.clipboard?.writeText(credentials.password ?? '')
                              toast.success('Password copied')
                            }}
                          >
                            Copy
                          </button>
                        </span>
                      ),
                    }]
                  : []),
              ]}
            />
            {credentials.password && (
              <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>
                  Send it over a channel only they can read, and ask them to change it after their
                  first sign-in. It is not saved anywhere and cannot be shown again — if it is lost,
                  use <span className="font-medium">Reset password</span> on their account.
                </p>
              </div>
            )}
            {credentials.warning && (
              <p className="text-sm text-amber-700 dark:text-amber-300">{credentials.warning}</p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'deactivate' ? 'Deactivate account' : confirm === 'reactivate' ? 'Reactivate account' : 'Reset password'}
        message={
          confirm === 'deactivate' ? (
            <>
              <strong>{selected?.name}</strong> will lose access immediately. Their audit history is retained.
            </>
          ) : confirm === 'reactivate' ? (
            <>
              Restore access for <strong>{selected?.name}</strong>? Their previous role and outlet authorisation will apply.
            </>
          ) : (
            <>
              A temporary password will be issued to <strong>{selected?.email}</strong> and the user must change it at next login.
            </>
          )
        }
        confirmLabel={confirm === 'deactivate' ? 'Deactivate' : confirm === 'reactivate' ? 'Reactivate' : 'Issue temporary password'}
        tone={confirm === 'deactivate' ? 'danger' : 'default'}
        busy={busy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
