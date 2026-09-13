import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Role, User } from '@/types'
import { getRepository } from '@/repositories'
import { hasPermission, type Permission } from '@/config/permissions'

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
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const repo = getRepository()

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
      return u
    },
    [repo],
  )

  const signOut = useCallback(async () => {
    await repo.signOut()
    setUser(null)
  }, [repo])

  const can = useCallback((permission: Permission) => hasPermission(user?.role, permission), [user])

  const scopedOutletIds = useMemo(() => {
    if (!user) return null
    if (user.role === 'ops_manager') return user.outletIds
    if (user.role === 'client_admin' && user.outletIds.length) return user.outletIds
    return null
  }, [user])

  const value = useMemo(
    () => ({ user, role: user?.role ?? null, loading, signIn, signOut, can, scopedOutletIds, setUser }),
    [user, loading, signIn, signOut, can, scopedOutletIds],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
