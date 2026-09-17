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

async function probe(table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=5`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
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
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: 'rls-probe-should-not-exist', code: 'RLS-PROBE', name: 'RLS probe', brand_id: 'x', brand: 'x', segment: 'F&B', subcategory: 'Café', location: 'x', region: 'x', manager: 'x' }),
})
const writeBlocked = write.status >= 400
if (!writeBlocked) failures++
console.log(`\nAnonymous write\n  ${writeBlocked ? 'PASS' : 'FAIL'}  outlets insert ${writeBlocked ? `refused (HTTP ${write.status})` : 'ACCEPTED — anyone can write to your database'}`)

console.log(`\n${failures === 0 ? 'All checks passed. The publishable key alone grants no access.' : `${failures} FAILURE(S) — see above.`}`)
process.exit(failures === 0 ? 0 : 1)
