import { silentLogger, type Logger } from '../application/ports'

/**
 * Console logger for development diagnostics. Enabled only when VITE_DEBUG=true.
 * It takes fixed codes, never payloads, URLs or tokens, and it is never per-message
 * (a flood of bad frames must not become a flood of console output).
 */
export function createLogger(enabled: boolean): Logger {
  if (!enabled) return silentLogger
  return {
    debug: (code) => console.debug(`[live-feed] ${code}`),
    warn: (code) => console.warn(`[live-feed] ${code}`),
  }
}
