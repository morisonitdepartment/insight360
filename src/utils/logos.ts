/**
 * Uploaded logos: the organisation's and one per company (brand).
 *
 * A Super Admin uploads them in Settings. They are stored with the organisation
 * and brand records as small PNG data URLs — a few tens of kilobytes each — so
 * they travel with the data to every screen and into the PDF reports with no
 * file bucket to manage, and nothing about them is ever committed to the
 * (public) repository. A logo left unset falls back to the built-in mark, then
 * to the company's initials.
 */

/** Longest side of a stored logo. Enough for a report cover, small enough to load everywhere. */
const MAX_SIDE = 400
/** Refuse anything that is plainly not a logo before trying to decode it. */
const MAX_INPUT_BYTES = 8 * 1024 * 1024

/** Read an image file and return it as a PNG data URL no larger than MAX_SIDE, transparency kept. */
export async function prepareLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp|svg\+xml|gif)$/i.test(file.type) && !/\.(png|jpe?g|webp|svg|gif)$/i.test(file.name)) {
    throw new Error('Use a PNG, JPEG, WebP or SVG image for a logo.')
  }
  if (file.size > MAX_INPUT_BYTES) throw new Error('That image is over 8 MB. Use a smaller logo file.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('That file could not be read as an image.'))
      el.src = url
    })
    const w0 = img.naturalWidth || MAX_SIDE
    const h0 = img.naturalHeight || MAX_SIDE
    const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w0 * scale))
    canvas.height = Math.max(1, Math.round(h0 * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser cannot process images.')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ── The current logos, for code that runs outside React (the PDF builders) ──

let organizationLogo: string | null = null
let brandLogos = new Map<string, string>()

/** Called by the data layer whenever the dataset changes. */
export function setLogoSources(org: string | null | undefined, brands: { name: string; logo?: string | null }[]): void {
  organizationLogo = org || null
  brandLogos = new Map(brands.filter((b) => b.logo).map((b) => [b.name, b.logo as string]))
}

/** The uploaded organisation logo, or null to use the built-in one. */
export function uploadedOrganizationLogo(): string | null {
  return organizationLogo
}

/** The uploaded logo of the company with this name, or null. */
export function uploadedBrandLogo(brandName: string): string | null {
  return brandLogos.get(brandName) ?? null
}
