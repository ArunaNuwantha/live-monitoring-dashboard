import type { MonitorEvent } from '../domain/event'
import type { TimeSeriesSnapshot } from '../domain/metrics'
import { ConnectionManager, type ConnectionManagerOptions, type ConnectionSnapshot } from './ConnectionManager'
import { IngestPipeline, type IngestCounters } from './IngestPipeline'
import { Observable, type ReadonlyObservable } from './Observable'
import type { StreamTransport } from './ports'

export interface LiveFeedSettings {
  /** Maximum number of raw events kept in memory. */
  readonly bufferCapacity: number
  /** How often (ms) batched updates are published to the UI. */
  readonly flushIntervalMs: number
}

export const SETTINGS_LIMITS = {
  bufferCapacity: { min: 100, max: 100_000 },
  flushIntervalMs: { min: 50, max: 5_000 },
} as const

export const DEFAULT_SETTINGS: LiveFeedSettings = { bufferCapacity: 5_000, flushIntervalMs: 250 }

/** Dashboard data. Frozen while paused; replaced as a whole on each publish. */
export interface FeedSnapshot {
  readonly version: number
  /** Epoch ms of this publish; the "now" every derived view uses (keeps render pure). */
  readonly publishedAt: number
  /** Newest first, bounded by `bufferCapacity`. */
  readonly events: readonly MonitorEvent[]
  readonly series: TimeSeriesSnapshot
  readonly totalAccepted: number
  /** False until the first event has been accepted. */
  readonly hasData: boolean
}

/** Pipeline health. Keeps updating while paused. Read only by small leaf widgets. */
export interface HealthSnapshot extends IngestCounters {
  readonly now: number
  readonly lastMessageAt: number | null
  readonly bufferSize: number
  readonly bufferCapacity: number
  /** Accepted events since pause (0 when not paused). */
  readonly backlog: number
  readonly ingestPerSecond: number
  readonly publishesPerSecond: number
}

export interface ControlSnapshot {
  readonly paused: boolean
  readonly pausedAt: number | null
  readonly settings: LiveFeedSettings
}

export interface LiveFeedOptions {
  readonly transport: StreamTransport
  readonly settings?: Partial<LiveFeedSettings>
  /** Hard ingest ceiling (frames per second) before load shedding kicks in. */
  readonly maxIngestPerSecond?: number
  readonly connection?: Omit<ConnectionManagerOptions, 'transport' | 'onMessage'>
  readonly now?: () => number
}

/** Even with no new data the snapshot is republished this often, so time windows keep sliding. */
const IDLE_REPUBLISH_MS = 1_000

const clamp = (value: number, { min, max }: { min: number; max: number }) =>
  Math.min(max, Math.max(min, Math.round(value)))

const sanitizeSettings = (settings: LiveFeedSettings): LiveFeedSettings => ({
  bufferCapacity: clamp(settings.bufferCapacity, SETTINGS_LIMITS.bufferCapacity),
  flushIntervalMs: clamp(settings.flushIntervalMs, SETTINGS_LIMITS.flushIntervalMs),
})

/**
 * Application facade: the only object the UI talks to.
 *
 * Messages are ingested synchronously into bounded structures, while the UI
 * gets an immutable snapshot at most once per `flushIntervalMs`. However
 * fast the source is, React sees a fixed, configurable update rate.
 */
export class LiveFeed {
  readonly #pipeline: IngestPipeline
  readonly #connection: ConnectionManager
  readonly #now: () => number
  readonly #data: Observable<FeedSnapshot>
  readonly #health: Observable<HealthSnapshot>
  readonly #control: Observable<ControlSnapshot>

  #flushTimer: ReturnType<typeof setInterval> | undefined
  #publishedVersion = -1
  #lastPublishAt = 0
  #acceptedAtPause = 0
  #rateSample = { at: 0, received: 0, publishes: 0 }
  #publishCount = 0
  #rates = { ingest: 0, publishes: 0 }

  constructor(options: LiveFeedOptions) {
    this.#now = options.now ?? Date.now
    const settings = sanitizeSettings({ ...DEFAULT_SETTINGS, ...options.settings })
    this.#pipeline = new IngestPipeline(settings.bufferCapacity, options.maxIngestPerSecond ?? 20_000)
    this.#connection = new ConnectionManager({
      ...options.connection,
      now: this.#now,
      transport: options.transport,
      onMessage: (data) => this.#pipeline.ingest(data, this.#now()),
    })

    const now = this.#now()
    this.#control = new Observable<ControlSnapshot>({ paused: false, pausedAt: null, settings })
    this.#data = new Observable(this.#buildSnapshot(now))
    this.#health = new Observable(this.#buildHealth(now))
    this.#publishedVersion = this.#pipeline.version
    this.#lastPublishAt = now
    this.#rateSample = { at: now, received: 0, publishes: 0 }
  }

  get data(): ReadonlyObservable<FeedSnapshot> {
    return this.#data
  }

  get health(): ReadonlyObservable<HealthSnapshot> {
    return this.#health
  }

  get control(): ReadonlyObservable<ControlSnapshot> {
    return this.#control
  }

  get connection(): ReadonlyObservable<ConnectionSnapshot> {
    return this.#connection.state
  }

  start(): void {
    this.#connection.start()
    this.#scheduleFlush()
  }

  stop(): void {
    clearInterval(this.#flushTimer)
    this.#flushTimer = undefined
    this.#connection.stop()
  }

  pause(): void {
    if (this.#control.get().paused) return
    this.#acceptedAtPause = this.#pipeline.counters.accepted
    this.#control.set({ ...this.#control.get(), paused: true, pausedAt: this.#now() })
  }

  resume(): void {
    if (!this.#control.get().paused) return
    this.#control.set({ ...this.#control.get(), paused: false, pausedAt: null })
    this.#flush(true) // catch up immediately rather than waiting for the next tick
  }

  togglePause(): void {
    if (this.#control.get().paused) this.resume()
    else this.pause()
  }

  retryNow(): void {
    this.#connection.retryNow()
  }

  simulateDrop(): void {
    this.#connection.simulateDrop()
  }

  updateSettings(patch: Partial<LiveFeedSettings>): void {
    const current = this.#control.get()
    const settings = sanitizeSettings({ ...current.settings, ...patch })
    if (settings.bufferCapacity !== current.settings.bufferCapacity) {
      this.#pipeline.setCapacity(settings.bufferCapacity)
    }
    this.#control.set({ ...current, settings })
    if (settings.flushIntervalMs !== current.settings.flushIntervalMs && this.#flushTimer !== undefined) {
      this.#scheduleFlush()
    }
    this.#flush(true)
  }

  #scheduleFlush(): void {
    clearInterval(this.#flushTimer)
    this.#flushTimer = setInterval(() => this.#flush(false), this.#control.get().settings.flushIntervalMs)
  }

  #flush(force: boolean): void {
    const now = this.#now()
    this.#sampleRates(now)
    this.#health.set(this.#buildHealth(now))

    if (this.#control.get().paused) return
    const dirty = this.#pipeline.version !== this.#publishedVersion
    if (!force && !dirty && now - this.#lastPublishAt < IDLE_REPUBLISH_MS) return

    this.#data.set(this.#buildSnapshot(now, dirty || force ? undefined : this.#data.get().events))
    this.#publishedVersion = this.#pipeline.version
    this.#lastPublishAt = now
    this.#publishCount++
  }

  #buildSnapshot(now: number, reuseEvents?: readonly MonitorEvent[]): FeedSnapshot {
    const totalAccepted = this.#pipeline.counters.accepted
    return {
      version: this.#pipeline.version,
      publishedAt: now,
      // Unchanged data keeps the same array reference, so list consumers can skip work.
      events: reuseEvents ?? this.#pipeline.eventsNewestFirst(),
      series: this.#pipeline.series(now),
      totalAccepted,
      hasData: totalAccepted > 0,
    }
  }

  #buildHealth(now: number): HealthSnapshot {
    const counters = this.#pipeline.counters
    return {
      ...counters,
      now,
      lastMessageAt: this.#pipeline.lastMessageAt,
      bufferSize: this.#pipeline.bufferSize,
      bufferCapacity: this.#pipeline.bufferCapacity,
      backlog: this.#control.get().paused ? counters.accepted - this.#acceptedAtPause : 0,
      ingestPerSecond: this.#rates.ingest,
      publishesPerSecond: this.#rates.publishes,
    }
  }

  #sampleRates(now: number): void {
    const elapsed = now - this.#rateSample.at
    if (elapsed < 1_000) return
    const received = this.#pipeline.counters.received
    this.#rates = {
      ingest: Math.round(((received - this.#rateSample.received) * 1000) / elapsed),
      publishes: Math.round(((this.#publishCount - this.#rateSample.publishes) * 1000) / elapsed),
    }
    this.#rateSample = { at: now, received, publishes: this.#publishCount }
  }
}
