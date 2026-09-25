/**
 * Tiny scoped logger on top of the browser console. In dev, Vite's `server.forwardConsole`
 * (vite.config.ts) echoes these lines, plus uncaught errors, in the `npm run dev` terminal.
 *
 * Level: VITE_LOG_LEVEL=debug|info|warn|error (default: debug in dev, warn in builds).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const envLevel = import.meta.env.VITE_LOG_LEVEL as LogLevel | undefined
const minLevel: LogLevel = envLevel && envLevel in RANK ? envLevel : import.meta.env.DEV ? 'debug' : 'warn'

function emit(level: LogLevel, scope: string, msg: string, data?: unknown) {
  if (RANK[level] < RANK[minLevel]) return
  const line = `[${scope}] ${msg}`
  if (data === undefined) console[level](line)
  else console[level](line, data)
}

export const log = {
  debug: (scope: string, msg: string, data?: unknown) => emit('debug', scope, msg, data),
  info: (scope: string, msg: string, data?: unknown) => emit('info', scope, msg, data),
  warn: (scope: string, msg: string, data?: unknown) => emit('warn', scope, msg, data),
  error: (scope: string, msg: string, data?: unknown) => emit('error', scope, msg, data),
}
