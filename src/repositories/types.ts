import type { AppMode } from '@/config/app'
import type { Dataset, Evidence, User } from '@/types'

export type DatasetPatch = Partial<Dataset>

export interface EvidenceUploadMeta {
  visitId: string
  outletId: string
  category: Evidence['category']
  questionId: string | null
  type: Evidence['type']
  title: string
  description: string
  uploadedBy: string
}

/**
 * Data-access contract shared by Demo (in-memory + localStorage) and Live (Supabase) modes.
 * Pages never talk to a backend directly — they use DataContext, which delegates here.
 */
export interface Repository {
  readonly mode: AppMode
  signIn(email: string, password: string, remember: boolean): Promise<User>
  signOut(): Promise<void>
  restoreSession(): Promise<User | null>
  loadDataset(): Promise<Dataset>
  /** Persist changed collections. Demo: localStorage overlay. Live: table upserts (RLS-protected). */
  persist(patch: DatasetPatch): Promise<void>
  uploadEvidence(file: File | null, meta: EvidenceUploadMeta): Promise<Evidence>
  /** Demo only: wipe local overrides and regenerate seed data */
  reset(): Promise<void>
}
