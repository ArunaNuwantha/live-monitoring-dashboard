import { SEVERITIES, SEVERITY_COUNT, type MonitorEvent, type Severity } from './event'

/**
 * Pure derivations over the live data: KPIs, chart series and list filtering.
 * Inputs are immutable snapshots, so every function here is safe to memoise.
 */

/**
 * Per-second aggregates in columnar form, oldest second first.
 * Index `i * SEVERITY_COUNT + s` holds second `i`, severity `s`.
 * The last second is still in progress.
 */
export interface TimeSeriesSnapshot {
  /** Epoch second of the last (in-progress) slot. */
  readonly endSecond: number
  /** Number of seconds covered. */
  readonly length: number
  readonly count: Float64Array
  readonly latencySum: Float64Array
  readonly latencyMax: Float64Array
}

/** One flag per entry of SEVERITIES; built once per filter change. */
export type SeverityMask = readonly boolean[]

export const toSeverityMask = (selected: ReadonlySet<Severity>): SeverityMask =>
  SEVERITIES.map((severity) => selected.has(severity))

/** Throughput is measured over the most recent complete seconds, so it reacts quickly. */
export const RATE_SAMPLE_SECONDS = 10

export interface WindowSummary {
  readonly count: number
  readonly bySeverity: Readonly<Record<Severity, number>>
  readonly ratePerSecond: number
  readonly avgLatencyMs: number | null
  readonly maxLatencyMs: number | null
  /** Share of error + critical events, 0..1; null when there are no events. */
  readonly errorRate: number | null
}

export function summarizeWindow(
  series: TimeSeriesSnapshot,
  windowSeconds: number,
  mask: SeverityMask,
): WindowSummary {
  const perSeverity = new Array<number>(SEVERITY_COUNT).fill(0)
  const start = Math.max(0, series.length - windowSeconds)
  const rateStart = Math.max(start, series.length - 1 - RATE_SAMPLE_SECONDS)
  let latencySum = 0
  let latencyMax = 0
  let rateCount = 0

  for (let i = start; i < series.length; i++) {
    const inRateSample = i >= rateStart && i < series.length - 1
    for (let s = 0; s < SEVERITY_COUNT; s++) {
      if (!mask[s]) continue
      const at = i * SEVERITY_COUNT + s
      const n = series.count[at]
      if (n === 0) continue
      perSeverity[s] += n
      latencySum += series.latencySum[at]
      if (series.latencyMax[at] > latencyMax) latencyMax = series.latencyMax[at]
      if (inRateSample) rateCount += n
    }
  }

  const count = perSeverity.reduce((a, b) => a + b, 0)
  const errors = perSeverity[SEVERITIES.indexOf('error')] + perSeverity[SEVERITIES.indexOf('critical')]
  const rateSeconds = Math.max(1, series.length - 1 - rateStart)

  return {
    count,
    bySeverity: Object.fromEntries(SEVERITIES.map((s, i) => [s, perSeverity[i]])) as Record<Severity, number>,
    ratePerSecond: rateCount / rateSeconds,
    avgLatencyMs: count > 0 ? latencySum / count : null,
    maxLatencyMs: count > 0 ? latencyMax : null,
    errorRate: count > 0 ? errors / count : null,
  }
}

/** uPlot-compatible aligned data: [x (epoch seconds), y]. */
export type ChartSeries = [xs: number[], ys: (number | null)[]]

export interface ChartData {
  readonly throughput: ChartSeries
  readonly latency: ChartSeries
}

/** Builds per-second chart series over complete seconds only (no partial-second dip). */
export function buildChartData(series: TimeSeriesSnapshot, windowSeconds: number, mask: SeverityMask): ChartData {
  const last = series.length - 2
  const first = Math.max(0, last - windowSeconds + 1)
  const size = Math.max(0, last - first + 1)
  const xs = new Array<number>(size)
  const rate = new Array<number>(size)
  const latency = new Array<number | null>(size)

  for (let i = first, k = 0; i <= last; i++, k++) {
    let n = 0
    let sum = 0
    for (let s = 0; s < SEVERITY_COUNT; s++) {
      if (!mask[s]) continue
      n += series.count[i * SEVERITY_COUNT + s]
      sum += series.latencySum[i * SEVERITY_COUNT + s]
    }
    xs[k] = series.endSecond - (series.length - 1 - i)
    rate[k] = n
    // A gap (null) is more honest than plotting 0 ms latency for an empty second.
    latency[k] = n > 0 ? Math.round(sum / n) : null
  }

  return { throughput: [xs, rate], latency: [xs, latency] }
}

export interface EventFilter {
  /** Only events received at or after this time (epoch ms). */
  readonly since: number
  readonly mask: SeverityMask
  /** Already lower-cased; empty string disables text search. */
  readonly query: string
}

const SEVERITY_ORDER: Readonly<Record<Severity, number>> = { info: 0, warning: 1, error: 2, critical: 3 }

/**
 * Filters a newest-first event list. Because the list is ordered by receive
 * time, the scan stops at the first event older than the window.
 */
export function filterEvents(events: readonly MonitorEvent[], filter: EventFilter): MonitorEvent[] {
  const out: MonitorEvent[] = []
  for (const event of events) {
    if (event.receivedAt < filter.since) break
    if (!filter.mask[SEVERITY_ORDER[event.severity]]) continue
    if (
      filter.query !== '' &&
      !event.message.toLowerCase().includes(filter.query) &&
      !event.service.includes(filter.query)
    ) {
      continue
    }
    out.push(event)
  }
  return out
}

/** Finds `seq` in a list sorted by descending seq. Returns -1 when absent. */
export function indexOfSeq(events: readonly MonitorEvent[], seq: number): number {
  let lo = 0
  let hi = events.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const value = events[mid].seq
    if (value === seq) return mid
    if (value > seq) lo = mid + 1
    else hi = mid - 1
  }
  return -1
}
