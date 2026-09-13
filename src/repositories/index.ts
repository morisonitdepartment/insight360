import { APP_CONFIG } from '@/config/app'
import { DemoRepository } from './demoRepository'
import { SupabaseRepository } from './supabaseRepository'
import type { Repository } from './types'

let instance: Repository | null = null

/** Provider factory — the only place that decides between Demo and Live mode. */
export function getRepository(): Repository {
  if (!instance) {
    instance = APP_CONFIG.mode === 'live' ? new SupabaseRepository() : new DemoRepository()
  }
  return instance
}

export type { Repository, DatasetPatch, EvidenceUploadMeta } from './types'
