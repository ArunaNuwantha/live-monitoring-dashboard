/**
 * Hot-path timings. Run: npm run bench
 * Results are recorded in README.md → "Performance notes".
 * (Not part of `npm test`; timings are machine-dependent, so nothing is asserted.)
 */
import { it } from 'vitest'
import { IngestPipeline } from '../application/IngestPipeline'
import { SEVERITIES } from '../domain/event'
import { buildChartData, filterEvents, summarizeWindow, toSeverityMask } from '../domain/metrics'

const now = Date.now()
const frames = Array.from({ length: 100_000 }, (_, i) =>
  JSON.stringify({
    id: `e${i}`,
    ts: now,
    service: 'payments',
    severity: SEVERITIES[i % 4],
    latencyMs: 40 + (i % 200),
    message: `Request ${i} completed`,
  }),
)
const mask = toSeverityMask(new Set(SEVERITIES))

function measure(fn: () => void, runs: number): number {
  for (let i = 0; i < Math.min(runs, 20); i++) fn() // warm-up / JIT
  const t0 = performance.now()
  for (let i = 0; i < runs; i++) fn()
  return (performance.now() - t0) / runs
}

function filled(capacity: number) {
  const p = new IngestPipeline(capacity, Number.MAX_SAFE_INTEGER)
  for (let i = 0; i < capacity; i++) p.ingest(frames[i % frames.length], now)
  return p
}

it('pipeline timings', () => {
  const rows: Record<string, string> = {}

  const ingestMs = measure(() => {
    const p = new IngestPipeline(5_000, Number.MAX_SAFE_INTEGER)
    for (const f of frames) p.ingest(f, now)
  }, 5)
  rows['ingest 100k frames (parse+validate+store)'] = `${ingestMs.toFixed(1)} ms  →  ${((ingestMs * 1000) / frames.length).toFixed(2)} µs/frame, ~${Math.round(frames.length / (ingestMs / 1000)).toLocaleString('en-US')} frames/s`

  const p5k = filled(5_000)
  const p50k = filled(50_000)
  const series = p5k.series(now)
  const events = p5k.eventsNewestFirst()

  rows['publish: copy 5k-event buffer'] = `${measure(() => p5k.eventsNewestFirst(), 500).toFixed(3)} ms`
  rows['publish: copy 50k-event buffer'] = `${measure(() => p50k.eventsNewestFirst(), 100).toFixed(3)} ms`
  rows['publish: time-bucket snapshot (901 s × 4)'] = `${measure(() => p5k.series(now), 500).toFixed(3)} ms`
  rows['derive: KPI summary, 15 min'] = `${measure(() => summarizeWindow(series, 900, mask), 500).toFixed(3)} ms`
  rows['derive: chart data, 15 min'] = `${measure(() => buildChartData(series, 900, mask), 500).toFixed(3)} ms`
  rows['derive: filter 5k events + text query'] = `${measure(() => filterEvents(events, { since: 0, mask, query: 'request 4' }), 500).toFixed(3)} ms`

  console.table(rows)
}, 120_000)
