import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { Permission } from '@/config/permissions'
import { LoadingState } from '@/components/ui/States'
import { ForbiddenPage } from '@/pages/ForbiddenPage'

/** Requires an authenticated session. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingState full label="Restoring session…" />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}

/** Requires one of the given permissions; renders the 403 page otherwise (and logs it). */
export function Guard({ permission, anyOf, children }: { permission?: Permission; anyOf?: Permission[]; children: ReactNode }) {
  const { can } = useAuth()
  const allowed = (permission ? can(permission) : false) || (anyOf ? anyOf.some((p) => can(p)) : false) || (!permission && !anyOf)
  if (!allowed) return <ForbiddenPage />
  return <>{children}</>
}

/** Redirects signed-in users away from the login page. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingState full />
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}
