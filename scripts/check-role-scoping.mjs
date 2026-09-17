/**
 * check-role-scoping.mjs — prove that each role really is confined to its own data.
 *
 * check-rls.mjs proves an anonymous stranger sees nothing. That is the easy half.
 * The harder half is whether a legitimately signed-in user is confined to what
 * their role allows, because a mistake there is invisible: everything works, and
 * an operations manager quietly reads another region's scores.
 *
 * This signs in as real test accounts over the public API, exactly as the browser
 * does, and asserts what each one can and cannot reach. It uses only the
 * publishable key plus each account's own password — no service-role key, no
 * privileged connection — so it tests the same path an attacker would use.
 *
 * SETUP
 *   1. Create four test accounts (Authentication -> Users), then provision them:
 *
 *        select app.provision_user('t.ops@example.com','Test Ops','QA','ops_manager','OUT-001');
 *        select app.provision_user('t.shopper@example.com','Test Shopper','QA','shopper','');
 *        select app.provision_user('t.exec@example.com','Test Exec','QA','executive','');
 *        select app.provision_user('t.analyst@example.com','Test Analyst','QA','analyst','');
 *
 *   2. Put their passwords in .env (git-ignored; never .env.example):
 *
 *        TEST_OPS_EMAIL=t.ops@example.com
 *        TEST_OPS_PASSWORD=...
 *        TEST_SHOPPER_EMAIL=...        TEST_SHOPPER_PASSWORD=...
 *        TEST_EXEC_EMAIL=...           TEST_EXEC_PASSWORD=...
 *        TEST_ANALYST_EMAIL=...        TEST_ANALYST_PASSWORD=...
 *
 *   3. node scripts/check-role-scoping.mjs
 *
 * Accounts that are not configured are skipped and reported as skipped, so this
 * is useful even with one of them set up. Passwords are never printed.
 *
 * Delete the test accounts when the programme goes live:
 *   update public.users set status = 'inactive' where email like 't.%@example.com';
 */
import { readFileSync } from 'node:fs'

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
function loadEnv(file = '.env') {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    console.error(`Cannot read ${file}. Copy .env.example to .env and fill it in.`)
    process.exit(1)
  }
  const get = (k) =>
    (text.match(new RegExp(`^${k}\\s*=\\s*(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '')
  return get
}

const env = loadEnv()
const URL = env('VITE_SUPABASE_URL')
const ANON = env('VITE_SUPABASE_ANON_KEY')

if (!URL || !ANON) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}
if (ANON.startsWith('sb_secret_') || ANON.includes('service_role')) {
  console.error('VITE_SUPABASE_ANON_KEY looks like a SECRET key. It bypasses RLS, so this')
  console.error('test would pass no matter how broken the policies are. Use the publishable key.')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function signIn(email, password) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.access_token) {
    return { error: body?.error_description ?? body?.msg ?? `HTTP ${res.status}` }
  }
  return { token: body.access_token }
}

const auth = (token) => ({ apikey: ANON, Authorization: `Bearer ${token}` })

async function select(token, path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: auth(token) })
  const body = await res.json().catch(() => null)
  return Array.isArray(body)
    ? { rows: body }
    : { error: body?.message ?? body?.code ?? `HTTP ${res.status}`, status: res.status }
}

async function patch(token, path, payload) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...auth(token), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => null)
  // PostgREST reports an RLS refusal as 0 rows changed, not as an error, so a
  // successful-looking response with an empty array still means "blocked".
  const changed = Array.isArray(body) ? body.length : 0
  return { ok: res.ok, status: res.status, changed, error: body?.message ?? null }
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------
let pass = 0
let fail = 0
let skipped = 0

function check(label, ok, detail) {
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

function skip(label, why) {
  skipped++
  console.log(`  SKIP  ${label} — ${why}`)
}

async function account(key, label) {
  const email = env(`TEST_${key}_EMAIL`)
  const password = env(`TEST_${key}_PASSWORD`)
  if (!email || !password) return { skip: `TEST_${key}_EMAIL / TEST_${key}_PASSWORD not set in .env` }
  const { token, error } = await signIn(email, password)
  if (error) return { skip: `could not sign in as ${label} (${error})` }
  const me = await select(token, 'users?select=id,role,outlet_ids,status&limit=2')
  return { token, email, profile: me.rows?.[0], meError: me.error }
}

console.log('Signing in as real accounts and checking what each role can reach')
console.log(`Project: ${URL}\n`)

// --- Operations manager: assigned outlets only ------------------------------
console.log('Operations manager — confined to assigned outlets')
{
  const a = await account('OPS', 'the operations manager')
  if (a.skip) skip('operations manager scoping', a.skip)
  else if (!a.profile) check('profile resolves', false, a.meError ?? 'no users row returned')
  else {
    const assigned = a.profile.outlet_ids ?? []
    check('role is ops_manager', a.profile.role === 'ops_manager', `got ${a.profile.role}`)
    check('has an explicit outlet list', assigned.length > 0,
      assigned.length === 0 ? 'none assigned — this test proves nothing until outlets are set' : `${assigned.length} assigned`)

    const outlets = await select(a.token, 'outlets?select=id,code&limit=200')
    if (outlets.error) check('can read own outlets', false, outlets.error)
    else {
      const seen = outlets.rows.map((o) => o.id)
      const extra = seen.filter((id) => !assigned.includes(id))
      check('sees no outlet outside the assigned list', extra.length === 0,
        extra.length ? `LEAK: ${extra.slice(0, 5).join(', ')}` : `${seen.length} outlet(s), all assigned`)
    }

    const visits = await select(a.token, 'visits?select=id,outlet_id&limit=200')
    if (visits.error) check('can read visits for own outlets', false, visits.error)
    else {
      const extra = visits.rows.filter((v) => !assigned.includes(v.outlet_id))
      check('sees no visit from another outlet', extra.length === 0,
        extra.length ? `LEAK: ${extra.length} visit(s)` : `${visits.rows.length} visit(s), all in scope`)
    }

    // The escalation guard: changing your own role must be refused.
    const esc = await patch(a.token, `users?id=eq.${a.profile.id}`, { role: 'super_admin' })
    check('cannot promote itself to super_admin', esc.changed === 0,
      esc.changed ? 'ESCALATED — the guard did not fire' : `refused (HTTP ${esc.status})`)
  }
}

// --- Shopper: own visits only, no management reporting ----------------------
console.log('\nField auditor (shopper) — own work only')
{
  const a = await account('SHOPPER', 'the shopper')
  if (a.skip) skip('shopper scoping', a.skip)
  else if (!a.profile) check('profile resolves', false, a.meError ?? 'no users row returned')
  else {
    check('role is shopper', a.profile.role === 'shopper', `got ${a.profile.role}`)

    const reports = await select(a.token, 'reports?select=id&limit=5')
    const reportsBlocked = !!reports.error || reports.rows?.length === 0
    check('cannot read management reports', reportsBlocked,
      reportsBlocked ? (reports.error ? `blocked (${reports.error})` : 'no rows') : `LEAK: ${reports.rows.length} report(s)`)

    const people = await select(a.token, 'users?select=id&limit=50')
    const peopleRows = people.rows?.length ?? 0
    check('cannot browse the staff directory', !!people.error || peopleRows <= 1,
      people.error ? `blocked (${people.error})` : `${peopleRows} row(s) visible`)

    const visits = await select(a.token, 'visits?select=id,shopper_id&limit=200')
    if (visits.error) {
      check('sees only own visits', true, `blocked entirely (${visits.error})`)
    } else {
      const others = visits.rows.filter((v) => v.shopper_id !== a.profile.shopper_id && v.shopper_id !== null)
      check('sees only own visits', others.length === 0,
        others.length ? `LEAK: ${others.length} visit(s) belonging to others` : `${visits.rows.length} visit(s), all own`)
    }
  }
}

// --- Executive: read everything, write nothing ------------------------------
console.log('\nExecutive — read-only across the business')
{
  const a = await account('EXEC', 'the executive')
  if (a.skip) skip('executive read-only', a.skip)
  else if (!a.profile) check('profile resolves', false, a.meError ?? 'no users row returned')
  else {
    check('role is executive', a.profile.role === 'executive', `got ${a.profile.role}`)

    const outlets = await select(a.token, 'outlets?select=id&limit=5')
    check('can read outlets', !outlets.error, outlets.error ?? `${outlets.rows.length} row(s)`)

    const first = outlets.rows?.[0]?.id
    if (!first) skip('executive cannot write', 'no outlets exist yet to attempt a write against')
    else {
      const w = await patch(a.token, `outlets?id=eq.${first}`, { manager: 'rls-probe-should-not-stick' })
      check('cannot modify an outlet', w.changed === 0,
        w.changed ? 'WROTE — an executive changed operational data' : `refused (HTTP ${w.status})`)
    }
  }
}

// --- Analyst: reads widely, changes no configuration ------------------------
console.log('\nAnalyst — reads widely, changes no configuration')
{
  const a = await account('ANALYST', 'the analyst')
  if (a.skip) skip('analyst scoping', a.skip)
  else if (!a.profile) check('profile resolves', false, a.meError ?? 'no users row returned')
  else {
    check('role is analyst', a.profile.role === 'analyst', `got ${a.profile.role}`)

    const visits = await select(a.token, 'visits?select=id&limit=5')
    check('can read visits across outlets', !visits.error, visits.error ?? `${visits.rows.length} row(s)`)

    const org = await select(a.token, 'organizations?select=id&limit=1')
    const orgId = org.rows?.[0]?.id
    if (!orgId) skip('analyst cannot change settings', 'no organisation row returned')
    else {
      const w = await patch(a.token, `organizations?id=eq.${orgId}`, { reporting_target_hours: 999 })
      check('cannot change organisation settings', w.changed === 0,
        w.changed ? 'WROTE — an analyst changed programme settings' : `refused (HTTP ${w.status})`)
    }
  }
}

// ---------------------------------------------------------------------------
console.log('')
if (fail > 0) {
  console.log(`${fail} FAILURE(S), ${pass} passed, ${skipped} skipped.`)
  console.log('A failure here means a signed-in user can reach data their role should not.')
  process.exit(1)
}
if (pass === 0) {
  console.log(`Nothing was tested — ${skipped} check group(s) skipped. Configure the test accounts in .env.`)
  process.exit(1)
}
console.log(`All ${pass} checks passed${skipped ? `, ${skipped} skipped` : ''}. Each role is confined to its own data.`)
