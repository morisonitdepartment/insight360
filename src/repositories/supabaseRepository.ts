import { format, isValid, parseISO } from 'date-fns'
import type { Dataset, Evidence, User } from '@/types'
import { DEFAULT_THRESHOLDS } from '@/utils/scoring'
import { DEFAULT_ORGANIZATION } from '@/data/defaults'
import { getSupabase } from '@/services/supabaseClient'
import { deriveOutlets } from '@/services/derive'
import { hashString } from '@/utils/prng'
import { APP_CONFIG } from '@/config/app'
import type { DatasetPatch, EvidenceUploadMeta, Repository, SwitchOrigin } from './types'

/** Where a switched session keeps the administrator it came from. */
const ORIGIN_KEY = `${APP_CONFIG.storagePrefix}.switch.origin`

interface StoredOrigin extends SwitchOrigin {
  accessToken: string
  refreshToken: string
}

function readOrigin(): StoredOrigin | null {
  try {
    const raw = localStorage.getItem(ORIGIN_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as StoredOrigin
    return o && o.refreshToken && o.userId ? o : null
  } catch {
    return null
  }
}

function clearOrigin() {
  try {
    localStorage.removeItem(ORIGIN_KEY)
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/** Signed URLs, kept until shortly before they expire so a gallery does not re-sign on every render. */
const SIGNED_TTL_SECONDS = 60 * 60
const signedCache = new Map<string, { url: string; until: number }>()

/** Postgres unique violation — the row is already there. */
const UNIQUE_VIOLATION = '23505'

/** camelCase ⇄ snake_case helpers for table row mapping */
const toSnake = (s: string) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

/**
 * Timestamps. The app keeps every time as local wall-clock text with no zone —
 * `2026-11-14T15:51:31` — which is what the demo and every screen expect. A
 * `timestamptz` column reads zone-less text as UTC, so in Doha every time the
 * app wrote was stored three hours late and shown three hours late after a
 * reload. Times are therefore turned into real instants on the way to the
 * database and back into local wall-clock text on the way out. Dates
 * (`2026-11-14`) and anything nested in jsonb are left alone; the nested ones
 * round-trip as local text untouched, which is already consistent.
 */
const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?$/
const ZONED_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$/
const toInstant = (v: unknown) => (typeof v === 'string' && LOCAL_TIME.test(v) ? new Date(v).toISOString() : v)
const toLocalTime = (v: unknown) => {
  if (typeof v !== 'string' || !ZONED_TIME.test(v)) return v
  const d = parseISO(v.replace(' ', 'T'))
  return isValid(d) ? format(d, "yyyy-MM-dd'T'HH:mm:ss") : v
}

function rowToModel<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[toCamel(k)] = toLocalTime(v)
  return out as T
}
function modelToRow(model: object): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(model)) out[toSnake(k)] = toInstant(v)
  return out
}

/** Dataset collection → Postgres table (see supabase/migrations). */
const TABLES: Record<Exclude<keyof Dataset, 'organization' | 'thresholds'>, string> = {
  brands: 'brands',
  outlets: 'outlets',
  users: 'users',
  shoppers: 'shoppers',
  trainingModules: 'training_modules',
  templates: 'audit_templates',
  scenarios: 'scenarios',
  sections: 'audit_sections',
  questions: 'audit_questions',
  visits: 'visits',
  answers: 'visit_answers',
  evidence: 'evidence',
  findings: 'findings',
  alerts: 'alerts',
  correctiveActions: 'corrective_actions',
  comments: 'comments',
  notifications: 'notifications',
  activityLogs: 'activity_logs',
  kpiConfig: 'kpi_config',
  reports: 'reports',
  notificationRules: 'notification_rules',
}

/**
 * Live repository backed by Supabase (Auth + Postgres + Storage). All access is subject to
 * Row Level Security policies defined in supabase/migrations — the client never receives
 * rows the signed-in user is not entitled to see.
 */
export class SupabaseRepository implements Repository {
  readonly mode = 'live' as const

  async signIn(email: string, password: string, remember: boolean): Promise<User> {
    const sb = getSupabase()
    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    if (error || !data.user) throw new Error(error?.message ?? 'Sign-in failed.')
    if (!remember) sessionStorage.setItem('insight360.session.ephemeral', '1')
    return this.profileFor(data.user.id)
  }

  async signOut(): Promise<void> {
    // A switched session belongs to somebody else. Signing it out must end only
    // this browser's copy: the default "global" sign-out would also end that
    // person's own session on their phone.
    const switched = readOrigin()
    clearOrigin()
    await getSupabase().auth.signOut({ scope: switched ? 'local' : 'global' })
  }

  switchOrigin(): SwitchOrigin | null {
    const o = readOrigin()
    return o ? { userId: o.userId, name: o.name } : null
  }

  async switchAccount(targetUserId: string): Promise<void> {
    const sb = getSupabase()
    const { data: sessionData } = await sb.auth.getSession()
    const session = sessionData.session
    if (!session) throw new Error('Sign in first.')

    const { data, error } = await sb.functions.invoke('switch-account', { body: { userId: targetUserId } })
    if (error) {
      let detail = ''
      const response = (error as { context?: Response }).context
      if (response && typeof response.json === 'function') {
        try {
          const body = await response.json()
          detail = typeof body?.error === 'string' ? body.error : ''
        } catch {
          detail = ''
        }
      }
      if (/Failed to send a request/i.test(error.message) || /function not found/i.test(detail)) {
        throw new Error('The switch-account function is not deployed yet. See supabase/functions/README.md.')
      }
      throw new Error(detail || error.message || 'Could not switch account.')
    }
    const tokenHash = (data as { tokenHash?: string } | null)?.tokenHash
    if (!tokenHash) throw new Error((data as { error?: string } | null)?.error ?? 'Could not switch account.')

    // Keep the administrator's session the first time only: hopping from one
    // borrowed account to another must still lead back to the administrator.
    if (!readOrigin()) {
      const me = await this.profileFor(session.user.id)
      const origin: StoredOrigin = { userId: me.id, name: me.name, accessToken: session.access_token, refreshToken: session.refresh_token }
      localStorage.setItem(ORIGIN_KEY, JSON.stringify(origin))
    }

    let { error: otpError } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
    if (otpError) ({ error: otpError } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: 'email' }))
    if (otpError) throw new Error(`Could not open that account: ${otpError.message}`)
  }

  async returnToOrigin(): Promise<void> {
    const origin = readOrigin()
    if (!origin) return
    const sb = getSupabase()
    // End the borrowed session in this browser only (see signOut).
    await sb.auth.signOut({ scope: 'local' })
    clearOrigin()
    const { error } = await sb.auth.setSession({ access_token: origin.accessToken, refresh_token: origin.refreshToken })
    if (error) throw new Error(`Your administrator session has expired — sign in again. (${error.message})`)
  }

  async evidenceUrl(evidence: Pick<Evidence, 'id' | 'fileName'>): Promise<string | null> {
    const path = evidence.fileName
    // Seeded sample evidence carries a bare file name, not a storage path.
    if (!path || !path.includes('/')) return null
    const hit = signedCache.get(path)
    if (hit && hit.until > Date.now()) return hit.url
    const { data, error } = await getSupabase().storage.from('evidence').createSignedUrl(path, SIGNED_TTL_SECONDS)
    if (error || !data?.signedUrl) return null
    signedCache.set(path, { url: data.signedUrl, until: Date.now() + (SIGNED_TTL_SECONDS - 120) * 1000 })
    return data.signedUrl
  }

  async restoreSession(): Promise<User | null> {
    const sb = getSupabase()
    const { data } = await sb.auth.getSession()
    if (!data.session) return null
    try {
      return await this.profileFor(data.session.user.id)
    } catch {
      return null
    }
  }

  private async profileFor(authId: string): Promise<User> {
    // Role is read from the users table (server-side truth), never from client state.
    const { data, error } = await getSupabase().from('users').select('*').eq('auth_id', authId).single()
    if (error || !data) throw new Error('No platform profile is linked to this account.')
    const user = rowToModel<User>(data)
    if (user.status !== 'active') throw new Error('This account is not active.')
    return user
  }

  async loadDataset(): Promise<Dataset> {
    const sb = getSupabase()
    const entries = Object.entries(TABLES) as [keyof typeof TABLES, string][]
    const results = await Promise.all(
      entries.map(async ([key, table]) => {
        const { data, error } = await sb.from(table).select('*').limit(20000)
        if (error) throw new Error(`Failed to load ${table}: ${error.message}`)
        return [key, (data ?? []).map((r) => rowToModel(r as Record<string, unknown>))] as const
      }),
    )
    const partial = Object.fromEntries(results) as unknown as Omit<Dataset, 'organization' | 'thresholds'>
    const { data: org } = await sb.from('organizations').select('*').limit(1).single()
    const organization = org ? { ...DEFAULT_ORGANIZATION, ...rowToModel<Dataset['organization']>(org as Record<string, unknown>) } : DEFAULT_ORGANIZATION
    const thresholds = DEFAULT_THRESHOLDS
    const outlets = deriveOutlets(partial.outlets, partial.visits, partial.findings, thresholds)
    return { ...partial, outlets, organization, thresholds }
  }

  /**
   * Writes only what the patch changed, in an order row-level security accepts.
   *
   * Action reducers return whole collections — `[newLog, ...data.activityLogs]`
   * — and this used to upsert every row of them. That broke Live Mode three ways:
   *  - `activity_logs` grants signed-in users no UPDATE (a log is never
   *    rewritten), and an upsert is INSERT … ON CONFLICT DO UPDATE, which needs
   *    it. Almost every action writes a log line.
   *  - A shopper's collections hold rows they may read but not change — an
   *    Approved visit, its answers — and re-sending them is refused.
   *  - An upsert must also pass the table's SELECT rule, which a shopper raising
   *    a critical finding, or any notification, does not.
   *
   * So rows the patch created are INSERTed, rows it replaced are UPDATEd, and
   * untouched rows are not sent. Reducers keep unchanged rows by reference, so
   * "changed" is an identity check against the dataset the patch came from.
   *
   * Order: every insert first, then updates, with `visits` last. Submitting a
   * visit saves its answers and marks it Submitted in one patch; a shopper may
   * write answers only while the visit is open, so the status must change after
   * them, not before.
   */
  async persist(patch: DatasetPatch, previous?: Dataset): Promise<void> {
    const sb = getSupabase()
    if (patch.organization) {
      const { error } = await sb.from('organizations').upsert(modelToRow(patch.organization))
      if (error) throw new Error(`Failed to save settings: ${error.message}`)
    }

    type Plan = { key: keyof typeof TABLES; table: string; inserts: object[]; updates: object[] }
    const plans: Plan[] = []
    for (const key of Object.keys(patch) as (keyof Dataset)[]) {
      if (key === 'thresholds' || key === 'organization') continue
      const table = TABLES[key as keyof typeof TABLES]
      const rows = patch[key] as { id: string }[] | undefined
      if (!table || !Array.isArray(rows)) continue
      const before = previous ? new Map((previous[key] as { id: string }[]).map((r) => [r.id, r])) : null
      const plan: Plan = { key: key as keyof typeof TABLES, table, inserts: [], updates: [] }
      for (const row of rows) {
        const old = before?.get(row.id)
        if (!before) plan.updates.push(row)
        else if (!old) plan.inserts.push(row)
        else if (old !== row) plan.updates.push(row)
      }
      if (plan.inserts.length || plan.updates.length) plans.push(plan)
    }

    // Without the dataset the patch came from there is no telling new from
    // changed, so fall back to upserting the lot.
    const write = (table: string, rows: object[]) => (previous ? this.updateRows(table, rows) : this.upsertRows(table, rows))
    for (const p of plans) await this.insertRows(p.table, p.inserts)
    for (const p of plans) if (p.key !== 'visits') await write(p.table, p.updates)
    for (const p of plans) if (p.key === 'visits') await write(p.table, p.updates)
  }

  /**
   * Changed rows are written with UPDATE, not upsert. Postgres checks an upsert
   * against the table's INSERT rule as well as its UPDATE rule — even when the
   * row already exists — and a shopper may update their visit but never create
   * one. Every shopper save of a visit was refused with "new row violates
   * row-level security policy for table visits" until this changed.
   *
   * An UPDATE that matches nothing is not an error, so each one asks for the id
   * back. No row back means the row is missing on the server (an earlier insert
   * failed); that row alone is upserted, which reports a real refusal if there
   * is one rather than dropping the change silently.
   */
  private async updateRows(table: string, rows: object[]) {
    const sb = getSupabase()
    for (let i = 0; i < rows.length; i += 8) {
      const missing: object[] = []
      await Promise.all(
        rows.slice(i, i + 8).map(async (row) => {
          const { id } = row as { id: string }
          const { data, error } = await sb.from(table).update(modelToRow(row)).eq('id', id).select('id')
          if (error) throw new Error(`Failed to save ${table}: ${error.message}`)
          if (!data?.length) missing.push(row)
        }),
      )
      if (missing.length) await this.upsertRows(table, missing)
    }
  }

  private async insertRows(table: string, rows: object[]) {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const { error } = await getSupabase().from(table).insert(chunk.map(modelToRow))
      if (!error) continue
      // Already there — evidence is written by the upload itself, before the
      // patch that links it to its answer arrives. Update the same rows instead.
      if (error.code === UNIQUE_VIOLATION) {
        await this.updateRows(table, chunk)
        continue
      }
      throw new Error(`Failed to save ${table}: ${error.message}`)
    }
  }

  private async upsertRows(table: string, rows: object[]) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await getSupabase().from(table).upsert(rows.slice(i, i + 500).map(modelToRow), { onConflict: 'id' })
      if (error) throw new Error(`Failed to save ${table}: ${error.message}`)
    }
  }

  async uploadEvidence(file: File | null, meta: EvidenceUploadMeta): Promise<Evidence> {
    if (!file) throw new Error('A file is required in live mode.')
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf']
    if (!allowed.includes(file.type)) {
      throw new Error(`This file type (${file.type || 'unknown'}) cannot be attached. Use a photo (JPEG, PNG, WebP), a video (MP4, MOV, WebM) or a PDF.`)
    }
    if (file.size > 50 * 1024 * 1024) throw new Error('File exceeds the 50 MB limit.')
    const sb = getSupabase()
    const id = `ev-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
    const path = `${meta.visitId}/${id}-${file.name.replace(/[^\w.-]/g, '_')}`
    const { error } = await sb.storage.from('evidence').upload(path, file, { upsert: false, contentType: file.type })
    if (error) throw new Error(`Upload failed: ${error.message}`)
    const now = format(new Date(), "yyyy-MM-dd'T'HH:mm:ss") // local wall-clock, like every other time in the app
    const evidence: Evidence = {
      id,
      visitId: meta.visitId,
      outletId: meta.outletId,
      category: meta.category,
      questionId: meta.questionId,
      type: meta.type,
      title: meta.title,
      description: meta.description,
      capturedAt: now,
      uploadedAt: now,
      uploadedBy: meta.uploadedBy,
      visualSeed: hashString(id),
      fileName: path,
      sizeKb: Math.round(file.size / 1024),
    }
    const { error: dbError } = await sb.from('evidence').insert(modelToRow(evidence))
    if (dbError) throw new Error(`Failed to record evidence: ${dbError.message}`)
    return evidence
  }

  async deleteEvidence(id: string): Promise<void> {
    const sb = getSupabase()
    // fileName carries the storage path in live mode — see uploadEvidence.
    const { data: row } = await sb.from('evidence').select('file_name').eq('id', id).maybeSingle()
    const path = (row as { file_name?: string } | null)?.file_name
    if (path) {
      const { error } = await sb.storage.from('evidence').remove([path])
      // A file already gone must not strand the row: that would leave a piece of
      // evidence nobody can delete and no photograph behind it.
      if (error) console.warn(`Evidence file could not be removed: ${error.message}`)
    }
    const { error: dbError } = await sb.from('evidence').delete().eq('id', id)
    if (dbError) throw new Error(`Failed to delete evidence: ${dbError.message}`)
  }

  async reset(): Promise<void> {
    throw new Error('Reset is only available in demo mode.')
  }
}
