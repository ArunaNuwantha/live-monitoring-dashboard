/**
 * Runtime configuration from Vite env variables.
 *
 * Only VITE_-prefixed variables reach the bundle, and everything here ends up
 * public. Secrets never go in env: auth tokens are fetched at runtime from
 * VITE_STREAM_TOKEN_URL (a same-origin endpoint backed by an httpOnly session).
 */

export type StreamConfig =
  | { readonly mode: 'simulated'; readonly rate: number }
  | { readonly mode: 'websocket'; readonly url: string; readonly tokenUrl: string | null }

export interface AppConfig {
  readonly stream: StreamConfig
  readonly debug: boolean
  /** Set when the requested configuration was invalid and a safe fallback was used. */
  readonly configWarning: string | null
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Accepts wss:// anywhere, plain ws:// only for local development. */
export function parseStreamUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.username || url.password) return null // never allow credentials in the URL
    if (url.protocol === 'wss:') return url.toString()
    if (url.protocol === 'ws:' && LOCAL_HOSTS.has(url.hostname)) return url.toString()
    return null
  } catch {
    return null
  }
}

/** Token endpoint must be same-origin (relative path) so cookies never go cross-site. */
function parseTokenUrl(value: string | undefined): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null
}

function parseRate(value: string | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20_000) : 200
}

export function loadConfig(env: Record<string, string | boolean | undefined> = import.meta.env): AppConfig {
  const str = (key: string) => (typeof env[key] === 'string' ? (env[key] as string).trim() : undefined)
  const debug = str('VITE_DEBUG') === 'true'

  if (str('VITE_STREAM_MODE') === 'websocket') {
    const url = parseStreamUrl(str('VITE_STREAM_URL'))
    if (url) {
      return { debug, configWarning: null, stream: { mode: 'websocket', url, tokenUrl: parseTokenUrl(str('VITE_STREAM_TOKEN_URL')) } }
    }
    return {
      debug,
      configWarning: 'Invalid stream URL. Using the built-in simulated feed instead.',
      stream: { mode: 'simulated', rate: parseRate(str('VITE_SIM_RATE')) },
    }
  }

  return { debug, configWarning: null, stream: { mode: 'simulated', rate: parseRate(str('VITE_SIM_RATE')) } }
}
