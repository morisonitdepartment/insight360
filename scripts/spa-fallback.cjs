/**
 * Generates the GitHub Pages SPA fallback.
 *
 * GitHub Pages serves ONE 404.html for the entire site, so a deep link into the
 * production build at /<repo>/app/... would otherwise be answered with the demo
 * build sitting at /<repo>/. The fallback below therefore works out which of the
 * two apps the URL belongs to, then redirects to that app's index with the route
 * preserved in the query string as `?/the/route`. The decoder already present in
 * index.html turns that back into a real path before React Router starts.
 *
 * Usage:
 *   node scripts/spa-fallback.cjs            # demo only
 *   node scripts/spa-fallback.cjs --with-app # demo plus the /app/ production build
 */
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const withApp = process.argv.includes('--with-app');

// Sub-applications published beneath the repository base path.
const SUB_APPS = withApp ? ['app'] : [];

const fallback = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Redirecting…</title>
    <script>
      // Route the request to the correct application, preserving the path.
      (function () {
        var SUB_APPS = ${JSON.stringify(SUB_APPS)};
        var l = window.location;
        var parts = l.pathname.split('/').filter(Boolean);
        var repo = parts.length ? '/' + parts[0] + '/' : '/';
        var rest = parts.slice(1);
        var base = repo;
        if (rest.length && SUB_APPS.indexOf(rest[0]) !== -1) {
          base = repo + rest[0] + '/';
          rest = rest.slice(1);
        }
        var search = l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '';
        l.replace(l.protocol + '//' + l.host + base + '?/' + rest.join('/') + search + l.hash);
      })();
    </script>
  </head>
  <body></body>
</html>
`;

fs.writeFileSync(path.join(dist, '404.html'), fallback);
fs.writeFileSync(path.join(dist, '.nojekyll'), '');

console.log(`dist/404.html written (sub-apps: ${SUB_APPS.length ? SUB_APPS.join(', ') : 'none'})`);
console.log('dist/.nojekyll written');
