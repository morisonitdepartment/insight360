import { CLIENT } from './client'

/**
 * What this client calls a site.
 *
 * A mystery-shopping agency says "outlet"; a burger chain says "restaurant"; a
 * bank will say "branch". The word appears in a few hundred labels, headings
 * and messages, and none of them should know which client they are showing.
 * They read it from here, and the client profile decides.
 *
 * Only prose goes through this. Identifiers, routes, permission keys and column
 * names keep the word "outlet" permanently — they are code, not copy.
 */
const base = CLIENT.terms ?? { outlet: 'outlet', outlets: 'outlets' }
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const T = {
  outlet: base.outlet,
  outlets: base.outlets,
  Outlet: cap(base.outlet),
  Outlets: cap(base.outlets),
} as const

/** "1 restaurant", "18 restaurants". */
export const countOutlets = (n: number) => `${n} ${n === 1 ? T.outlet : T.outlets}`

/**
 * Display form of a typed string that happens to start with the word "Outlet".
 *
 * `ReportType` is a string union — 'Outlet Performance' is an identity, used as a
 * record key and compared against seeded data — so it cannot change per client.
 * What a person reads can. Use this at the point of rendering, never for the
 * value itself.
 */
export const displayTerm = (s: string): string => s.replace(/^Outlets\b/, T.Outlets).replace(/^Outlet\b/, T.Outlet)
