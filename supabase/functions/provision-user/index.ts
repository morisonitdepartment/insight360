// ============================================================================
// provision-user — create a real login from the app's "Create user" button.
//
// Creating a Supabase Auth account needs the service-role key, which bypasses
// every row-level security policy. That key must never reach a browser, so the
// work happens here instead: the app sends the form, this function checks who is
// asking, and only then creates the account.
//
// What it does, in order:
//   1. Identifies the caller from their own JWT — not from anything in the body.
//   2. Confirms they are an active administrator entitled to assign that role.
//   3. Creates the Auth account with a generated temporary password.
//   4. Writes the profile, role and outlet scope via app.provision_user().
//   5. Deletes the Auth account again if step 4 fails, so a half-made user is
//      never left behind.
//
// The temporary password is returned once, to the administrator who asked. It is
// never stored, never logged, and never emailed — Supabase's built-in SMTP is
// rate-limited to a handful of messages an hour and is not fit for onboarding.
//
// DEPLOY (dashboard): Edge Functions -> Deploy a new function -> name it
// exactly `provision-user`, paste this file, Deploy. SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected automatically;
// you do not add them yourself.
//
// DEPLOY (CLI): supabase functions deploy provision-user
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALL_ROLES = ['super_admin', 'client_admin', 'ops_manager', 'shopper', 'analyst', 'executive']

// Mirrors STAKEHOLDER_ROLES in src/pages/admin/UsersPage.tsx. A client admin runs
// the programme but may not create or elevate platform administrators.
const STAKEHOLDER_ROLES = ['client_admin', 'executive', 'analyst', 'ops_manager']

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

/**
 * A temporary password the recipient will replace. Drawn from crypto random
 * bytes, with one character guaranteed from each class so it satisfies any
 * password policy the project has turned on.
 */
function temporaryPassword(): string {
  const lower = 'abcdefghijkmnopqrstuvwxyz' // no l
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I, O
  const digits = '23456789' // no 0, 1
  const symbols = '!@#$%^&*'
  const all = lower + upper + digits + symbols
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  const pick = (set: string, i: number) => set[bytes[i] % set.length]
  const chars = [pick(lower, 0), pick(upper, 1), pick(digits, 2), pick(symbols, 3)]
  for (let i = 4; i < bytes.length; i++) chars.push(pick(all, i))
  // Shuffle, so the guaranteed characters are not always in the first four slots.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // -------------------------------------------------------------------------
  // 1. Who is asking? Taken from their token, so the body cannot claim an
  //    identity. An unsigned or expired token stops here.
  // -------------------------------------------------------------------------
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Sign in first.' }, 401)

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: authData, error: authError } = await caller.auth.getUser()
  if (authError || !authData?.user) return json({ error: 'Your session has expired. Sign in again.' }, 401)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  // -------------------------------------------------------------------------
  // 2. Is the caller allowed to create this particular role?
  //    The role comes from the database, never from the request.
  // -------------------------------------------------------------------------
  const { data: profile } = await admin
    .from('users')
    .select('id, role, status')
    .eq('auth_id', authData.user.id)
    .maybeSingle()

  if (!profile || profile.status !== 'active') {
    return json({ error: 'Your account is not active on this platform.' }, 403)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Malformed request.' }, 400)
  }

  const email = String(body.email ?? '').trim().toLowerCase()
  const name = String(body.name ?? '').trim()
  const title = String(body.title ?? '').trim()
  const role = String(body.role ?? '').trim()
  const outletCodes = String(body.outletCodes ?? '').trim()

  if (!email || !name) return json({ error: 'Name and email are required.' }, 400)
  if (!ALL_ROLES.includes(role)) return json({ error: `"${role}" is not a role.` }, 400)

  const allowed =
    profile.role === 'super_admin'
      ? ALL_ROLES
      : profile.role === 'client_admin'
        ? STAKEHOLDER_ROLES
        : []

  if (!allowed.includes(role)) {
    return json({ error: `A ${profile.role} may not create a ${role}.` }, 403)
  }

  // An operations manager's access is an explicit list. Creating one with an
  // empty list produces an account that opens to a blank application, which
  // reads as a broken login rather than a configuration mistake.
  if (role === 'ops_manager' && !outletCodes) {
    return json({ error: 'An operations manager needs at least one outlet.' }, 400)
  }

  // -------------------------------------------------------------------------
  // 3. Create the Auth account. If one already exists for this address we keep
  //    it and leave its password alone — re-running must never reset a working
  //    login, and must never hand the caller somebody else's credentials.
  // -------------------------------------------------------------------------
  const password = temporaryPassword()
  let createdAuthId: string | null = null
  let reusedExisting = false

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  })

  if (createError) {
    const alreadyExists =
      createError.status === 422 || /already been registered|already exists/i.test(createError.message)
    if (!alreadyExists) return json({ error: `Could not create the login: ${createError.message}` }, 400)
    reusedExisting = true
  } else {
    createdAuthId = created?.user?.id ?? null
  }

  // -------------------------------------------------------------------------
  // 4. Profile, role and outlet scope. One call, which reports its own result.
  // -------------------------------------------------------------------------
  const { data: result, error: rpcError } = await admin.rpc('admin_provision_user', {
    p_email: email,
    p_name: name,
    p_title: title,
    p_role: role,
    p_outlet_codes: outletCodes,
  })

  const message = typeof result === 'string' ? result : ''
  const provisioningFailed = !!rpcError || message.startsWith('FAILED')

  if (provisioningFailed) {
    // Roll back, so a failed attempt does not leave a password that belongs to
    // no profile. Only remove an account this request created.
    if (createdAuthId) await admin.auth.admin.deleteUser(createdAuthId)
    return json({ error: rpcError?.message ?? message ?? 'Could not write the profile.' }, 400)
  }

  return json({
    ok: true,
    message,
    // Present only when a new login was created. An existing account keeps its
    // own password, which this function has no way to read.
    temporaryPassword: reusedExisting ? null : password,
    reusedExisting,
    // app.provision_user() reports outlet-code typos and empty scopes here.
    warning: message.includes('WARNING') ? message.slice(message.indexOf('WARNING')) : null,
  })
})
