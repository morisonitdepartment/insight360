/*
 * Runs scripts/emit-live-seed.ts through Vite's SSR loader so the `@` alias and
 * `import.meta.env` resolve exactly as they do in the app.
 *
 *   VITE_APP_MODE=demo VITE_CLIENT=sterling npm run emit:live-seed
 */
import { createServer } from 'vite'

const server = await createServer({
  configFile: 'vite.config.ts',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
})
try {
  await server.ssrLoadModule('/scripts/emit-live-seed.ts')
} finally {
  await server.close()
}
