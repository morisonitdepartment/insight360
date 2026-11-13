import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Role, User } from '@/types'
import { getRepository, type SwitchOrigin } from '@/repositories'
import { hasPermission, type Permission } from '@/config/permissions'

/** Set before a reload so the account picker opens again on the other side. */
export const REOPEN_SWITCHER_KEY = 'insight360.switch.reopen'

interface AuthContextValue {
  user: User | null
  role: Role | null
  loading: boolean
  signIn: (email: string, password: string, remember: boolean) => Promise<User>
  signOut: () => Promise<void>
  can: (permission: Permission) => boolean
  /** Whether the user is limited to specific outlets (ops manager) */
  scopedOutletIds: string[] | null
  /** Refresh the in-memory user (e.g. after profile edits) */
  setUser: (u: User | null) => void
  /** The administrator this session was switched from, or null. */
  switchOrigin: SwitchOrigin | null
  /** Whether "Switch account" is available to this session at all. */
  canSwitch: boolean
  /** Open another user's account. Reloads the app on success. */
  switchAccount: (userId: string) => Promise<void>
  /**
   * Back to the administrator. With `reopenPicker`, the account picker opens
   * again once the administrator's workspace has loaded — "switch to someone
   * else" from inside a borrowed account, which cannot list users itself.
   */
  returnToOrigin: (reopenPicker?: boolean) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * A full reload rather than a state reset: every cached query, every filter and
 * every in-memory dataset belongs to the previous person, and Live Mode must
 * re-read the database under the new person's row-level security.
 */
function reloadApp() {
  window.location.replace(import.meta.env.BASE_URL)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const repo = getRepository()
  const [switchOrigin, setSwitchOrigin] = useState<SwitchOrigin | null>(() => repo.switchOrigin())

  useEffect(() => {
    let active = true
    repo
      .restoreSession()
      .then((u) => {
        if (active) setUser(u)
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [repo])

  const signIn = useCallback(
    async (email: string, password: string, remember: boolean) => {
      const u = await repo.signIn(email, password, remember)
      setUser(u)
      setSwitchOrigin(repo.switchOrigin())
      return u
    },
    [repo],
  )

  const signOut = useCallback(async () => {
    await repo.signOut()
    setSwitchOrigin(null)
    setUser(null)
  }, [repo])

  const switchAccount = useCallback(
    async (userId: string) => {
      await repo.switchAccount(userId)
      reloadApp()
    },
    [repo],
  )

  const returnToOrigin = useCallback(
    async (reopenPicker = false) => {
      await repo.returnToOrigin()
      if (reopenPicker) {
        try {
          sessionStorage.setItem(REOPEN_SWITCHER_KEY, '1')
        } catch {
          /* storage unavailable — the picker simply stays closed */
        }
      }
      reloadApp()
    },
    [repo],
  )

  const can = useCallback((permission: Permission) => hasPermission(user?.role, permission), [user])

  const scopedOutletIds = useMemo(() => {
    if (!user) return null
    if (user.role === 'ops_manager') return user.outletIds
    if (user.role === 'client_admin' && user.outletIds.length) return user.outletIds
    return null
  }, [user])

  const canSwitch = !!user && (user.role === 'super_admin' || !!switchOrigin)

  const value = useMemo(
    () => ({ user, role: user?.role ?? null, loading, signIn, signOut, can, scopedOutletIds, setUser, switchOrigin, canSwitch, switchAccount, returnToOrigin }),
    [user, loading, signIn, signOut, can, scopedOutletIds, switchOrigin, canSwitch, switchAccount, returnToOrigin],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
