import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { ArrowLeftRight, Loader2, Search, Undo2 } from 'lucide-react'
import { REOPEN_SWITCHER_KEY, useAuth } from '@/contexts/AuthContext'
import { useDataState } from '@/contexts/DataContext'
import { ROLE_LABELS } from '@/config/permissions'
import { isDemoMode } from '@/config/app'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Misc'
import { Badge } from '@/components/ui/Badge'
import type { Role, User } from '@/types'
import { cn } from '@/utils/cn'

/** The order accounts are listed in: the people doing the work first. */
const ROLE_ORDER: Role[] = ['shopper', 'client_admin', 'ops_manager', 'analyst', 'executive']

/**
 * One click into any account a super admin manages.
 *
 * Deliberately not on the sign-in page. The application is served from a public
 * address, and a one-click button there would open the client's outlets, scores
 * and reports to anyone who found the link. Here, the administrator has already
 * proved who they are with a password; the switch is checked again on the server
 * and written to the activity log.
 */
export function SwitchAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, switchOrigin, switchAccount, returnToOrigin } = useAuth()
  const { data } = useDataState()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setBusy(null)
    }
  }, [open])

  // Inside a borrowed account the user list is not readable (a shopper sees
  // only themselves), so the picker can only offer the way back.
  const borrowed = !!switchOrigin

  const accounts = useMemo(() => {
    if (!data || !user || borrowed) return []
    const q = query.trim().toLowerCase()
    return data.users
      .filter((u) => u.id !== user.id && u.status === 'active' && u.role !== 'super_admin')
      // A profile with no login behind it cannot be opened — say so up front
      // rather than failing on click. (Demo users all have one.)
      .filter((u) => isDemoMode() || !!(u as User & { authId?: string | null }).authId)
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || ROLE_LABELS[u.role].toLowerCase().includes(q))
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name))
  }, [data, user, borrowed, query])

  const open_ = async (target: User) => {
    setBusy(target.id)
    try {
      await switchAccount(target.id)
      // switchAccount reloads the page; nothing after this line normally runs.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not switch account')
      setBusy(null)
    }
  }

  const back = async (reopen: boolean) => {
    setBusy('origin')
    try {
      await returnToOrigin(reopen)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not switch back')
      setBusy(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Switch account" description={borrowed ? `You are working as ${user?.name}.` : 'Open any account in one click — no password needed. Every switch is recorded in the activity log.'} size="md">
      {borrowed ? (
        <div className="space-y-2">
          <button type="button" className="btn-accent w-full justify-center" disabled={busy !== null} onClick={() => void back(false)}>
            {busy === 'origin' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Back to {switchOrigin?.name}
          </button>
          <button type="button" className="btn-secondary w-full justify-center" disabled={busy !== null} onClick={() => void back(true)}>
            <ArrowLeftRight className="h-4 w-4" /> Switch to a different account
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email or role…" className="input pl-9" aria-label="Search accounts" autoFocus />
          </div>
          {accounts.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-navy-700 dark:text-slate-400">
              {query ? 'No account matches.' : 'No other accounts yet. Create shoppers and reviewers under Administration → Users, then switch into them here.'}
            </p>
          ) : (
            <ul className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
              {accounts.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void open_(u)}
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-teal-400 disabled:opacity-60 dark:border-navy-700 dark:bg-navy-900/70 dark:hover:border-teal-500',
                      busy === u.id && 'border-teal-500 ring-2 ring-teal-500/25',
                    )}
                  >
                    <Avatar name={u.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{u.name}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{u.email}</span>
                    </span>
                    <Badge tone={u.role === 'shopper' ? 'teal' : 'slate'} size="xs">
                      {ROLE_LABELS[u.role]}
                    </Badge>
                    {busy === u.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-teal-600" /> : <ArrowLeftRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-teal-600" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  )
}

/**
 * Says, on every screen, whose account this is while an administrator is
 * borrowing it — anything submitted or approved here is recorded under that
 * person's name.
 */
export function SwitchedBanner() {
  const { user, switchOrigin, returnToOrigin } = useAuth()
  const [busy, setBusy] = useState(false)
  if (!switchOrigin || !user) return null
  return (
    <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-teal-300/70 bg-teal-50 px-4 py-2 text-teal-900 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-100 md:px-6 lg:px-8">
      <ArrowLeftRight className="h-4 w-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 text-xs leading-relaxed">
        Working as <span className="font-semibold">{user.name}</span> ({ROLE_LABELS[user.role]}). Anything you save is recorded under this account. Switched from {switchOrigin.name}.
      </p>
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          returnToOrigin().catch((e) => {
            toast.error(e instanceof Error ? e.message : 'Could not switch back')
            setBusy(false)
          })
        }}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />} Back to {switchOrigin.name}
      </button>
    </div>
  )
}

/** Opens the picker again after "Switch to a different account" reloaded the app as the administrator. */
export function useReopenSwitcher(setOpen: (open: boolean) => void) {
  const { user } = useAuth()
  useEffect(() => {
    if (!user) return
    try {
      if (sessionStorage.getItem(REOPEN_SWITCHER_KEY)) {
        sessionStorage.removeItem(REOPEN_SWITCHER_KEY)
        setOpen(true)
      }
    } catch {
      /* storage unavailable */
    }
  }, [user, setOpen])
}
