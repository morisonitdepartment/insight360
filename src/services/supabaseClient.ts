import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { APP_CONFIG } from '@/config/app'

let client: SupabaseClient | null = null

/**
 * Lazily creates the Supabase client (Live Mode only). Uses the public anon key exclusively —
 * the service-role key must never be present in frontend configuration.
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!APP_CONFIG.supabaseUrl || !APP_CONFIG.supabaseAnonKey) {
      throw new Error('Live mode requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
    }
    client = createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  }
  return client
}
