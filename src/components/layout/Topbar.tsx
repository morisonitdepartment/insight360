import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeftRight, Bell, Building2, CalendarRange, ChevronDown, ClipboardList, FileText, LogOut, Menu, Moon, Search, Store, Sun, Undo2, User as UserIcon, Wrench, BellRing, UserCog } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useDataState } from '@/contexts/DataContext'
import { useTheme } from '@/contexts/ThemeContext'
import { PERIOD_OPTIONS, useFilters, type PresetPeriod } from '@/contexts/FilterContext'
import { BRAND_SCOPE, TAG_SCOPE, tagsInUse } from '@/services/groups'
import { fmtDate } from '@/utils/format'
import { ROLE_LABELS } from '@/config/permissions'
import { isDemoMode } from '@/config/app'
import { markNotificationRead } from '@/services/actions'
import { Avatar } from '@/components/ui/Misc'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/utils/cn'
import { relativeTime } from '@/utils/format'
import { useNow } from '@/hooks'
import { T } from '@/config/terms'
import { SwitchAccountModal, useReopenSwitcher } from './SwitchAccount'

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', key)
    }
  }, [ref, onClose, active])
}

interface SearchResult {
  type: string
  icon: typeof Store
  title: string
  sub: string
  path: string
}

function GlobalSearch() {
  const { data, scopedOutlets, scopedVisits } = useDataState()
  const { can } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useClickOutside(ref, () => setOpen(false), open)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const results = useMemo<SearchResult[]>(() => {
    const term = q.trim().toLowerCase()
    if (!data || term.length < 2) return []
    const out: SearchResult[] = []
    const ids = new Set(scopedOutlets.map((o) => o.id))
    const outletName = (id: string) => data.outlets.find((o) => o.id === id)?.name ?? ''
    if (can('outlets.view'))
      for (const o of scopedOutlets) if (`${o.name} ${o.code} ${o.brand} ${o.location}`.toLowerCase().includes(term)) out.push({ type: 'Outlet', icon: Store, title: o.name, sub: `${o.code} · ${o.subcategory} · ${o.location}`, path: `/performance/outlets/${o.id}` })
    if (can('visits.view'))
      for (const v of scopedVisits) if (`${v.code} ${v.type} ${outletName(v.outletId)}`.toLowerCase().includes(term)) out.push({ type: 'Visit', icon: ClipboardList, title: `${v.code} · ${v.type}`, sub: `${outletName(v.outletId)} · ${v.status}`, path: `/operations/visits/${v.id}` })
    if (can('reports.visit'))
      for (const v of scopedVisits.filter((x) => x.score !== null)) if (`report ${v.code} ${outletName(v.outletId)}`.toLowerCase().includes(term) && term.includes('rep')) out.push({ type: 'Report', icon: FileText, title: `Visit report ${v.code}`, sub: outletName(v.outletId), path: `/reports/visits/${v.id}` })
    if (can('reports.management')) for (const r of data.reports) if (`${r.title} ${r.code} ${r.type}`.toLowerCase().includes(term)) out.push({ type: 'Report', icon: FileText, title: r.title, sub: `${r.code} · ${r.period}`, path: `/reports/management?report=${r.id}` })
    if (can('findings.view'))
      for (const f of data.findings.filter((x) => ids.has(x.outletId))) if (`${f.title} ${f.code}`.toLowerCase().includes(term)) out.push({ type: 'Finding', icon: AlertTriangle, title: f.title, sub: `${f.code} · ${f.severity} · ${outletName(f.outletId)}`, path: `/quality/findings?finding=${f.id}` })
    if (can('alerts.view'))
      for (const a of data.alerts.filter((x) => ids.has(x.outletId))) if (`${a.title} ${a.code} ${a.type}`.toLowerCase().includes(term)) out.push({ type: 'Alert', icon: BellRing, title: a.title, sub: `${a.code} · ${a.severity} · ${a.status}`, path: `/quality/alerts?alert=${a.id}` })
    if (can('actions.view'))
      for (const c of data.correctiveActions.filter((x) => ids.has(x.outletId))) if (`${c.title} ${c.code}`.toLowerCase().includes(term)) out.push({ type: 'Corrective action', icon: Wrench, title: c.title, sub: `${c.code} · ${c.status} · ${outletName(c.outletId)}`, path: `/quality/corrective-actions?action=${c.id}` })
    if (can('admin.users') || can('admin.stakeholders')) for (const u of data.users) if (`${u.name} ${u.email} ${u.title}`.toLowerCase().includes(term)) out.push({ type: 'User', icon: UserCog, title: u.name, sub: `${u.email} · ${ROLE_LABELS[u.role]}`, path: `/admin/users?user=${u.id}` })
    return out.slice(0, 12)
  }, [q, data, scopedOutlets, scopedVisits, can])

  const go = (r: SearchResult) => {
    setOpen(false)
    setQ('')
    navigate(r.path)
  }

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setCursor(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setCursor((c) => Math.min(results.length - 1, c + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setCursor((c) => Math.max(0, c - 1))
          } else if (e.key === 'Enter' && results[cursor]) go(results[cursor])
        }}
        placeholder={`Search ${T.outlets}, visits, findings, alerts, actions, users…`}
        className="input h-9 pl-9 pr-16 !rounded-full bg-slate-100 dark:bg-navy-800 border-transparent focus:bg-white"
        aria-label="Global search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="global-search-results"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden md:inline-flex kbd">Ctrl K</span>
      {open && q.trim().length >= 2 && (
        <div id="global-search-results" role="listbox" className="absolute left-0 right-0 top-full z-50 mt-2 card shadow-panel overflow-hidden animate-fade-in">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">No results for “{q}”.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1">
              {results.map((r, i) => (
                <li key={`${r.type}-${r.path}-${i}`} role="option" aria-selected={i === cursor}>
                  <button type="button" onMouseEnter={() => setCursor(i)} onClick={() => go(r)} className={cn('flex w-full items-center gap-3 px-4 py-2 text-left', i === cursor ? 'bg-slate-100 dark:bg-navy-800' : '')}>
                    <r.icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{r.title}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{r.sub}</span>
                    </span>
                    <Badge tone="slate" size="xs">
                      {r.type}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function NotificationCenter() {
  const { data, dispatch } = useDataState()
  const { role, user } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)

  // A notification addressed to one person reaches only them; the rest go to
  // everyone holding one of their roles. Mirrors notifications_select.
  const list = useMemo(
    () =>
      (data?.notifications ?? [])
        .filter((n) => (n.recipientId ? n.recipientId === user?.id : !role || n.audience.includes(role)))
        .slice(0, 30),
    [data, role, user],
  )
  const unread = list.filter((n) => !n.read).length

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="relative btn-ghost !px-2" aria-label={`Notifications, ${unread} unread`} aria-expanded={open}>
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[360px] max-w-[92vw] card shadow-panel overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-navy-800 px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button type="button" className="text-xs link" onClick={() => void dispatch((d) => markNotificationRead(d, 'all'))}>
                Mark all as read
              </button>
            )}
          </div>
          <ul className="max-h-[420px] overflow-y-auto divide-y divide-slate-100 dark:divide-navy-800">
            {list.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">You’re all caught up.</li>}
            {list.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    void dispatch((d) => markNotificationRead(d, n.id))
                    setOpen(false)
                    navigate(n.link)
                  }}
                  className={cn('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-navy-800', !n.read && 'bg-teal-50/60 dark:bg-teal-500/5')}
                >
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.severity === 'Critical' ? 'bg-red-600' : n.severity === 'High' ? 'bg-amber-500' : n.severity === 'Medium' ? 'bg-blue-500' : 'bg-teal-500', n.read && 'opacity-30')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn('truncate text-sm', !n.read ? 'font-semibold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-200')}>{n.title}</span>
                      <span className="shrink-0 text-[10px] text-slate-400">{relativeTime(n.createdAt, now)}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{n.message}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ProfileMenu() {
  const { user, signOut, canSwitch, switchOrigin, returnToOrigin } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)
  useReopenSwitcher(setSwitching)
  if (!user) return null
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-slate-100 dark:hover:bg-navy-800" aria-expanded={open} aria-haspopup="menu" aria-label={`Account menu for ${user.name}`}>
        <Avatar name={user.name} size="sm" />
        <span className="hidden md:block text-left">
          <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100 leading-tight">{user.name}</span>
          <span className="block text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{ROLE_LABELS[user.role]}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 card shadow-panel overflow-hidden animate-fade-in">
          <div className="border-b border-slate-200 dark:border-navy-800 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{user.name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <Badge tone="teal">{ROLE_LABELS[user.role]}</Badge>
              {isDemoMode() && (
                <Badge tone="amber" size="xs">
                  Demo
                </Badge>
              )}
            </div>
          </div>
          <div className="py-1">
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-navy-800"
              onClick={() => {
                setOpen(false)
                navigate('/profile')
              }}
            >
              <UserIcon className="h-4 w-4 text-slate-400" /> My profile
            </button>
            {canSwitch && (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-navy-800"
                onClick={() => {
                  setOpen(false)
                  setSwitching(true)
                }}
              >
                <ArrowLeftRight className="h-4 w-4 text-slate-400" /> Switch account
              </button>
            )}
            {switchOrigin && (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-500/10"
                onClick={() => {
                  setOpen(false)
                  void returnToOrigin()
                }}
              >
                <Undo2 className="h-4 w-4" /> Back to {switchOrigin.name}
              </button>
            )}
            <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={() => void signOut().then(() => navigate('/login'))}>
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      )}
      <SwitchAccountModal open={switching} onClose={() => setSwitching(false)} />
    </div>
  )
}

function OutletSelector() {
  const { authorizedOutlets, data } = useDataState()
  const { outletScope, setOutletScope } = useFilters()
  const { role } = useAuth()
  const brands = data?.brands ?? []
  // Companies with at least one branch the user may see, and the tags in use on them.
  const companies = brands
    .map((b) => ({ b, n: authorizedOutlets.filter((o) => o.brandId === b.id).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => a.b.name.localeCompare(b.b.name))
  const tags = tagsInUse(authorizedOutlets, brands)
  if (role === 'shopper') return null
  return (
    <label className="hidden xl:flex items-center gap-1.5">
      <Building2 className="h-4 w-4 text-slate-400" aria-hidden />
      <span className="sr-only">{T.Outlet} scope</span>
      <select value={outletScope} onChange={(e) => setOutletScope(e.target.value)} className="select !w-52 !py-1.5 text-xs !rounded-full" aria-label={`${T.Outlet} scope`}>
        <option value="all">All {T.outlets} ({authorizedOutlets.length})</option>
        {companies.length > 0 && (
          <optgroup label="Companies — all branches">
            {companies.map(({ b, n }) => (
              <option key={b.id} value={`${BRAND_SCOPE}${b.id}`}>
                {b.name} ({n})
              </option>
            ))}
          </optgroup>
        )}
        {tags.length > 0 && (
          <optgroup label="Tags">
            {tags.map((t) => (
              <option key={t.tag} value={`${TAG_SCOPE}${t.tag}`}>
                {t.tag} ({t.count})
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label={`Single ${T.outlet}`}>
          {[...authorizedOutlets]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
        </optgroup>
      </select>
    </label>
  )
}

/**
 * The reporting period: a preset, or any custom range. The presets set how far
 * back the trend charts go; a custom range also limits every dashboard, analysis
 * and report to the visits inside it.
 */
function PeriodSelector() {
  const { period, setPeriod, customRange, setCustomRange } = useFilters()
  const now = useNow()
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(customRange?.from ?? fmtDate(new Date(now.getFullYear(), now.getMonth() - 2, 1), 'yyyy-MM-dd'))
  const [to, setTo] = useState(customRange?.to ?? fmtDate(now, 'yyyy-MM-dd'))
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const customLabel = customRange ? `${fmtDate(customRange.from, 'dd MMM yy')} – ${fmtDate(customRange.to, 'dd MMM yy')}` : 'Custom range…'
  const invalid = !from || !to || from > to
  return (
    <div ref={ref} className="relative hidden lg:flex items-center gap-1.5">
      <CalendarRange className="h-4 w-4 text-slate-400" aria-hidden />
      <span className="sr-only">Period</span>
      <select
        value={period}
        onChange={(e) => {
          if (e.target.value === 'custom') setOpen(true)
          else setPeriod(e.target.value as PresetPeriod)
        }}
        className={cn('select !w-44 !py-1.5 text-xs !rounded-full', period === 'custom' && '!border-teal-400 !text-teal-700 dark:!text-teal-300')}
        aria-label="Reporting period"
      >
        {PERIOD_OPTIONS.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
        <option value="custom">{customLabel}</option>
      </select>
      {period === 'custom' && (
        <button type="button" className="text-[11px] font-medium text-teal-700 hover:underline dark:text-teal-300" onClick={() => setOpen((o) => !o)} aria-label="Change the custom date range">
          Edit
        </button>
      )}
      {open && (
        <div role="dialog" aria-label="Custom date range" className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-navy-700 dark:bg-navy-900">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Custom date range</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Dashboards, analytics, reports and exports show only visits inside these dates.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-600 dark:text-slate-300">
              From
              <input type="date" className="input mt-1 !py-1.5 text-xs" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="text-xs text-slate-600 dark:text-slate-300">
              To
              <input type="date" className="input mt-1 !py-1.5 text-xs" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          {invalid && <p className="mt-2 text-xs text-red-600">The start date must be on or before the end date.</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={invalid}
              onClick={() => {
                setCustomRange({ from, to })
                setOpen(false)
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Always on screen while an administrator works as somebody else; the banner above scrolls away. */
function SwitchedChip() {
  const { switchOrigin, returnToOrigin } = useAuth()
  if (!switchOrigin) return null
  return (
    <button
      type="button"
      onClick={() => void returnToOrigin()}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-teal-300 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-800 hover:bg-teal-100 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-teal-200"
      title={`Return to ${switchOrigin.name}'s account`}
    >
      <Undo2 className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Back to</span> {switchOrigin.name.split(' ')[0]}
    </button>
  )
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { theme, toggleTheme } = useTheme()
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-navy-800 dark:bg-navy-900/90 no-print">
      <button type="button" onClick={onMenu} className="btn-ghost !px-2 lg:hidden" aria-label="Open navigation">
        <Menu className="h-5 w-5" />
      </button>
      <GlobalSearch />
      {/* The notice in AppLayout scrolls away under this header, so the warning
          has to live here too — this is the one strip that is always on screen. */}
      {isDemoMode() && (
        <span
          className="hidden shrink-0 items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 sm:inline-flex"
          title="Sample data — anything entered here is kept in this browser only and is never sent to a server."
        >
          Demo data
        </span>
      )}
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <SwitchedChip />
        <OutletSelector />
        <PeriodSelector />
        <button type="button" onClick={toggleTheme} className="btn-ghost !px-2" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title="Toggle theme">
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <NotificationCenter />
        <ProfileMenu />
      </div>
    </header>
  )
}
