/*
 * Runs scripts/check-frameworks.ts through Vite's SSR loader so the `@` alias and
 * `import.meta.env` resolve exactly as they do in the app.
 *
 *   npm run check:frameworks                       # the default client
 *   VITE_CLIENT=hermanos npm run check:frameworks  # another client
 */
import { createServer } from 'vite'

const server = await createServer({
  configFile: 'vite.config.ts',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
})
try {
  // The check sets process.exitCode itself when it finds an error.
  await server.ssrLoadModule('/scripts/check-frameworks.ts')
} catch (err) {
  // A thrown authoring guard (weights off 100, a gate naming an unknown key) is a
  // failure to report, not a stack trace to bury the reader in.
  console.error(`\n  x ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
} finally {
  // Let the loader close its own handles. Calling process.exit() with one still
  // open aborts Node on Windows and buries the report.
  await server.close()
}
