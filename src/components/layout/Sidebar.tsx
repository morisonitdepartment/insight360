import { NavLink } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight, PlayCircle, X } from 'lucide-react'
import { NAVIGATION } from '@/config/navigation'
import { hasAnyPermission, hasPermission, ROLE_LABELS } from '@/config/permissions'
import { useAuth } from '@/contexts/AuthContext'
import { useGuidedDemo } from '@/contexts/GuidedDemoContext'
import { APP_CONFIG, isDemoMode } from '@/config/app'
import { cn } from '@/utils/cn'

export function BrandMark({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-12 w-12' : 'h-9 w-9'
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-lg bg-navy-900 dark:bg-teal-600', s, className)} aria-hidden>
      <svg viewBox="0 0 64 64" className="h-[62%] w-[62%]">
        <circle cx="32" cy="32" r="17" fill="none" stroke="#43bcb7" strokeWidth="6" className="dark:stroke-white" />
        <circle cx="32" cy="32" r="6" fill="#43bcb7" className="dark:fill-white" />
        <path d="M32 6v9M32 49v9M6 32h9M49 32h9" stroke="#43bcb7" strokeWidth="5" strokeLinecap="round" className="dark:stroke-white" />
      </svg>
    </span>
  )
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onMobileClose: () => void }) {
  const { user, role } = useAuth()
  const demo = useGuidedDemo()

  const groups = NAVIGATION.map((g) => ({
    ...g,
    items: g.items.filter((it) => hasPermission(role, it.permission) || (it.anyOf ? hasAnyPermission(role, it.anyOf) : false)),
  })).filter((g) => g.items.length)

  const content = (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 items-center gap-3 border-b border-navy-800 px-4', collapsed && 'justify-center px-2')}>
        <BrandMark />
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-[15px] font-bold tracking-tight text-white leading-none">{APP_CONFIG.name}</p>
            <p className="mt-1 truncate text-[10px] font-medium uppercase tracking-wider text-navy-300">Mystery Shopping Intelligence</p>
          </div>
        )}
        <button type="button" onClick={onMobileClose} className="ml-auto rounded-md p-1.5 text-navy-300 hover:bg-navy-800 hover:text-white lg:hidden" aria-label="Close navigation">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Primary">
        {groups.map((g) => (
          <div key={g.title} className="mb-3">
            {!collapsed && <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-navy-400">{g.title}</p>}
            {collapsed && <div className="mx-3 my-2 border-t border-navy-800" aria-hidden />}
            <ul className="space-y-0.5">
              {g.items.map((it) => (
                <li key={it.path}>
                  <NavLink
                    to={it.path}
                    end={it.path === '/'}
                    onClick={onMobileClose}
                    title={collapsed ? it.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                        isActive ? 'bg-teal-500/15 text-white ring-1 ring-inset ring-teal-500/30' : 'text-navy-200 hover:bg-navy-800 hover:text-white',
                        collapsed && 'justify-center px-2',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <it.icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-teal-300' : 'text-navy-400 group-hover:text-teal-300')} aria-hidden />
                        {!collapsed && <span className="truncate">{it.label}</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-navy-800 p-3 space-y-2">
        {isDemoMode() && role !== 'shopper' && (
          <button type="button" onClick={demo.start} className={cn('flex w-full items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-[13px] font-semibold text-white hover:bg-teal-500 transition-colors', collapsed && 'justify-center px-2')} title="Launch Guided Demo">
            <PlayCircle className="h-4 w-4 shrink-0" aria-hidden />
            {!collapsed && 'Launch Guided Demo'}
          </button>
        )}
        {!collapsed && user && (
          <div className="rounded-lg bg-navy-800/60 px-3 py-2">
            <p className="truncate text-xs font-medium text-white">{user.name}</p>
            <p className="truncate text-[11px] text-navy-300">{ROLE_LABELS[user.role]}</p>
          </div>
        )}
        <button type="button" onClick={onToggle} className="hidden lg:flex w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs text-navy-300 hover:bg-navy-800 hover:text-white" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop */}
      <aside className={cn('hidden lg:flex fixed inset-y-0 left-0 z-40 flex-col bg-navy-900 text-white transition-[width] duration-200 border-r border-navy-800', collapsed ? 'w-[68px]' : 'w-64')}>{content}</aside>
      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={onMobileClose} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 bg-navy-900 text-white shadow-panel animate-fade-in">{content}</aside>
        </div>
      )}
    </>
  )
}
