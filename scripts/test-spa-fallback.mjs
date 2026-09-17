/**
 * Simulates the two-step GitHub Pages SPA fallback end to end:
 *
 *   1. 404.html decides which app the URL belongs to and rewrites it to
 *      <base>?/<route>
 *   2. index.html's decoder turns that back into <base><route>
 *
 * The final path must equal the original request, and its base must match the
 * app that should have served it. Deep links breaking on refresh is the classic
 * GitHub Pages SPA failure, so it is worth proving rather than assuming.
 *
 * Run: node scripts/test-spa-fallback.mjs
 */

const SUB_APPS = ['app']

// Mirrors the script written into dist/404.html by scripts/spa-fallback.cjs.
function fallbackRedirect(pathname, search = '', hash = '') {
  const parts = pathname.split('/').filter(Boolean)
  const repo = parts.length ? '/' + parts[0] + '/' : '/'
  let rest = parts.slice(1)
  let base = repo
  if (rest.length && SUB_APPS.indexOf(rest[0]) !== -1) {
    base = repo + rest[0] + '/'
    rest = rest.slice(1)
  }
  const s = search ? '&' + search.slice(1).replace(/&/g, '~and~') : ''
  return base + '?/' + rest.join('/') + s + hash
}

// Mirrors the decoder inlined in index.html.
function indexDecode(url) {
  const [pathname, rawQuery = ''] = url.split('?')
  const hashIndex = rawQuery.indexOf('#')
  const hash = hashIndex >= 0 ? rawQuery.slice(hashIndex) : ''
  const query = hashIndex >= 0 ? rawQuery.slice(0, hashIndex) : rawQuery
  if (!query.startsWith('/')) return url
  const parts = query.slice(1).split('&')
  const route = parts[0].replace(/~and~/g, '&')
  const restQuery = parts.slice(1).join('&')
  const basePath = pathname.replace(/\/$/, '')
  return basePath + '/' + route + (restQuery ? '?' + restQuery : '') + hash
}

const cases = [
  // [requested path, expected final path, which app should serve it]
  ['/insight360/performance/outlets', '/insight360/performance/outlets', 'demo'],
  ['/insight360/operations/visits/vis-0131', '/insight360/operations/visits/vis-0131', 'demo'],
  ['/insight360/app/performance/executive', '/insight360/app/performance/executive', 'live'],
  ['/insight360/app/admin/outlets', '/insight360/app/admin/outlets', 'live'],
  ['/insight360/app/login', '/insight360/app/login', 'live'],
  // A demo route whose first segment merely resembles a sub-app name must not be hijacked.
  ['/insight360/application/thing', '/insight360/application/thing', 'demo'],
]

let failures = 0
console.log('request -> after 404 redirect -> after index decode\n')

for (const [requested, expected, expectedApp] of cases) {
  const redirected = fallbackRedirect(requested)
  const final = indexDecode(redirected)
  const servedByApp = redirected.startsWith('/insight360/app/') ? 'live' : 'demo'
  const ok = final === expected && servedByApp === expectedApp
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${requested}`)
  console.log(`      -> ${redirected}`)
  console.log(`      -> ${final}   [served by ${servedByApp}, expected ${expectedApp}]`)
  if (!ok) console.log(`      EXPECTED ${expected}`)
}

// Query strings and hashes must survive the round trip.
const withQuery = indexDecode(fallbackRedirect('/insight360/quality/alerts', '?alert=alr-013'))
const queryOk = withQuery === '/insight360/quality/alerts?alert=alr-013'
if (!queryOk) failures++
console.log(`${queryOk ? 'PASS' : 'FAIL'}  query preserved -> ${withQuery}`)

const withHash = indexDecode(fallbackRedirect('/insight360/app/performance/outlets/o1', '', '#comparison'))
const hashOk = withHash === '/insight360/app/performance/outlets/o1#comparison'
if (!hashOk) failures++
console.log(`${hashOk ? 'PASS' : 'FAIL'}  hash preserved  -> ${withHash}`)

console.log(`\n${failures === 0 ? 'All fallback cases passed.' : `${failures} FAILURE(S).`}`)
process.exit(failures === 0 ? 0 : 1)
