import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'
import { ROUTE_LABELS } from '@/config/navigation'
import { useDataState } from '@/contexts/DataContext'

export function Breadcrumbs() {
  const { pathname } = useLocation()
  const { data } = useDataState()
  const segments = pathname.split('/').filter(Boolean)
  if (!segments.length) return null

  const crumbs = segments.map((seg, i) => {
    const path = `/${segments.slice(0, i + 1).join('/')}`
    let label = ROUTE_LABELS[seg]
    if (!label && data) {
      const outlet = data.outlets.find((o) => o.id === seg)
      const visit = data.visits.find((v) => v.id === seg)
      const shopper = data.shoppers.find((s) => s.id === seg)
      label = outlet?.name ?? visit?.code ?? shopper?.name ?? seg
    }
    // Group-only segments have no page of their own
    const linkable = !['operations', 'performance', 'quality', 'reports', 'admin'].includes(seg)
    return { path, label: label ?? seg, linkable }
  })

  return (
    <nav aria-label="Breadcrumb" className="no-print">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
        <li>
          <Link to="/" className="inline-flex items-center hover:text-slate-800 dark:hover:text-white" aria-label="Overview">
            <Home className="h-3.5 w-3.5" />
          </Link>
        </li>
        {crumbs.map((c, i) => (
          <li key={c.path} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-slate-300 dark:text-slate-600" aria-hidden />
            {i === crumbs.length - 1 || !c.linkable ? (
              <span className={i === crumbs.length - 1 ? 'font-medium text-slate-800 dark:text-slate-100' : ''} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>
                {c.label}
              </span>
            ) : (
              <Link to={c.path} className="hover:text-slate-800 dark:hover:text-white">
                {c.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
