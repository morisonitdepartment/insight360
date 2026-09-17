import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowRight, Briefcase, Eye, EyeOff, LineChart, Loader2, LockKeyhole, Mail, Moon, ShieldCheck, ShoppingBag, Sun, UserCog, Users, type LucideIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { APP_CONFIG, isDemoMode } from '@/config/app'
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/config/demoAccounts'
import { ClientLogo } from '@/components/ui/ClientLogo'
import { CLIENT_BRAND } from '@/config/client'
import { Checkbox, Field, Input } from '@/components/ui/Form'
import type { Role } from '@/types'
import { cn } from '@/utils/cn'

const ROLE_ICONS: Record<Role, LucideIcon> = {
  super_admin: UserCog,
  client_admin: Briefcase,
  ops_manager: Users,
  shopper: ShoppingBag,
  analyst: LineChart,
  executive: ShieldCheck,
}

/**
 * Programme figures, matching the seeded dataset exactly.
 *
 * DEMO ONLY. The sign-in page runs before anyone has authenticated, so it cannot
 * read the real programme — and it should not: those totals are the client's
 * business, not something to publish on a public login screen. Showing these
 * numbers in Live Mode would state the demo's 50 outlets and 146 visits as fact
 * to a client who has neither. Live Mode gets `CapabilityPanel` instead, which
 * describes the method and claims no data.
 */
const PROGRAMME = {
  outlets: 50,
  plannedVisits: 200,
  completedVisits: 146,
  visitsPerOutlet: 4,
}

/** What the platform does. True regardless of how much data exists yet. */
const CAPABILITIES: { title: string; detail: string }[] = [
  { title: 'Weighted scoring', detail: 'Category weights roll up to outlet, brand and portfolio' },
  { title: 'Critical-finding escalation', detail: 'Failures raise an alert with an escalation clock' },
  { title: 'Corrective actions', detail: 'Owners, target dates and verification on every finding' },
  { title: '24–48h reporting', detail: 'Reports due within 48 hours, targeted at 24' },
]

function CapabilityPanel() {
  return (
    <div className="hidden rounded-xl border border-white/10 bg-white/[0.04] p-5 lg:block">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-300">How it works</p>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
        {CAPABILITIES.map((c) => (
          <div key={c.title}>
            <dt className="text-[13px] font-semibold leading-tight text-white">{c.title}</dt>
            <dd className="mt-1 text-[11px] leading-snug text-navy-300">{c.detail}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Shape of the 12-month portfolio trend, drawn as an unlabelled flourish. */
const TREND = [82.6, 84.7, 82.4, 86.7, 84.5, 84.6, 85.4, 89.0, 89.2, 86.4, 85.2, 86.3]

function TrendFlourish() {
  const min = Math.min(...TREND)
  const max = Math.max(...TREND)
  const range = max - min || 1
  const pts = TREND.map((v, i) => [(i / (TREND.length - 1)) * 300, 60 - ((v - min) / range) * 46 - 7])
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `0,60 ${line} 300,60`
  return (
    <svg viewBox="0 0 300 60" className="h-14 w-full" preserveAspectRatio="none" aria-hidden focusable="false">
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f46b25" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f46b25" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#trend-fill)" />
      <polyline points={line} fill="none" stroke="#ff9e6b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {pts.slice(-1).map(([x, y]) => (
        <circle key="last" cx={x} cy={y} r="3" fill="#ff9e6b" />
      ))}
    </svg>
  )
}

function CompletionRing({ value, max }: { value: number; max: number }) {
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 120)
    return () => clearTimeout(t)
  }, [])
  const size = 92
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.round((value / max) * 100)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value} of ${max} visits completed, ${pct} percent`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#f46b25"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={drawn ? c * (1 - value / max) : c}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold leading-none text-white tabular-nums">{pct}%</span>
        <span className="mt-0.5 text-[9px] uppercase tracking-wider text-navy-300">complete</span>
      </span>
    </div>
  )
}

export default function LoginPage() {
  const { signIn } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const doSignIn = async (e: string, p: string, key: string) => {
    setBusy(key)
    setError(null)
    try {
      const user = await signIn(e, p, remember)
      toast.success(`Welcome back, ${user.name.split(' ')[0]}`)
      navigate(from === '/login' ? '/' : from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(null)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Enter your email address and password.')
      return
    }
    void doSignIn(email, password, 'form')
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-navy-950 px-4 py-6 sm:px-6 lg:py-10">
      {/* Atmospheric backdrop */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-br from-navy-900 via-navy-950 to-[#0a1a24]" />
        <div className="animate-drift absolute -left-40 top-[-15%] h-[42rem] w-[42rem] rounded-full bg-teal-500/10 blur-[110px]" />
        <div className="animate-drift absolute -right-32 bottom-[-20%] h-[38rem] w-[38rem] rounded-full bg-navy-500/25 blur-[120px]" style={{ animationDelay: '-9s' }} />
        <svg className="absolute inset-0 h-full w-full opacity-[0.05]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="login-grid" width="44" height="44" patternUnits="userSpaceOnUse">
              <path d="M44 0H0V44" fill="none" stroke="white" strokeWidth="0.7" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#login-grid)" />
        </svg>
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-navy-950 to-transparent" />
      </div>

      {/* Theme toggle */}
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-navy-200 backdrop-blur transition-colors hover:bg-white/10 hover:text-white"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      {/* Floating pane */}
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center">
        <div className="animate-rise-in grid w-full overflow-hidden rounded-2xl border border-white/10 bg-navy-900/70 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.65)] backdrop-blur-xl lg:grid-cols-[1.05fr_1fr]">
          {/* ── Brand / story ── */}
          <section className="relative flex flex-col justify-between gap-6 border-b border-white/10 bg-gradient-to-br from-navy-900 to-navy-950 px-7 py-7 text-white sm:px-10 lg:gap-8 lg:border-b-0 lg:border-r lg:py-10">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <ClientLogo size="md" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-300">{APP_CONFIG.tagline}</span>
              </div>

              <h1 className="mt-6 text-[26px] font-semibold leading-[1.15] tracking-tight !text-white sm:text-[32px] lg:mt-12 lg:text-[38px]">
                Turn every customer
                <br className="hidden sm:block" /> interaction into{' '}
                <span className="bg-gradient-to-r from-teal-300 to-teal-100 bg-clip-text text-transparent">actionable intelligence.</span>
              </h1>
              <p className="mt-3 max-w-md text-[13px] leading-relaxed text-navy-200 sm:text-sm lg:mt-4">
                Evidence-based mystery shopping across food &amp; beverage and entertainment outlets — weighted scoring, critical-finding escalation, corrective-action tracking and executive reporting in one platform.
              </p>
            </div>

            {/* Programme snapshot — desktop only, so the form stays above the fold on
                phones. Demo only: see the note on PROGRAMME. */}
            {!isDemoMode() ? <CapabilityPanel /> : (
            <div className="hidden rounded-xl border border-white/10 bg-white/[0.04] p-5 lg:block">
              <div className="flex items-center justify-between gap-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-300">Programme to date</p>
                <span className="rounded-full border border-teal-400/30 bg-teal-400/10 px-2 py-0.5 text-[10px] font-medium text-teal-200">2025 / 26</span>
              </div>
              <div className="mt-4 flex items-center gap-5">
                <CompletionRing value={PROGRAMME.completedVisits} max={PROGRAMME.plannedVisits} />
                <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3">
                  {[
                    { v: PROGRAMME.outlets, l: 'Outlets assessed' },
                    { v: `${PROGRAMME.completedVisits} / ${PROGRAMME.plannedVisits}`, l: 'Visits completed' },
                    { v: PROGRAMME.visitsPerOutlet, l: 'Visits per outlet' },
                    { v: '24–48h', l: 'Report turnaround' },
                  ].map((m) => (
                    <div key={m.l}>
                      <dt className="sr-only">{m.l}</dt>
                      <dd className="text-lg font-semibold leading-none tabular-nums text-white">{m.v}</dd>
                      <p className="mt-1 text-[11px] leading-tight text-navy-300">{m.l}</p>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="mt-4 border-t border-white/10 pt-3">
                <TrendFlourish />
                <p className="mt-1 text-[10px] text-navy-400">Portfolio score trend · last 12 months</p>
              </div>
            </div>
            )}

            <p className="hidden text-[11px] text-navy-400 lg:block">
              {/* The programme year was hardcoded to 2025/26, which is simply wrong
                  for a client whose engagement starts later. Live Mode names the
                  platform instead of asserting a year it cannot know. */}
              {isDemoMode()
                ? `${CLIENT_BRAND.name} · Mystery Shopping Programme 2025/26 · v${APP_CONFIG.version}`
                : `${CLIENT_BRAND.name} · ${APP_CONFIG.tagline} · v${APP_CONFIG.version}`}
            </p>
          </section>

          {/* ── Sign in ── */}
          <section className="flex flex-col justify-center bg-white px-7 py-9 dark:bg-navy-800 sm:px-10 sm:py-11">
            <div className="mx-auto w-full max-w-sm">
              <h2 className="text-[22px] font-semibold tracking-tight text-slate-900 dark:text-white">Sign in</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Access your mystery shopping workspace.</p>

              <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
                <Field label="Email address" htmlFor="email" required>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                    <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@organisation.com" className="pl-9" invalid={!!error && !email} />
                  </div>
                </Field>
                <Field label="Password" htmlFor="password" required>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                    <Input id="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pl-9 pr-10" invalid={!!error && !password} />
                    <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white" aria-label={showPw ? 'Hide password' : 'Show password'}>
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>
                <div className="flex items-center justify-between">
                  <Checkbox label="Remember me" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  <button type="button" className="text-sm link" onClick={() => toast('Password reset is handled by your administrator in demo mode.', { icon: 'ℹ️' })}>
                    Forgot password?
                  </button>
                </div>
                {error && (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    {error}
                  </p>
                )}
                <button type="submit" className="btn-accent group w-full !py-2.5 shadow-sm" disabled={busy !== null}>
                  {busy === 'form' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Sign in
                  {busy !== 'form' && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />}
                </button>
              </form>

              {isDemoMode() && (
                <div className="mt-7">
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-slate-200 dark:bg-navy-700" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Quick demo access</span>
                    <span className="h-px flex-1 bg-slate-200 dark:bg-navy-700" />
                  </div>
                  <p className="mt-2.5 text-center text-xs text-slate-500 dark:text-slate-400">
                    Choose a role to sign in instantly · password <code className="rounded bg-slate-100 px-1 font-mono text-[11px] dark:bg-navy-900">{DEMO_PASSWORD}</code>
                  </p>
                  <ul className="mt-3.5 space-y-1.5">
                    {DEMO_ACCOUNTS.map((a) => {
                      const Icon = ROLE_ICONS[a.role]
                      const active = busy === a.role
                      return (
                        <li key={a.email}>
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => {
                              setEmail(a.email)
                              setPassword(a.password)
                              void doSignIn(a.email, a.password, a.role)
                            }}
                            className={cn(
                              'group flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition-all hover:-translate-y-px hover:border-teal-400 hover:shadow-card-hover disabled:opacity-60 disabled:hover:translate-y-0 dark:border-navy-700 dark:bg-navy-900/70 dark:hover:border-teal-500',
                              active && 'border-teal-500 ring-2 ring-teal-500/25',
                            )}
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700 transition-colors group-hover:bg-teal-50 group-hover:text-teal-700 dark:bg-navy-800 dark:text-teal-300 dark:group-hover:bg-teal-500/15">
                              {active ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" aria-hidden />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-semibold leading-tight text-slate-800 dark:text-slate-100">{a.label}</span>
                              <span className="block truncate text-[11px] leading-tight text-slate-500 dark:text-slate-400">{a.description}</span>
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-teal-600 dark:text-slate-600" aria-hidden />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              <p className="mt-7 text-center text-[11px] text-slate-400">
                {isDemoMode() ? 'Demo mode · no backend required · synthetic data' : 'Secured by Supabase Auth · Row Level Security enforced'}
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
