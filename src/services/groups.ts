import type { Brand, Outlet } from '@/types'

/**
 * Groups of branches for the top-bar selector.
 *
 * A company (brand) is always a group: "Pizza Hut, all branches". Tags add any
 * other grouping the client needs — a city, a mall, a franchise partner, a
 * country. A tag set on a company applies to every one of its branches; a tag
 * set on a branch applies to that branch alone. Selecting a group narrows every
 * dashboard, list and report to its branches, exactly as selecting one does.
 */

export const BRAND_SCOPE = 'brand:'
export const TAG_SCOPE = 'tag:'

/** A branch's tags: its own plus its company's, de-duplicated, case kept from the first seen. */
export function outletTags(outlet: Pick<Outlet, 'brandId' | 'tags'>, brands: Pick<Brand, 'id' | 'tags'>[]): string[] {
  const brand = brands.find((b) => b.id === outlet.brandId)
  const seen = new Map<string, string>()
  for (const t of [...(brand?.tags ?? []), ...(outlet.tags ?? [])]) {
    const clean = t.trim()
    if (clean && !seen.has(clean.toLowerCase())) seen.set(clean.toLowerCase(), clean)
  }
  return [...seen.values()]
}

/** Every tag in use across these branches, sorted, with how many branches carry it. */
export function tagsInUse(outlets: Outlet[], brands: Brand[]): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>()
  for (const o of outlets) {
    for (const t of outletTags(o, brands)) {
      const k = t.toLowerCase()
      const cur = counts.get(k) ?? { tag: t, count: 0 }
      cur.count++
      counts.set(k, cur)
    }
  }
  return [...counts.values()].sort((a, b) => a.tag.localeCompare(b.tag))
}

/**
 * The branches a selector value stands for, among those given: one branch by
 * id, every branch of a company (`brand:<id>`), or every branch with a tag
 * (`tag:<tag>`). Null for 'all', or for a value that matches nothing the user
 * may see — the caller then shows everything rather than an empty screen.
 */
export function outletsForScope(scope: string, outlets: Outlet[], brands: Brand[]): Outlet[] | null {
  if (!scope || scope === 'all') return null
  let picked: Outlet[]
  if (scope.startsWith(BRAND_SCOPE)) {
    const id = scope.slice(BRAND_SCOPE.length)
    picked = outlets.filter((o) => o.brandId === id)
  } else if (scope.startsWith(TAG_SCOPE)) {
    const tag = scope.slice(TAG_SCOPE.length).toLowerCase()
    picked = outlets.filter((o) => outletTags(o, brands).some((t) => t.toLowerCase() === tag))
  } else {
    picked = outlets.filter((o) => o.id === scope)
  }
  return picked.length ? picked : null
}

/** A readable name for a selector value: "Pizza Hut — all branches", "Tag: Doha". */
export function scopeLabel(scope: string, outlets: Outlet[], brands: Brand[]): string {
  if (!scope || scope === 'all') return 'All branches'
  if (scope.startsWith(BRAND_SCOPE)) {
    const b = brands.find((x) => x.id === scope.slice(BRAND_SCOPE.length))
    return b ? `${b.name} — all branches` : 'Company'
  }
  if (scope.startsWith(TAG_SCOPE)) return `Tag: ${scope.slice(TAG_SCOPE.length)}`
  return outlets.find((o) => o.id === scope)?.name ?? scope
}

/** Parse "Doha, Mall,  QSR" into a clean tag list. */
export function parseTags(text: string): string[] {
  const seen = new Map<string, string>()
  for (const raw of text.split(',')) {
    const t = raw.trim().replace(/\s+/g, ' ')
    if (t && t.length <= 40 && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t)
  }
  return [...seen.values()]
}
