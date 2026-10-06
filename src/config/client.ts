import type { ClientProfile } from './clients/types'
import { sterling } from './clients/sterling'
import { hermanos } from './clients/hermanos'

/**
 * Which organisation this build is for.
 *
 * One codebase, one demonstration per prospect. Set `VITE_CLIENT` at build time and
 * everything brand-specific follows: the name and mark, the geography, the people,
 * the portfolio and the seeded storyline. Nothing outside `src/config/clients/`
 * knows which client it is.
 *
 *   VITE_CLIENT=hermanos npm run build
 *
 * Adding a prospect is one file under `src/config/clients/` plus a logo under
 * `public/brands/<id>/`, then a line in PROFILES below.
 */
const PROFILES: Record<string, ClientProfile> = {
  [sterling.id]: sterling,
  [hermanos.id]: hermanos,
}

const DEFAULT_CLIENT = sterling.id

const requested = (import.meta.env.VITE_CLIENT as string | undefined)?.trim().toLowerCase()

// Fall back rather than throw: a mistyped id should still produce a working
// build, and the warning says exactly what went wrong.
if (requested && !PROFILES[requested]) {
  console.warn(
    `[client] Unknown VITE_CLIENT "${requested}". Falling back to "${DEFAULT_CLIENT}". ` +
      `Known clients: ${Object.keys(PROFILES).join(', ')}.`,
  )
}

export const CLIENT: ClientProfile = (requested && PROFILES[requested]) || PROFILES[DEFAULT_CLIENT]

export const CLIENT_IDS = Object.keys(PROFILES)

/**
 * Client branding for the demonstration tenant.
 *
 * The platform and the assessed organisation are shown side by side (co-branding)
 * rather than one replacing the other.
 */
export const CLIENT_BRAND = {
  name: CLIENT.brand.name,
  shortName: CLIENT.brand.shortName,
  /** BASE_URL keeps this correct under a GitHub Pages sub-path. */
  logo: `${import.meta.env.BASE_URL}${CLIENT.brand.logoFile}`,
  logoAlt: CLIENT.brand.logoAlt,
  descriptor: CLIENT.brand.descriptor,
} as const
