import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { BarChart3, Building2, ClipboardCheck, Eye, EyeOff, FileCheck2, Loader2, LockKeyhole, Mail, Moon, ShieldCheck, Sun, UserCog, Users, LineChart, Briefcase, ShoppingBag, type LucideIcon } from 'lucide-react'
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
    <div className="min-h-screen lg:grid lg:grid-cols-[1.1fr_1fr] bg-white dark:bg-navy-950">
      {/* Brand panel */}
      <section className="relative overflow-hidden bg-navy-900 text-white px-8 py-10 lg:px-14 lg:py-14 flex flex-col">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-navy-500/20 blur-3xl" />
          <svg className="absolute inset-0 h-full w-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M32 0H0V32" fill="none" stroke="white" strokeWidth="0.6" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
        <div className="relative flex items-center gap-3">
          <ClientLogo size="lg" />
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300">{APP_CONFIG.tagline}</p>
          </div>
        </div>
        <div className="relative mt-14 lg:mt-24 max-w-xl">
          <h1 className="text-3xl lg:text-[40px] font-semibold leading-tight tracking-tight text-white">Turn every customer interaction into actionable intelligence.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-navy-200">{APP_CONFIG.subtitle}</p>
          <p className="mt-3 text-sm text-navy-300">Evidence-based mystery shopping across F&amp;B and entertainment outlets: weighted scoring, critical-finding escalation, corrective-action tracking and executive reporting in one platform.</p>
        </div>
        <ul className="relative mt-12 grid grid-cols-2 gap-4 max-w-xl">
          {[
            { icon: Building2, value: '50', label: 'Outlets' },
            { icon: ClipboardCheck, value: '200', label: 'Annual visits' },
            { icon: BarChart3, value: 'Real-time', label: 'Analytics' },
            { icon: FileCheck2, value: 'Evidence-based', label: 'Reporting' },
          ].map((m) => (
            <li key={m.label} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 backdrop-blur-sm">
              <m.icon className="h-4 w-4 text-teal-300" aria-hidden />
              <p className="mt-2 text-xl font-semibold leading-none">{m.value}</p>
              <p className="mt-1 text-xs text-navy-300">{m.label}</p>
            </li>
          ))}
        </ul>
        <p className="relative mt-auto pt-10 text-[11px] text-navy-400">{CLIENT_BRAND.name} · Mystery Shopping Programme 2025/26 · v{APP_CONFIG.version}</p>
      </section>

      {/* Form panel */}
      <section className="flex flex-col px-6 py-8 sm:px-10 lg:px-16 lg:py-14">
        <div className="flex justify-end">
          <button type="button" onClick={toggleTheme} className="btn-ghost btn-sm" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
        <div className="mx-auto w-full max-w-md flex-1 flex flex-col justify-center">
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Access your mystery shopping workspace.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
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
            <button type="submit" className="btn-primary w-full !py-2.5" disabled={busy !== null}>
              {busy === 'form' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sign in
            </button>
          </form>

          {isDemoMode() && (
            <div className="mt-8">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-slate-200 dark:bg-navy-800" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Quick demo access</span>
                <span className="h-px flex-1 bg-slate-200 dark:bg-navy-800" />
              </div>
              <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
                Select a role to sign in instantly. All demo accounts use password <code className="rounded bg-slate-100 dark:bg-navy-800 px-1">{DEMO_PASSWORD}</code>.
              </p>
              <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DEMO_ACCOUNTS.map((a) => {
                  const Icon = ROLE_ICONS[a.role]
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
                        className={cn('w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-teal-400 hover:shadow-card-hover dark:border-navy-700 dark:bg-navy-900 dark:hover:border-teal-500', busy === a.role && 'border-teal-500 ring-2 ring-teal-500/30')}
                      >
                        <span className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy-50 text-navy-700 dark:bg-navy-800 dark:text-teal-300">
                            {busy === a.role ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" aria-hidden />}
                          </span>
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{a.label}</span>
                        </span>
                        <span className="mt-1.5 block text-[11px] text-slate-500 dark:text-slate-400">{a.description}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
        <p className="mt-8 text-center text-[11px] text-slate-400">
          {isDemoMode() ? 'Demo mode · no backend required · synthetic data' : 'Secured by Supabase Auth · Row Level Security enforced'}
        </p>
      </section>
    </div>
  )
}
