import { useData } from '@/contexts/DataContext'
import { cn } from '@/utils/cn'

const SIZES = {
  xs: 'h-5 w-5 rounded-[5px] text-[8px]',
  sm: 'h-7 w-7 rounded-md text-[9px]',
  md: 'h-9 w-9 rounded-lg text-[11px]',
  lg: 'h-12 w-12 rounded-xl text-sm',
} as const

/** "Shebestan Palace" → "SP", "Pizza Hut" → "PH", "Bennigan's" → "BE". */
function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean)
  if (words.length === 0) return '—'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/**
 * The assessed brand's square mark, for the outlet lines in Assignments, Visits,
 * the audit calendar and the outlet record.
 *
 * A brand with no mark on file falls back to its initials rather than to a broken
 * image, so a client whose brands have no artwork still reads cleanly — and so does
 * an estate where only some of the brands have been supplied.
 */
export function BrandMark({
  brandName,
  size = 'sm',
  className,
}: {
  brandName: string
  size?: keyof typeof SIZES
  className?: string
}) {
  const { data } = useData()
  const brand = data.brands.find((b) => b.name === brandName)
  // An uploaded logo (Settings) wins over a built-in file; neither gives initials.
  const src = brand?.logo || (brand?.logoFile ? `${import.meta.env.BASE_URL}${brand.logoFile}` : null)
  const base = cn('inline-flex shrink-0 items-center justify-center overflow-hidden', SIZES[size], className)

  if (!src) {
    return (
      <span
        className={cn(base, 'bg-slate-100 font-semibold tracking-wide text-slate-500 ring-1 ring-black/5 dark:bg-slate-700 dark:text-slate-300 dark:ring-white/10')}
        aria-hidden="true"
      >
        {initials(brandName)}
      </span>
    )
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      className={cn(base, 'bg-white object-contain ring-1 ring-black/5 dark:ring-white/10')}
    />
  )
}
