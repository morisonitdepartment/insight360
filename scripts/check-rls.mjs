/**
 * check-rls.mjs — verifies that the publishable key alone grants no data access.
 *
 * The publishable key is embedded in the browser bundle, so anyone can read it. The
 * only thing standing between it and your data is row level security. This script
 * calls the REST API with that key and NO user session, exactly as a stranger with
 * the site URL could, and reports what comes back.
 *
 * Expected: every table returns 0 rows or an explicit permission error.
 * A table returning rows here is readable by the entire internet.
 *
 * The key is never printed.
 *
 * Run: node scripts/check-rls.mjs
 */
import { readFileSync } from 'node:fs'

function readEnv(file = '.env') {
  const text = readFileSync(file, 'utf8')
  const get = (k) => (text.match(new RegExp(`^${k}\\s*=\\s*(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '')
  return { url: get('VITE_SUPABASE_URL'), key: get('VITE_SUPABASE_ANON_KEY') }
}

const { url, key } = readEnv()
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

// Tables holding operational or personal data. None should be anonymously readable.
const SENSITIVE = [
  'users', 'outlets', 'visits', 'visit_answers', 'evidence', 'findings',
  'alerts', 'corrective_actions', 'comments', 'notifications', 'activity_logs',
  'shoppers', 'reports', 'brands',
]

// Reference configuration. Readable only to signed-in users under our policies.
const REFERENCE = ['organizations', 'kpi_config', 'scenarios', 'audit_templates', 'notification_rules']

/**
 * A rejected key makes every probe below "fail closed" and the whole script
 * reports success — which is exactly the wrong answer, arrived at without
 * testing anything. So prove the key works before concluding anything from it
 * being refused.
 *
 * /auth/v1/settings is public to any valid key and touches no data.
 */
async function assertKeyIsUsable() {
  const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
  // Always drain the body. An unread response keeps its socket open, and exiting
  // with one still in flight aborts the process untidily on Windows.
  const body = await res.text()
  if (res.ok) return
  console.error('The key in .env was rejected by Supabase, so nothing below would be tested.')
  console.error(`  HTTP ${res.status} — ${body.slice(0, 120)}`)
  console.error('')
  console.error('Copy the publishable key again from Project Settings -> API Keys. A key')
  console.error('that is one character short fails exactly like this.')
  // Let the HTTP agent's sockets close before leaving. Calling process.exit()
  // while one is still open aborts Node on Windows, which buries the message
  // above under a libuv assertion.
  process.exitCode = 1
  await new Promise((resolve) => setTimeout(resolve, 50))
  process.exit(1)
}

await assertKeyIsUsable()

async function probe(table) {
  // A `sb_publishable_` key goes in `apikey` only. Putting it in an
  // Authorization bearer header makes the gateway reject the request before it
  // reaches the database, which looks identical to RLS doing its job.
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=5`, {
    headers: { apikey: key },
  })
  let body
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (Array.isArray(body)) return { status: res.status, rows: body.length }
  return { status: res.status, error: body?.message ?? body?.code ?? `HTTP ${res.status}` }
}

const verdict = (r) => {
  // "Invalid API key" is the gateway turning us away, not the database. It proves
  // nothing about row level security, so it must never be counted as a pass.
  if (r.error && /invalid api key/i.test(String(r.error))) {
    return { ok: false, note: 'INCONCLUSIVE — the key was rejected, nothing was tested' }
  }
  if (r.error) return { ok: true, note: `blocked (${String(r.error).slice(0, 48)})` }
  if (r.rows === 0) return { ok: true, note: 'no rows returned' }
  return { ok: false, note: `EXPOSED — returned ${r.rows} row(s)` }
}

console.log('Probing as an anonymous visitor holding only the publishable key')
console.log(`Project: ${url}\n`)

let failures = 0

console.log('Operational and personal data')
for (const t of SENSITIVE) {
  const v = verdict(await probe(t))
  if (!v.ok) failures++
  console.log(`  ${v.ok ? 'PASS' : 'FAIL'}  ${t.padEnd(20)} ${v.note}`)
}

console.log('\nReference configuration')
for (const t of REFERENCE) {
  const v = verdict(await probe(t))
  if (!v.ok) failures++
  console.log(`  ${v.ok ? 'PASS' : 'FAIL'}  ${t.padEnd(20)} ${v.note}`)
}

// Writing must be refused too: reading being blocked does not imply writing is.
const write = await fetch(`${url}/rest/v1/outlets`, {
  method: 'POST',
  headers: { apikey: key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: 'rls-probe-should-not-exist', code: 'RLS-PROBE', name: 'RLS probe', brand_id: 'x', brand: 'x', segment: 'F&B', subcategory: 'Café', location: 'x', region: 'x', manager: 'x' }),
})
const writeBlocked = write.status >= 400
if (!writeBlocked) failures++
console.log(`\nAnonymous write\n  ${writeBlocked ? 'PASS' : 'FAIL'}  outlets insert ${writeBlocked ? `refused (HTTP ${write.status})` : 'ACCEPTED — anyone can write to your database'}`)

// These are the two endpoints that can mint a login. An anonymous caller
// reaching either is the worst case in the whole system, so probe both.
console.log('\nUser provisioning')

const rpc = await fetch(`${url}/rest/v1/rpc/admin_provision_user`, {
  method: 'POST',
  headers: { apikey: key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_email: 'rls-probe@example.com', p_name: 'RLS probe', p_title: 'probe', p_role: 'super_admin' }),
})
const rpcBody = await rpc.text()
const rpcBlocked = rpc.status >= 400
// A 404 means the function is absent, not locked — migration 0007 was not
// applied. Say which it is, because "refused" would read as a pass either way.
const rpcMissing = rpc.status === 404 || /could not find the function/i.test(rpcBody)
if (!rpcBlocked) failures++
if (rpcMissing) failures++
console.log(
  `  ${rpcBlocked && !rpcMissing ? 'PASS' : 'FAIL'}  admin_provision_user    ` +
    (rpcMissing
      ? 'NOT INSTALLED — apply migration 0007'
      : rpcBlocked
        ? `refused (HTTP ${rpc.status}: ${rpcBody.slice(0, 60)})`
        : 'ACCEPTED — anyone can create a super_admin'),
)

const fn = await fetch(`${url}/functions/v1/provision-user`, {
  method: 'POST',
  headers: { apikey: key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'rls-probe@example.com', name: 'RLS probe', role: 'super_admin' }),
})
const fnBody = await fn.text()
const fnBlocked = fn.status >= 400
// 404 from the functions gateway means nothing is deployed under that name.
const fnMissing = fn.status === 404
if (!fnBlocked) failures++
if (fnMissing) failures++
console.log(
  `  ${fnBlocked && !fnMissing ? 'PASS' : 'FAIL'}  provision-user function ` +
    (fnMissing
      ? 'NOT DEPLOYED — see supabase/functions/README.md'
      : fnBlocked
        ? `refused (HTTP ${fn.status}: ${fnBody.slice(0, 60)})`
        : 'ACCEPTED — anyone can create a super_admin'),
)

console.log(`\n${failures === 0 ? 'All checks passed. The publishable key alone grants no access.' : `${failures} FAILURE(S) — see above.`}`)
process.exit(failures === 0 ? 0 : 1)
