import type { AppMode } from '@/config/app'
import type { Dataset, Evidence, User } from '@/types'

export type DatasetPatch = Partial<Dataset>

/**
 * The administrator a switched session came from. Present only while a super
 * admin is working as somebody else through "Switch account".
 */
export interface SwitchOrigin {
  userId: string
  name: string
}

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
  /**
   * Persist changed collections. Demo: localStorage overlay. Live: writes to the
   * tables (RLS-protected).
   *
   * `previous` is the dataset the patch was computed from. Live Mode uses it to
   * send only the rows that actually changed: action reducers return whole
   * collections, and re-sending every row of `visits` or `activity_logs` asks
   * the server to rewrite records the caller may read but not write — a shopper
   * resubmitting while an older visit sits Approved, for instance — which RLS
   * rightly refuses.
   */
  persist(patch: DatasetPatch, previous?: Dataset): Promise<void>
  uploadEvidence(file: File | null, meta: EvidenceUploadMeta): Promise<Evidence>
  /**
   * Delete one piece of evidence, and in live mode the stored file with it.
   *
   * This cannot go through `persist`: that upserts changed collections and never
   * deletes, so a patch that merely drops the row from the array would vanish in
   * the demo overlay and quietly survive in Postgres, reappearing on the next load.
   */
  deleteEvidence(id: string): Promise<void>
  /**
   * Delete a visit and everything recorded against it: answers, photos (and
   * their files), findings, corrective actions, alerts, comments and the
   * notifications that point at it. Super Admin only — the database refuses
   * anyone else. Like evidence, this cannot ride on `persist`, which never
   * deletes; the caller drops the rows locally with a `removeVisit` patch.
   */
  deleteVisit(id: string): Promise<void>
  /** Demo only: wipe local overrides and regenerate seed data */
  reset(): Promise<void>
  /**
   * A super admin works as another user without that user's password.
   *
   * Live: the `switch-account` Edge Function checks the caller is an active
   * super admin and hands back a one-time sign-in token for the target. The
   * administrator's own session is kept so they can come back in one click.
   * Resolves once the new session is in place; the caller reloads the app.
   */
  switchAccount(targetUserId: string): Promise<void>
  /** Back to the administrator the current session was switched from. */
  returnToOrigin(): Promise<void>
  /** Who this session was switched from, or null for an ordinary sign-in. */
  switchOrigin(): SwitchOrigin | null
  /**
   * A URL that displays the evidence file itself, or null when there is no file
   * behind the record (seeded sample evidence). Live: a short-lived signed URL,
   * since the bucket is private.
   */
  evidenceUrl(evidence: Pick<Evidence, 'id' | 'fileName'>): Promise<string | null>
}
