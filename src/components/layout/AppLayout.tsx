import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Info } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { SwitchedBanner } from './SwitchAccount'
import { Breadcrumbs } from './Breadcrumbs'
import { GuidedDemoOverlay } from '@/components/guided/GuidedDemoOverlay'
import { useLocalStorage } from '@/hooks'
import { useDataState } from '@/contexts/DataContext'
import { ErrorState, LoadingState, PageSkeleton } from '@/components/ui/States'
import { cn } from '@/utils/cn'
import { isDemoMode } from '@/config/app'
import { CLIENT_BRAND } from '@/config/client'

/**
 * Says, where somebody cannot miss it, that this is the demonstration.
 *
 * The demo and the live system are the same interface one URL segment apart
 * (`/insight360/` against `/insight360/app/`), and the only signs of which one
 * you were in were a badge inside the profile menu and grey eleven-pixel footer
 * text. A colleague spent two evenings entering real outlets and real visits
 * into the demonstration, where they were written to their own browser and
 * nowhere else. Nobody reads the footer while filling in a form.
 *
 * Worded for both audiences: a prospect reads a normal sandbox notice, and
 * somebody about to type real data reads a warning.
 */
function DemoNotice() {
  return (
    <div className="no-print flex items-start gap-2.5 border-b border-amber-300/70 bg-amber-50 px-4 py-2 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 md:px-6 lg:px-8">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="text-xs leading-relaxed">
        <span className="font-semibold">Demonstration environment.</span> Everything here is sample data, and anything you enter is kept in this browser
        only — it is never sent to a server, and it is cleared whenever the demonstration is updated.
      </p>
    </div>
  )
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useLocalStorage('sidebar.collapsed', false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { loading, error, reload, data } = useDataState()
  const location = useLocation()

  useEffect(() => {
    setMobileOpen(false)
    if (!location.hash) window.scrollTo({ top: 0 })
  }, [location.pathname, location.hash])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-navy-950">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className={cn('flex min-h-screen flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-[68px]' : 'lg:pl-64')}>
        {isDemoMode() && <DemoNotice />}
        <SwitchedBanner />
        <Topbar onMenu={() => setMobileOpen(true)} />
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
          {isDemoMode() && ' · Demo data'}
        </footer>
      </div>
      <GuidedDemoOverlay />
    </div>
  )
}
