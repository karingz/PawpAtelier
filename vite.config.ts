import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Echo browser logs (src/debug/log.ts) and uncaught errors in the dev-server terminal.
    forwardConsole: {
      unhandledErrors: true,
      logLevels: ['error', 'warn', 'info', 'log', 'debug'],
    },
  },
})
