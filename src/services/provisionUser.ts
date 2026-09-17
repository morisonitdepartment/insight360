import { getSupabase } from '@/services/supabaseClient'
import type { Role } from '@/types'

/**
 * Creating a login needs the service-role key, which bypasses row level security
 * and must never exist in a browser bundle. So the app does not create logins —
 * it asks the `provision-user` Edge Function to, and that function decides
 * whether the caller is entitled to.
 *
 * The session token travels automatically with functions.invoke(); the caller's
 * identity and permissions are read from it server-side, never from this payload.
 */
export interface ProvisionUserInput {
  name: string
  email: string
  role: Role
  title: string
  /** Outlet codes, e.g. ['OUT-001']. Empty means every outlet. */
  outletCodes: string[]
}

export interface ProvisionUserResult {
  /** Shown once, then gone. Null when the person already had a login. */
  temporaryPassword: string | null
  reusedExisting: boolean
  /** A typo'd outlet code or an empty scope — created, but worth reading. */
  warning: string | null
  message: string
}

export async function provisionUser(input: ProvisionUserInput): Promise<ProvisionUserResult> {
  const { data, error } = await getSupabase().functions.invoke('provision-user', {
    body: {
      name: input.name,
      email: input.email,
      role: input.role,
      title: input.title,
      outletCodes: input.outletCodes.join(','),
    },
  })

  // A non-2xx response arrives as a FunctionsHttpError whose body holds our own
  // message. Without reading it the user sees "Edge Function returned a
  // non-2xx status code", which tells them nothing about what to fix.
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
    if (detail.includes('Failed to send a request') || /not found/i.test(detail)) {
      throw new Error('The provision-user function is not deployed yet. See supabase/functions/README.md.')
    }
    throw new Error(detail || error.message || 'Could not create the account.')
  }

  if (!data?.ok) throw new Error(data?.error ?? 'Could not create the account.')

  return {
    temporaryPassword: data.temporaryPassword ?? null,
    reusedExisting: !!data.reusedExisting,
    warning: data.warning ?? null,
    message: data.message ?? '',
  }
}
