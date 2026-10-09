import type { ConnectionState, FailureReason } from '../domain/event'
import { backoffDelay, DEFAULT_BACKOFF, type BackoffOptions } from './backoff'
import { Observable, type ReadonlyObservable } from './Observable'
import { silentLogger, type Logger, type StreamTransport, type TransportCloseReason, type TransportConnection } from './ports'

export interface ConnectionSnapshot {
  readonly state: ConnectionState
  /** Current retry number (0 while healthy). */
  readonly attempt: number
  readonly maxAttempts: number
  /** When the next reconnect attempt fires (epoch ms), while reconnecting. */
  readonly nextRetryAt: number | null
  readonly lastFailure: FailureReason | null
  readonly connectedAt: number | null
}

export interface ConnectionManagerOptions {
  readonly transport: StreamTransport
  readonly onMessage: (data: unknown) => void
  readonly backoff?: BackoffOptions
  /** Consecutive failed attempts before giving up and showing an error with a manual retry. */
  readonly maxAttempts?: number
  /** A connection must stay up this long before the retry counter resets (stops flapping from hiding behind fast retries). */
  readonly stableAfterMs?: number
  /** An attempt that has not opened within this time is abandoned. */
  readonly connectTimeoutMs?: number
  /** A live connection with no messages for this long is treated as dead. */
  readonly staleAfterMs?: number
  readonly logger?: Logger
  readonly now?: () => number
  readonly random?: () => number
}

const FATAL: ReadonlySet<FailureReason> = new Set(['auth', 'protocol'])

/**
 * Owns the connection lifecycle as an explicit state machine:
 *
 *   idle → connecting → live ⇄ reconnecting → error
 *
 * It handles reconnection with exponential backoff, connect timeouts, and
 * stalled connections, and it ignores late callbacks from superseded
 * connections. It knows nothing about message contents.
 */
export class ConnectionManager {
  readonly #opts: Required<Omit<ConnectionManagerOptions, 'transport' | 'onMessage'>> &
    Pick<ConnectionManagerOptions, 'transport' | 'onMessage'>
  readonly #state: Observable<ConnectionSnapshot>

  #connection: TransportConnection | null = null
  /** Incremented per attempt; callbacks from older generations are ignored. */
  #generation = 0
  #attempt = 0
  #lastMessageAt = 0
  #retryTimer: ReturnType<typeof setTimeout> | undefined
  #connectTimer: ReturnType<typeof setTimeout> | undefined
  #stableTimer: ReturnType<typeof setTimeout> | undefined
  #watchdog: ReturnType<typeof setInterval> | undefined

  constructor(options: ConnectionManagerOptions) {
    this.#opts = {
      backoff: DEFAULT_BACKOFF,
      maxAttempts: 8,
      stableAfterMs: 5_000,
      connectTimeoutMs: 8_000,
      staleAfterMs: 10_000,
      logger: silentLogger,
      now: Date.now,
      random: Math.random,
      ...options,
    }
    this.#state = new Observable<ConnectionSnapshot>({
      state: 'idle',
      attempt: 0,
      maxAttempts: this.#opts.maxAttempts,
      nextRetryAt: null,
      lastFailure: null,
      connectedAt: null,
    })
  }

  get state(): ReadonlyObservable<ConnectionSnapshot> {
    return this.#state
  }

  start(): void {
    const { state } = this.#state.get()
    if (state !== 'idle' && state !== 'error') return
    this.#attempt = 0
    this.#connect()
  }

  stop(): void {
    this.#teardown()
    this.#attempt = 0
    this.#update({ state: 'idle', attempt: 0, nextRetryAt: null, connectedAt: null })
  }

  /** Skips the remaining backoff (or recovers from the error state) and connects now. */
  retryNow(): void {
    const { state } = this.#state.get()
    if (state === 'live' || state === 'connecting' || state === 'idle') return
    if (state === 'error') this.#attempt = 0
    this.#teardown()
    this.#connect()
  }

  /** Drops the current connection as if the network failed. Used for resilience testing. */
  simulateDrop(): void {
    if (this.#connection) this.#fail('manual')
  }

  #connect(): void {
    this.#teardown()
    const generation = ++this.#generation
    const isCurrent = () => generation === this.#generation

    this.#update({ state: this.#attempt === 0 ? 'connecting' : 'reconnecting', nextRetryAt: null })
    this.#opts.logger.debug('connection.attempt')

    this.#connectTimer = setTimeout(() => {
      if (isCurrent()) this.#fail('timeout')
    }, this.#opts.connectTimeoutMs)

    this.#connection = this.#opts.transport.open({
      onOpen: () => {
        if (isCurrent()) this.#handleOpen()
      },
      onMessage: (data) => {
        if (!isCurrent()) return
        this.#lastMessageAt = this.#opts.now()
        this.#opts.onMessage(data)
      },
      onClose: (reason: TransportCloseReason) => {
        if (!isCurrent()) return
        this.#connection = null // already closed by the peer
        this.#fail(reason)
      },
    })
  }

  #handleOpen(): void {
    clearTimeout(this.#connectTimer)
    const now = this.#opts.now()
    this.#lastMessageAt = now
    this.#update({ state: 'live', nextRetryAt: null, connectedAt: now })
    this.#opts.logger.debug('connection.live')

    // Only a connection that stays up resets the retry budget.
    this.#stableTimer = setTimeout(() => {
      this.#attempt = 0
      this.#update({ attempt: 0, lastFailure: null })
    }, this.#opts.stableAfterMs)

    this.#watchdog = setInterval(() => {
      if (this.#opts.now() - this.#lastMessageAt > this.#opts.staleAfterMs) this.#fail('stale')
    }, Math.min(1_000, this.#opts.staleAfterMs))
  }

  #fail(reason: FailureReason): void {
    this.#teardown()
    this.#opts.logger.warn(`connection.failed.${reason}`)

    if (FATAL.has(reason)) {
      this.#update({ state: 'error', lastFailure: reason, nextRetryAt: null, connectedAt: null })
      return
    }

    this.#attempt++
    if (this.#attempt > this.#opts.maxAttempts) {
      this.#update({ state: 'error', lastFailure: reason, nextRetryAt: null, connectedAt: null })
      return
    }

    const delay = backoffDelay(this.#attempt, this.#opts.backoff, this.#opts.random)
    this.#update({
      state: 'reconnecting',
      attempt: this.#attempt,
      lastFailure: reason,
      nextRetryAt: this.#opts.now() + delay,
      connectedAt: null,
    })
    this.#retryTimer = setTimeout(() => this.#connect(), delay)
  }

  /** Cancels timers and closes the active connection; invalidates its callbacks. */
  #teardown(): void {
    this.#generation++
    clearTimeout(this.#retryTimer)
    clearTimeout(this.#connectTimer)
    clearTimeout(this.#stableTimer)
    clearInterval(this.#watchdog)
    const connection = this.#connection
    this.#connection = null
    connection?.close()
  }

  #update(patch: Partial<ConnectionSnapshot>): void {
    this.#state.set({ ...this.#state.get(), attempt: this.#attempt, ...patch })
  }
}
