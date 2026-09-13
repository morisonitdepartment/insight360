import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useDataState } from '@/contexts/DataContext'
import { logAccessDenied } from '@/services/actions'
import { ROLE_LABELS } from '@/config/permissions'

export function ForbiddenPage() {
  const { user } = useAuth()
  const { data, dispatch } = useDataState()
  const { pathname } = useLocation()

  useEffect(() => {
    if (data && user) void dispatch((d, ctx) => logAccessDenied(d, ctx, pathname)).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center" role="alert">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
        <ShieldOff className="h-7 w-7" aria-hidden />
      </span>
      <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-slate-400">Error 403</p>
      <h1 className="mt-1 text-2xl font-semibold">Access restricted</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
        Your role{user ? ` (${ROLE_LABELS[user.role]})` : ''} does not include permission to view this area. The attempt has been recorded in the activity log.
      </p>
      <Link to="/" className="btn-primary mt-6">
        Back to overview
      </Link>
    </div>
  )
}

export default ForbiddenPage
