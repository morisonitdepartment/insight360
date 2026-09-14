import { CLIENT_BRAND } from '@/config/client'
import { cn } from '@/utils/cn'

/**
 * Client logo lockup. The mark is dark navy on transparency, so it is always placed on a light
 * chip — that keeps it legible in dark mode and on the navy sidebar and report headers.
 */
export function ClientLogo({ size = 'md', className }: { size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const h = size === 'xs' ? 'h-5' : size === 'sm' ? 'h-7' : size === 'lg' ? 'h-14' : 'h-10'
  const pad = size === 'xs' ? 'px-1.5 py-1' : size === 'lg' ? 'px-4 py-3' : 'px-2.5 py-2'
  return (
    <span className={cn('inline-flex items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-black/5', pad, className)}>
      <img src={CLIENT_BRAND.logo} alt={CLIENT_BRAND.logoAlt} className={cn(h, 'w-auto object-contain')} loading="lazy" decoding="async" />
    </span>
  )
}

/** Logo plus a "Prepared for" caption, for the login hero and report covers. */
export function ClientLockup({ caption = 'Prepared for', size = 'lg', className, tone = 'dark' }: { caption?: string; size?: 'sm' | 'md' | 'lg'; className?: string; tone?: 'dark' | 'light' }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className={cn('text-[10px] font-semibold uppercase tracking-[0.18em]', tone === 'dark' ? 'text-navy-300' : 'text-slate-500 dark:text-slate-400')}>{caption}</p>
      <div className="flex items-center gap-3">
        <ClientLogo size={size} />
        <span className="min-w-0">
          <span className={cn('block text-sm font-semibold leading-tight', tone === 'dark' ? 'text-white' : 'text-slate-900 dark:text-white')}>{CLIENT_BRAND.name}</span>
          <span className={cn('block text-xs leading-tight', tone === 'dark' ? 'text-navy-300' : 'text-slate-500 dark:text-slate-400')}>{CLIENT_BRAND.descriptor}</span>
        </span>
      </div>
    </div>
  )
}
