// ============================================================================
// switch-account — a super admin opens another user's account in one click.
//
// Why it exists: one person (the programme lead) keys in work for several
// shoppers and reviewers while the programme is being set up and demonstrated,
// and should not have to hold everybody's password to do it.
//
// Why it is safe enough for a public address: there is no button on the sign-in
// page. Only someone ALREADY signed in as an active super admin can call this,
// and the identity is taken from their own token, never from the request body.
// Every switch is written to the activity log under the administrator's name.
//
// What it does, in order:
//   1. Identifies the caller from their JWT.
//   2. Confirms the caller is an active super admin.
//   3. Reads the target user. Refuses inactive users, users with no login, the
//      caller themselves, and other super admins — an administrator may act as
//      the people they manage, not as their peers.
//   4. Generates a one-time magic-link token for the target WITHOUT sending any
//      email, and returns only its hash. The browser exchanges it for a session
//      with auth.verifyOtp(); it is single-use and expires within the hour.
//   5. Logs the switch.
//
// Profiles are read through the CALLER's client: a super admin may read every
// user row, and service_role holds no table grants in this project (see
// supabase/README.md). The service key is used for the Auth admin API only.
//
// DEPLOY (dashboard): Edge Functions -> Deploy a new function -> name it exactly
// `switch-account`, paste this file, Deploy. Keep "Verify JWT" ON.
// DEPLOY (CLI): supabase functions deploy switch-account
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !anonKey || !serviceKey) {
    return json({ error: 'Server misconfigured: Supabase keys are not available to this function.', step: 'env' }, 500)
  }

  // 1. Who is asking.
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Sign in first.', step: 'auth' }, 401)
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: authData, error: authError } = await caller.auth.getUser()
  if (authError || !authData?.user) return json({ error: 'Your session has expired. Sign in again.', step: 'auth' }, 401)

  // 2. Only an active super admin.
  const { data: me, error: meError } = await caller
    .from('users')
    .select('id, name, role, status')
    .eq('auth_id', authData.user.id)
    .maybeSingle()
  if (meError) return json({ error: `Could not read your profile: ${meError.message}`, step: 'profile' }, 500)
  if (!me || me.status !== 'active' || me.role !== 'super_admin') {
    return json({ error: 'Only an active super admin can switch accounts.', step: 'authorize' }, 403)
  }

  // 3. The account to open.
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Malformed request.', step: 'body' }, 400)
  }
  const targetId = String(body.userId ?? '').trim()
  if (!targetId) return json({ error: 'Choose an account.', step: 'input' }, 400)
  if (targetId === me.id) return json({ error: 'That is your own account.', step: 'input' }, 400)

  const { data: target, error: targetError } = await caller
    .from('users')
    .select('id, name, email, role, status, auth_id')
    .eq('id', targetId)
    .maybeSingle()
  if (targetError) return json({ error: `Could not read that account: ${targetError.message}`, step: 'target' }, 500)
  if (!target) return json({ error: 'No such account.', step: 'target' }, 404)
  if (target.status !== 'active') return json({ error: `${target.name}'s account is ${target.status}, not active.`, step: 'target' }, 400)
  if (target.role === 'super_admin') {
    return json({ error: 'Switching into another super admin is not allowed.', step: 'target' }, 403)
  }
  if (!target.auth_id) {
    return json({ error: `${target.name} has no login yet. Create one from Administration → Users.`, step: 'target' }, 400)
  }

  // 4. A one-time token. generateLink never sends an email.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: authUser, error: lookupError } = await admin.auth.admin.getUserById(target.auth_id)
  if (lookupError || !authUser?.user?.email) {
    return json({ error: `Could not find ${target.name}'s login: ${lookupError?.message ?? 'no email on record'}`, step: 'lookup' }, 400)
  }
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: authUser.user.email })
  const tokenHash = link?.properties?.hashed_token
  if (linkError || !tokenHash) {
    return json({ error: `Could not open ${target.name}'s account: ${linkError?.message ?? 'no token returned'}`, step: 'token' }, 500)
  }

  // 5. On the record, under the administrator's own name. No record, no switch:
  //    the token is withheld (unused, it expires on its own), so nothing done in
  //    a borrowed account can ever be untraceable to the person who borrowed it.
  const now = new Date().toISOString()
  const { error: logError } = await caller.from('activity_logs').insert({
    id: `log-${crypto.randomUUID()}`,
    timestamp: now,
    user_id: me.id,
    user_name: me.name,
    action: 'Switched account',
    module: 'Users',
    record_id: target.id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '',
    result: 'Success',
    details: `${me.name} opened ${target.name}'s account (${target.role})`,
  })

  if (logError) {
    return json({ error: `The switch could not be recorded in the activity log, so it was not made: ${logError.message}`, step: 'audit' }, 500)
  }

  return json({ ok: true, tokenHash, name: target.name, role: target.role })
})
