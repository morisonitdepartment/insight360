export type AppMode = 'demo' | 'live'

const rawMode = (import.meta.env.VITE_APP_MODE as string | undefined)?.toLowerCase()

export const APP_CONFIG = {
  name: 'INSIGHT360',
  tagline: 'Mystery Shopping Intelligence Platform',
  subtitle: 'Customer Experience • Compliance • Analytics • Continuous Improvement',
  version: '1.0.0',
  mode: (rawMode === 'live' ? 'live' : 'demo') as AppMode,
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '',
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
  storagePrefix: 'insight360',
  /** Fixed "today" for the demo dataset so the storyline is stable */
  demoToday: '2026-09-13T10:00:00',
} as const

export const isDemoMode = () => APP_CONFIG.mode === 'demo'
export const isLiveMode = () => APP_CONFIG.mode === 'live'
