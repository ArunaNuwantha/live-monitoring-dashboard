import { SEVERITY_COUNT } from '../domain/event'
import type { TimeSeriesSnapshot } from '../domain/metrics'

/**
 * Per-second, per-severity aggregates in a fixed ring of typed arrays.
 *
 * KPIs and charts read these instead of re-scanning raw events, so their cost
 * is O(window seconds) regardless of how many events arrived. Memory is
 * constant: `seconds × severities × 3` doubles.
 */
export class TimeBuckets {
  readonly seconds: number
  readonly #stamp: Float64Array
  readonly #count: Float64Array
  readonly #latencySum: Float64Array
  readonly #latencyMax: Float64Array

  constructor(seconds: number) {
    this.seconds = seconds
    this.#stamp = new Float64Array(seconds).fill(-1)
    this.#count = new Float64Array(seconds * SEVERITY_COUNT)
    this.#latencySum = new Float64Array(seconds * SEVERITY_COUNT)
    this.#latencyMax = new Float64Array(seconds * SEVERITY_COUNT)
  }

  record(second: number, severity: number, latencyMs: number): void {
    const slot = second % this.seconds
    if (this.#stamp[slot] !== second) {
      this.#stamp[slot] = second
      const base = slot * SEVERITY_COUNT
      this.#count.fill(0, base, base + SEVERITY_COUNT)
      this.#latencySum.fill(0, base, base + SEVERITY_COUNT)
      this.#latencyMax.fill(0, base, base + SEVERITY_COUNT)
    }
    const at = slot * SEVERITY_COUNT + severity
    this.#count[at] += 1
    this.#latencySum[at] += latencyMs
    if (latencyMs > this.#latencyMax[at]) this.#latencyMax[at] = latencyMs
  }

  /** Immutable, time-aligned copy ending at `nowSecond`; missing seconds are zero. */
  snapshot(nowSecond: number): TimeSeriesSnapshot {
    const length = this.seconds
    const count = new Float64Array(length * SEVERITY_COUNT)
    const latencySum = new Float64Array(length * SEVERITY_COUNT)
    const latencyMax = new Float64Array(length * SEVERITY_COUNT)

    for (let i = 0; i < length; i++) {
      const second = nowSecond - (length - 1 - i)
      const slot = ((second % length) + length) % length
      if (this.#stamp[slot] !== second) continue
      const from = slot * SEVERITY_COUNT
      const to = i * SEVERITY_COUNT
      count.set(this.#count.subarray(from, from + SEVERITY_COUNT), to)
      latencySum.set(this.#latencySum.subarray(from, from + SEVERITY_COUNT), to)
      latencyMax.set(this.#latencyMax.subarray(from, from + SEVERITY_COUNT), to)
    }

    return { endSecond: nowSecond, length, count, latencySum, latencyMax }
  }

  clear(): void {
    this.#stamp.fill(-1)
  }
}
