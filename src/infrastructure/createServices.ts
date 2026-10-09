import { LiveFeed } from '../application/LiveFeed'
import type { StreamTransport } from '../application/ports'
import type { AppConfig } from './config'
import { createLogger } from './logger'
import { SimulatedTransport, type SimulatorControls } from './transports/SimulatedTransport'
import { WebSocketTransport, type TokenProvider } from './transports/WebSocketTransport'

/** Everything the UI may use. Built once, in the composition root. */
export interface Services {
  readonly feed: LiveFeed
  /** Present only in simulated mode. */
  readonly simulator: SimulatorControls | null
  readonly configWarning: string | null
}

/**
 * Fetches a short-lived stream token from a same-origin endpoint using the
 * session cookie. The token stays in this closure for one connect attempt.
 */
const sameOriginTokenProvider =
  (tokenUrl: string): TokenProvider =>
  async () => {
    const response = await fetch(tokenUrl, { credentials: 'same-origin', cache: 'no-store' })
    if (!response.ok) throw new Error('token request failed')
    const body: unknown = await response.json()
    const token = typeof body === 'object' && body !== null ? (body as { token?: unknown }).token : null
    return typeof token === 'string' && token.length > 0 && token.length < 4096 ? token : null
  }

/** Composition root: chooses adapters from config and wires them into the application layer. */
export function createServices(config: AppConfig): Services {
  let transport: StreamTransport
  let simulator: SimulatorControls | null = null

  if (config.stream.mode === 'websocket') {
    const { url, tokenUrl } = config.stream
    transport = new WebSocketTransport({ url, getToken: tokenUrl ? sameOriginTokenProvider(tokenUrl) : undefined })
  } else {
    const sim = new SimulatedTransport({ rate: config.stream.rate, chaos: true })
    transport = sim
    simulator = sim
  }

  const feed = new LiveFeed({ transport, connection: { logger: createLogger(config.debug) } })
  return { feed, simulator, configWarning: config.configWarning }
}
