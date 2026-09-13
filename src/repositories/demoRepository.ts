import { APP_CONFIG } from '@/config/app'
import { DEMO_ACCOUNTS } from '@/config/demoAccounts'
import { generateDataset } from '@/data/seed'
import type { Dataset, Evidence, User } from '@/types'
import { hashString } from '@/utils/prng'
import type { DatasetPatch, EvidenceUploadMeta, Repository } from './types'

const DATA_KEY = `${APP_CONFIG.storagePrefix}.demo.data.v1`
const SESSION_KEY = `${APP_CONFIG.storagePrefix}.session`

/** Collections that may be overridden by local demo mutations. */
const PERSISTED_KEYS: (keyof Dataset)[] = [
  'visits',
  'answers',
  'evidence',
  'findings',
  'alerts',
  'correctiveActions',
  'comments',
  'notifications',
  'activityLogs',
  'users',
  'shoppers',
  'kpiConfig',
  'templates',
  'sections',
  'questions',
  'notificationRules',
  'organization',
  'reports',
]

function safeGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}
function safeSet(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value)
  } catch {
    /* quota exceeded or storage disabled — demo keeps working in memory */
  }
}
function safeRemove(storage: Storage, key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/**
 * Demo repository: deterministic seeded dataset + localStorage overlay for mutations.
 * No backend, no network — safe to deploy on GitHub Pages.
 */
export class DemoRepository implements Repository {
  readonly mode = 'demo' as const
  private cache: Dataset | null = null
  private overlay: Partial<Dataset> = {}

  constructor() {
    const raw = safeGet(localStorage, DATA_KEY)
    if (raw) {
      try {
        this.overlay = JSON.parse(raw) as Partial<Dataset>
      } catch {
        this.overlay = {}
      }
    }
  }

  private dataset(): Dataset {
    if (!this.cache) {
      const seed = generateDataset()
      this.cache = { ...seed, ...this.overlay }
    }
    return this.cache
  }

  async signIn(email: string, password: string, remember: boolean): Promise<User> {
    await delay(350)
    const account = DEMO_ACCOUNTS.find((a) => a.email.toLowerCase() === email.trim().toLowerCase())
    if (!account || account.password !== password) throw new Error('Invalid email or password.')
    const user = this.dataset().users.find((u) => u.id === account.userId)
    if (!user) throw new Error('Demo account is not provisioned.')
    if (user.status !== 'active') throw new Error('This account has been deactivated. Contact your administrator.')
    const store = remember ? localStorage : sessionStorage
    safeRemove(localStorage, SESSION_KEY)
    safeRemove(sessionStorage, SESSION_KEY)
    safeSet(store, SESSION_KEY, JSON.stringify({ userId: user.id, at: new Date().toISOString() }))
    return user
  }

  async signOut(): Promise<void> {
    safeRemove(localStorage, SESSION_KEY)
    safeRemove(sessionStorage, SESSION_KEY)
  }

  async restoreSession(): Promise<User | null> {
    const raw = safeGet(sessionStorage, SESSION_KEY) ?? safeGet(localStorage, SESSION_KEY)
    if (!raw) return null
    try {
      const { userId } = JSON.parse(raw) as { userId: string }
      // Role is always resolved from the user record, never from the session blob.
      const user = this.dataset().users.find((u) => u.id === userId)
      return user && user.status === 'active' ? user : null
    } catch {
      return null
    }
  }

  async loadDataset(): Promise<Dataset> {
    await delay(120)
    return this.dataset()
  }

  async persist(patch: DatasetPatch): Promise<void> {
    const current = this.dataset()
    for (const key of Object.keys(patch) as (keyof Dataset)[]) {
      if (!PERSISTED_KEYS.includes(key)) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this.overlay as any)[key] = (patch as any)[key]
      ;(current as any)[key] = (patch as any)[key]
    }
    safeSet(localStorage, DATA_KEY, JSON.stringify(this.overlay))
  }

  async uploadEvidence(file: File | null, meta: EvidenceUploadMeta): Promise<Evidence> {
    await delay(500)
    const id = `ev-u-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`
    const now = new Date().toISOString().slice(0, 19)
    return {
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
      fileName: file?.name ?? `${meta.type.toUpperCase()}_${Date.now()}.jpg`,
      sizeKb: file ? Math.max(1, Math.round(file.size / 1024)) : 640,
    }
  }

  async reset(): Promise<void> {
    safeRemove(localStorage, DATA_KEY)
    this.overlay = {}
    this.cache = null
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
