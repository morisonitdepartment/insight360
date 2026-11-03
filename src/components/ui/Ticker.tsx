import { CLIENT } from '@/config/client'
import { cn } from '@/utils/cn'

/**
 * The sign-in marquee: a strip of short facts scrolling in the client's display
 * face, after the band on the brand's own website.
 *
 * Renders nothing when the client declares no ticker, so a client without one
 * has no element here at all — not a hidden one — and the sign-in layout is
 * untouched. The track holds the items twice; translating it by half its width
 * is one seamless loop. Under prefers-reduced-motion the first copy simply sits
 * still, and the second is hidden from assistive tech either way.
 */
export function Ticker({ className }: { className?: string }) {
  const items = CLIENT.ticker
  if (!items?.length) return null
  const row = items.map((t, i) => (
    <span key={i} className="pr-5">
      {t}
      <span aria-hidden className="pl-5">·</span>
    </span>
  ))
  return (
    <div
      data-ticker
      aria-label={items.join(' · ')}
      className={cn('overflow-hidden whitespace-nowrap bg-teal-500 text-navy-950', className)}
    >
      <div className="inline-flex w-max animate-ticker py-2 font-display text-[12px] uppercase leading-none tracking-[0.1em] motion-reduce:animate-none">
        <span>{row}</span>
        <span aria-hidden>{row}</span>
      </div>
    </div>
  )
}
