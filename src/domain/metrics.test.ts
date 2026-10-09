import { describe, expect, it } from 'vitest'
import { TimeBuckets } from '../application/TimeBuckets'
import { SEVERITIES, severityIndex, type MonitorEvent, type Severity } from './event'
import { buildChartData, filterEvents, indexOfSeq, summarizeWindow, toSeverityMask } from './metrics'

const ALL = toSeverityMask(new Set(SEVERITIES))
const NOW_S = 1_700_000_000

function seriesWith(records: [secondsAgo: number, severity: Severity, latency: number][]) {
  const buckets = new TimeBuckets(901)
  for (const [ago, severity, latency] of records) buckets.record(NOW_S - ago, severityIndex(severity), latency)
  return buckets.snapshot(NOW_S)
}

describe('summarizeWindow', () => {
  it('counts, averages and computes error rate within the window only', () => {
    const series = seriesWith([
      [1, 'info', 100],
      [2, 'error', 300],
      [3, 'critical', 500],
      [120, 'info', 10_000], // outside a 60 s window
    ])
    const s = summarizeWindow(series, 60, ALL)
    expect(s.count).toBe(3)
    expect(s.avgLatencyMs).toBe(300)
    expect(s.maxLatencyMs).toBe(500)
    expect(s.errorRate).toBeCloseTo(2 / 3)
    expect(s.bySeverity).toEqual({ info: 1, warning: 0, error: 1, critical: 1 })
  })

  it('applies the severity filter', () => {
    const series = seriesWith([
      [1, 'info', 100],
      [1, 'error', 300],
    ])
    const s = summarizeWindow(series, 60, toSeverityMask(new Set<Severity>(['info'])))
    expect(s.count).toBe(1)
    expect(s.errorRate).toBe(0)
  })

  it('returns nulls, not NaN, for an empty window', () => {
    const s = summarizeWindow(seriesWith([]), 60, ALL)
    expect(s).toMatchObject({ count: 0, avgLatencyMs: null, maxLatencyMs: null, errorRate: null, ratePerSecond: 0 })
  })

  it('measures throughput over complete seconds, excluding the in-progress one', () => {
    const records: [number, Severity, number][] = []
    for (let ago = 1; ago <= 10; ago++) for (let i = 0; i < 5; i++) records.push([ago, 'info', 1])
    for (let i = 0; i < 100; i++) records.push([0, 'info', 1]) // current partial second
    expect(summarizeWindow(seriesWith(records), 60, ALL).ratePerSecond).toBe(5)
  })
})

describe('buildChartData', () => {
  it('produces aligned per-second points with gaps (null) for latency in empty seconds', () => {
    const { throughput, latency } = buildChartData(seriesWith([[2, 'info', 50]]), 5, ALL)
    expect(throughput[0]).toEqual([NOW_S - 5, NOW_S - 4, NOW_S - 3, NOW_S - 2, NOW_S - 1])
    expect(throughput[1]).toEqual([0, 0, 0, 1, 0])
    expect(latency[1]).toEqual([null, null, null, 50, null])
  })
})

describe('filterEvents', () => {
  const ev = (seq: number, receivedAt: number, severity: Severity, message = 'ok'): MonitorEvent => ({
    seq,
    receivedAt,
    severity,
    message,
    id: `e${seq}`,
    timestamp: receivedAt,
    service: 'auth',
    latencyMs: 1,
  })
  const events = [ev(4, 400, 'error', 'Database timeout'), ev(3, 300, 'info'), ev(2, 200, 'error'), ev(1, 100, 'info')]

  it('filters by window, severity and case-insensitive query', () => {
    expect(filterEvents(events, { since: 250, mask: ALL, query: '' }).map((e) => e.seq)).toEqual([4, 3])
    expect(filterEvents(events, { since: 0, mask: toSeverityMask(new Set(['error'])), query: '' }).map((e) => e.seq)).toEqual([4, 2])
    expect(filterEvents(events, { since: 0, mask: ALL, query: 'database' }).map((e) => e.seq)).toEqual([4])
  })

  it('finds a seq by binary search in a descending list', () => {
    expect(indexOfSeq(events, 2)).toBe(2)
    expect(indexOfSeq(events, 99)).toBe(-1)
  })
})
