import { memo, useMemo } from 'react'
import type { Severity } from '../../domain/event'
import { buildChartData, toSeverityMask } from '../../domain/metrics'
import { formatWindow } from '../format/format'
import { useFeedData } from '../hooks/useFeedData'
import { FeedGate } from './FeedGate'
import { LiveChart } from './LiveChart'

interface LiveChartsProps {
  readonly windowSeconds: number
  readonly severities: ReadonlySet<Severity>
}

/**
 * Throughput and latency as two small multiples with a shared crosshair.
 * Their scales differ by orders of magnitude, so they get separate charts
 * rather than a misleading dual axis.
 */
export const LiveCharts = memo(function LiveCharts({ windowSeconds, severities }: LiveChartsProps) {
  return (
    <section className="card panel" aria-labelledby="charts-title">
      <header className="panel__header">
        <h2 id="charts-title" className="panel__title">
          Live metrics
        </h2>
        <span className="panel__meta">per second · last {formatWindow(windowSeconds)}</span>
      </header>
      <FeedGate>
        <ChartPair windowSeconds={windowSeconds} severities={severities} />
      </FeedGate>
    </section>
  )
})

function ChartPair({ windowSeconds, severities }: LiveChartsProps) {
  const series = useFeedData((s) => s.series)
  const mask = useMemo(() => toSeverityMask(severities), [severities])
  const data = useMemo(() => buildChartData(series, windowSeconds, mask), [series, windowSeconds, mask])

  return (
    <div className="panel__body charts">
      <LiveChart
        title="Throughput"
        unit="events/s"
        data={data.throughput}
        colorToken="--series-1"
        syncKey="live-metrics"
        description={`Events per second over the last ${formatWindow(windowSeconds)}`}
      />
      <LiveChart
        title="Average latency"
        unit="ms"
        data={data.latency}
        colorToken="--series-2"
        syncKey="live-metrics"
        description={`Average latency in milliseconds over the last ${formatWindow(windowSeconds)}`}
      />
    </div>
  )
}
