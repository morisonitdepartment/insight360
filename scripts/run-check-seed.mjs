/*
 * Runs scripts/check-seed.ts through Vite's SSR loader so the `@` alias and
 * `import.meta.env` resolve exactly as they do in the app.
 *
 *   npm run check:seed                       # the default client
 *   VITE_CLIENT=hermanos npm run check:seed  # another client
 */
import { createServer } from 'vite'

const server = await createServer({
  configFile: 'vite.config.ts',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
})
try {
  await server.ssrLoadModule('/scripts/check-seed.ts')
} finally {
  await server.close()
}
