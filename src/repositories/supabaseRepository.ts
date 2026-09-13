import type { Dataset, Evidence, User } from '@/types'
import { DEFAULT_THRESHOLDS } from '@/utils/scoring'
import { DEFAULT_ORGANIZATION } from '@/data/defaults'
import { getSupabase } from '@/services/supabaseClient'
import { deriveOutlets } from '@/services/derive'
import { hashString } from '@/utils/prng'
import type { DatasetPatch, EvidenceUploadMeta, Repository } from './types'

/** camelCase ⇄ snake_case helpers for table row mapping */
const toSnake = (s: string) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

function rowToModel<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[toCamel(k)] = v
  return out as T
}
function modelToRow(model: object): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(model)) out[toSnake(k)] = v
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
    await getSupabase().auth.signOut()
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
    if (error || !data) throw new Error('No INSIGHT360 profile is linked to this account.')
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

  async persist(patch: DatasetPatch): Promise<void> {
    const sb = getSupabase()
    for (const key of Object.keys(patch) as (keyof Dataset)[]) {
      if (key === 'thresholds') continue
      if (key === 'organization') {
        await sb.from('organizations').upsert(modelToRow(patch.organization!))
        continue
      }
      const table = TABLES[key as keyof typeof TABLES]
      const rows = (patch[key] as object[] | undefined)?.map(modelToRow)
      if (!table || !rows) continue
      // Upsert in chunks; RLS decides what the caller may write.
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from(table).upsert(rows.slice(i, i + 500), { onConflict: 'id' })
        if (error) throw new Error(`Failed to save ${table}: ${error.message}`)
      }
    }
  }

  async uploadEvidence(file: File | null, meta: EvidenceUploadMeta): Promise<Evidence> {
    if (!file) throw new Error('A file is required in live mode.')
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf']
    if (!allowed.includes(file.type)) throw new Error('Unsupported file type. Allowed: JPEG, PNG, WebP, MP4, PDF.')
    if (file.size > 50 * 1024 * 1024) throw new Error('File exceeds the 50 MB limit.')
    const sb = getSupabase()
    const id = `ev-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
    const path = `${meta.visitId}/${id}-${file.name.replace(/[^\w.-]/g, '_')}`
    const { error } = await sb.storage.from('evidence').upload(path, file, { upsert: false, contentType: file.type })
    if (error) throw new Error(`Upload failed: ${error.message}`)
    const now = new Date().toISOString()
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

  async reset(): Promise<void> {
    throw new Error('Reset is only available in demo mode.')
  }
}
