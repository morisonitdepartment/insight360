export type AppMode = 'demo' | 'live'

import { CLIENT } from './client'
import { DEMO_NOW } from '@/data/demoClock'

const rawMode = (import.meta.env.VITE_APP_MODE as string | undefined)?.toLowerCase()

export const APP_CONFIG = {
  /** Short client name, used in document titles. Follows the selected client. */
  name: CLIENT.brand.shortName,
  tagline: 'Mystery Shopping Intelligence Platform',
  subtitle: 'Customer Experience • Compliance • Analytics • Continuous Improvement',
  version: '1.0.0',
  mode: (rawMode === 'live' ? 'live' : 'demo') as AppMode,
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '',
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
  /**
   * Namespace for every localStorage key.
   *
   * Includes the client id because the demonstrations are published to sub-paths
   * of one domain and therefore share an origin and its storage. With a single
   * prefix, mutating one demo persisted its visits, findings, alerts, users and
   * organisation under a key the next demo would read — so clicking through one
   * client's demo and then opening another showed the first client's data and
   * name on the second one's outlets.
   */
  storagePrefix: `insight360.${CLIENT.id}`,
  /**
   * "Today" in Demo Mode. Tracks the real date in whole-week steps so the
   * storyline never reads as stale; see src/data/demoClock.ts.
   */
  demoToday: DEMO_NOW.toISOString(),
} as const

export const isDemoMode = () => APP_CONFIG.mode === 'demo'
export const isLiveMode = () => APP_CONFIG.mode === 'live'
