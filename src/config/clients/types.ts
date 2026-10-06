import type { Segment, Subcategory } from '@/types'

/**
 * A client profile is everything that differs between one demonstration tenant and
 * the next: who they are, where they trade, and what their portfolio looks like.
 *
 * The platform itself is unchanged between them. Adding a prospect means adding one
 * file here and a logo under `public/brands/<id>/` — no component, page or query is
 * brand-aware, because every brand-specific value is read through `CLIENT`.
 *
 * Select one at build time with `VITE_CLIENT=<id>`; see `src/config/client.ts`.
 */

/** A trading location. The tuple form overrides the brand's default subcategory. */
export type LocationDef = string | { name: string; subcategory: Subcategory }

export interface BrandDef {
  id: string
  name: string
  segment: Segment
  /** Default for this brand's locations; a location may override it. */
  subcategory: Subcategory
  locations: LocationDef[]
}

export interface ShopperDef {
  name: string
  gender: 'Female' | 'Male'
  nationality: string
  languages: string[]
}

export interface ClientProfile {
  /** Matches the folder under `public/brands/` and the `VITE_CLIENT` value. */
  id: string

  brand: {
    /** Full legal-style name, used in report footers and the settings form. */
    name: string
    /** Short form for tight spaces such as the sidebar chip. */
    shortName: string
    /** Path relative to BASE_URL, so it stays correct under a Pages sub-path. */
    logoFile: string
    /** Alt text — describes the mark for screen readers. */
    logoAlt: string
    /** Shown beneath the logo on the login page. */
    descriptor: string
    /**
     * How the estate is described in the sign-in hero, e.g.
     * "food & beverage and entertainment outlets". A burger group should not be
     * told the platform assesses its entertainment venues.
     */
    estate: string
  }

  /**
   * The headline figures on the sign-in page. Demo builds only, and they must
   * match what the seeded dataset actually produces — a prospect who sees
   * 50 outlets here and 18 on the dashboard has caught us inventing numbers.
   */
  snapshot: {
    outlets: number
    plannedVisits: number
    completedVisits: number
    visitsPerOutlet: number
    /** Twelve monthly portfolio averages, drawn as the trend flourish. */
    trend: number[]
  }

  /** Seeds `DEFAULT_ORGANIZATION`; all of it is editable at runtime under Settings. */
  org: {
    engagementName: string
    engagementStart: string
    engagementEnd: string
    timezone: string
    currency: string
    locale: string
  }

  /** The assessed estate, and the geography it is plotted and grouped by. */
  portfolio: {
    brands: BrandDef[]
    /** Location → region, for grouping and the region filter. */
    regionByLocation: Record<string, string>
    /** Location → [x, y] as percentages on the abstract portfolio map. */
    mapByLocation: Record<string, [number, number]>
    /**
     * `brandId:location` of the outlet that carries the demo storyline — the one
     * that fails a critical check, gets an alert, a corrective action and a
     * verified follow-up. It must exist in `brands` above.
     */
    storylineKey: string
  }

  /** Names used for outlet managers and the mystery-shopper panel. */
  people: {
    managers: string[]
    shoppers: ShopperDef[]
  }
}
