import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), nonCommercialGuard()],
  worker: { format: 'es' },
  // Pre-bundle at startup: discovering it when the cutout worker first loads makes Vite
  // reload the page mid-session (losing the design).
  optimizeDeps: { include: ['@huggingface/transformers'] },
  build: {
    // Korean fonts ship hundreds of small unicode-range subsets; keep them as separate files
    // the browser fetches on demand instead of base64-inlining them all into the CSS.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
  },
  server: {
    // Echo browser logs (src/debug/log.ts) and uncaught errors in the dev-server terminal.
    forwardConsole: {
      unhandledErrors: true,
      logLevels: ['error', 'warn', 'info', 'log', 'debug'],
    },
  },
})

/**
 * Non-commercial dependencies (src/config/non-commercial.json) are fine while building the
 * shop, never in the live one. Every build prints them; `PAWP_LIVE=1 npm run build` refuses.
 */
function nonCommercialGuard(): Plugin {
  return {
    name: 'pawp-non-commercial-guard',
    apply: 'build',
    buildStart() {
      const url = new URL('./src/config/non-commercial.json', import.meta.url)
      const { dependencies } = JSON.parse(readFileSync(url, 'utf8')) as {
        dependencies: { name: string; usedFor: string; replaceWith: string }[]
      }
      if (!dependencies.length) return
      const list = dependencies.map((d) => `  - ${d.name}: ${d.usedFor}\n    replace with: ${d.replaceWith}`).join('\n')
      if (process.env.PAWP_LIVE === '1') {
        this.error(`Live build blocked: non-commercial dependencies still in use:\n${list}`)
      }
      this.warn(`NON-COMMERCIAL dependencies in this build (dev only, not for the live shop):\n${list}`)
    },
  }
}
