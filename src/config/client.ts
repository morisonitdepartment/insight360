/**
 * Client branding for the demonstration tenant.
 *
 * INSIGHT360 is the platform; this is the organisation whose outlets are assessed. The two are
 * shown side by side (co-branding) rather than one replacing the other.
 *
 * To re-brand the demo for a different organisation, change the values here and drop a
 * replacement logo into `public/`. Nothing else needs editing — the name is also used by
 * `DEFAULT_ORGANIZATION` in `src/data/defaults.ts` and is editable at runtime under
 * Administration → System Settings.
 */
export const CLIENT_BRAND = {
  /** Full legal-style name, used in report footers and the settings form. */
  name: 'Sterling Catering Services',
  /** Short form for tight spaces such as the sidebar chip. */
  shortName: 'Sterling',
  /** Served from `public/`; BASE_URL keeps it correct under a GitHub Pages sub-path. */
  logo: `${import.meta.env.BASE_URL}client-logo.png`,
  /** Alt text — describes the mark for screen readers. */
  logoAlt: 'Sterling Catering Services',
  /** Shown beneath the logo on the login page. */
  descriptor: 'Food & beverage and entertainment portfolio',
} as const
