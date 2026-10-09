import { MAX_WINDOW_SECONDS, severityIndex, type MonitorEvent } from '../domain/event'
import type { TimeSeriesSnapshot } from '../domain/metrics'
import { parseMessage } from '../domain/validate'
import { RingBuffer } from './RingBuffer'
import { TimeBuckets } from './TimeBuckets'

export interface IngestCounters {
  /** Frames seen on the wire. */
  readonly received: number
  /** Frames that passed validation. */
  readonly accepted: number
  /** Frames that failed validation (malformed, oversized, wrong shape). */
  readonly rejected: number
  /** Frames dropped unparsed because the per-second ingest budget was exhausted. */
  readonly shed: number
  /** Events pushed out of the bounded buffer by newer ones. */
  readonly evicted: number
}

/**
 * Hot path for every incoming frame: rate-limit → validate → store.
 *
 * Every step is O(1) and allocation-light. Nothing here notifies the UI: the
 * pipeline only marks itself dirty (via `version`), and LiveFeed decides when
 * to publish.
 */
export class IngestPipeline {
  readonly #events: RingBuffer<MonitorEvent>
  readonly #buckets = new TimeBuckets(MAX_WINDOW_SECONDS + 1)
  readonly #maxPerSecond: number
  #budgetSecond = -1
  #budgetUsed = 0
  #seq = 0
  #counters = { received: 0, accepted: 0, rejected: 0, shed: 0, evicted: 0 }
  #lastMessageAt: number | null = null

  /** Bumped on every accepted event; cheap dirty-check for publishers. */
  version = 0

  constructor(capacity: number, maxPerSecond: number) {
    this.#events = new RingBuffer(capacity)
    this.#maxPerSecond = maxPerSecond
  }

  ingest(raw: unknown, now: number): void {
    this.#counters.received++
    this.#lastMessageAt = now

    // Load shedding: under a flood, drop excess frames before paying for JSON.parse.
    const second = Math.floor(now / 1000)
    if (second !== this.#budgetSecond) {
      this.#budgetSecond = second
      this.#budgetUsed = 0
    }
    if (++this.#budgetUsed > this.#maxPerSecond) {
      this.#counters.shed++
      return
    }

    const result = parseMessage(raw, now)
    if (!result.ok) {
      this.#counters.rejected++
      return
    }

    const event: MonitorEvent = { ...result.value, seq: ++this.#seq, receivedAt: now }
    if (this.#events.push(event)) this.#counters.evicted++
    this.#buckets.record(second, severityIndex(event.severity), event.latencyMs)
    this.#counters.accepted++
    this.version++
  }

  get counters(): IngestCounters {
    return { ...this.#counters }
  }

  get lastMessageAt(): number | null {
    return this.#lastMessageAt
  }

  get bufferSize(): number {
    return this.#events.size
  }

  get bufferCapacity(): number {
    return this.#events.capacity
  }

  setCapacity(capacity: number): void {
    this.#events.resize(capacity)
    this.version++
  }

  eventsNewestFirst(): MonitorEvent[] {
    return this.#events.toArrayNewestFirst()
  }

  series(now: number): TimeSeriesSnapshot {
    return this.#buckets.snapshot(Math.floor(now / 1000))
  }
}
