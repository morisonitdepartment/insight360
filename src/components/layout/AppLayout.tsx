import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Filter } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { Breadcrumbs } from './Breadcrumbs'
import { GuidedDemoOverlay } from '@/components/guided/GuidedDemoOverlay'
import { useLocalStorage } from '@/hooks'
import { useDataState } from '@/contexts/DataContext'
import { useFilters } from '@/contexts/FilterContext'
import { ErrorState, LoadingState, PageSkeleton } from '@/components/ui/States'
import { cn } from '@/utils/cn'
import { isDemoMode } from '@/config/app'
import { CLIENT_BRAND } from '@/config/client'

export function AppLayout() {
  const [collapsed, setCollapsed] = useLocalStorage('sidebar.collapsed', false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { loading, error, reload, data, isOutletFiltered } = useDataState()
  const { outletScope, setOutletScope } = useFilters()
  const filteredOutlet = data?.outlets.find((o) => o.id === outletScope) ?? null
  const location = useLocation()

  useEffect(() => {
    setMobileOpen(false)
    if (!location.hash) window.scrollTo({ top: 0 })
  }, [location.pathname, location.hash])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-navy-950">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className={cn('flex min-h-screen flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-[68px]' : 'lg:pl-64')}>
        <Topbar onMenu={() => setMobileOpen(true)} />
        {isDemoMode() && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-1 text-center text-[11px] font-medium text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200 no-print">
            Demo mode · synthetic data for demonstration purposes · fixed reporting date 13 Sep 2026
          </div>
        )}
        {isOutletFiltered && filteredOutlet && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-teal-200 bg-teal-50 px-4 py-1.5 text-[11px] text-teal-900 dark:border-teal-500/25 dark:bg-teal-500/10 dark:text-teal-200 no-print">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Filter className="h-3.5 w-3.5" aria-hidden />
              Filtered to {filteredOutlet.name}
            </span>
            <span className="text-teal-800/70 dark:text-teal-300/70">Dashboards, registers and reports show this outlet only.</span>
            <button type="button" onClick={() => setOutletScope('all')} className="font-semibold underline underline-offset-2 hover:no-underline">
              Show all outlets
            </button>
          </div>
        )}
        <main id="main" className="flex-1 px-4 py-5 md:px-6 lg:px-8 max-w-[1680px] w-full mx-auto">
          <div className="mb-4">
            <Breadcrumbs />
          </div>
          {loading && !data ? (
            <LoadingState full label="Loading workspace…" />
          ) : error ? (
            <ErrorState title="Unable to load data" message={error} onRetry={() => void reload()} />
          ) : data ? (
            <Suspense fallback={<PageSkeleton />}>
              <div className="animate-fade-in">
                <Outlet />
              </div>
            </Suspense>
          ) : null}
        </main>
        <footer className="px-6 py-4 text-center text-[11px] text-slate-400 dark:text-slate-500 no-print">
          {CLIENT_BRAND.name} · Mystery Shopping Intelligence Platform · Customer Experience • Compliance • Analytics • Continuous Improvement
        </footer>
      </div>
      <GuidedDemoOverlay />
    </div>
  )
}
