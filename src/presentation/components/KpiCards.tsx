import { memo, useMemo } from 'react'
import { SEVERITIES, type Severity } from '../../domain/event'
import { summarizeWindow, toSeverityMask, RATE_SAMPLE_SECONDS } from '../../domain/metrics'
import { formatCompact, formatInteger, formatPercent, formatRate, formatWindow } from '../format/format'
import { SEVERITY_LABEL } from '../format/labels'
import { useFeedData } from '../hooks/useFeedData'
import { SeverityGlyph } from './Icons'
import { Skeleton } from './Loading'

interface KpiCardsProps {
  readonly windowSeconds: number
  readonly severities: ReadonlySet<Severity>
}

/**
 * KPI row derived from per-second buckets (O(window), independent of event volume).
 * Each card gets primitive props, so a card re-renders only when its displayed text changes.
 */
export const KpiCards = memo(function KpiCards({ windowSeconds, severities }: KpiCardsProps) {
  const series = useFeedData((s) => s.series)
  const total = useFeedData((s) => s.totalAccepted)
  const hasData = useFeedData((s) => s.hasData)
  const mask = useMemo(() => toSeverityMask(severities), [severities])
  const summary = useMemo(() => summarizeWindow(series, windowSeconds, mask), [series, windowSeconds, mask])

  const errors = summary.bySeverity.error + summary.bySeverity.critical
  const errorTone = summary.errorRate === null ? 'neutral' : summary.errorRate >= 0.1 ? 'critical' : summary.errorRate >= 0.05 ? 'warning' : 'good'

  return (
    <section className="kpis" aria-label="Key metrics">
      <KpiCard
        label="Events"
        value={formatInteger(summary.count)}
        caption={`last ${formatWindow(windowSeconds)}`}
        footnote={`${formatCompact(total)} received this session`}
        loading={!hasData}
      />
      <KpiCard
        label="Throughput"
        value={formatRate(summary.ratePerSecond)}
        unit="events/s"
        caption={`last ${RATE_SAMPLE_SECONDS} s`}
        loading={!hasData}
      />
      <KpiCard
        label="Avg latency"
        value={summary.avgLatencyMs === null ? '—' : formatInteger(summary.avgLatencyMs)}
        unit={summary.avgLatencyMs === null ? undefined : 'ms'}
        caption={`last ${formatWindow(windowSeconds)}`}
        footnote={summary.maxLatencyMs === null ? 'no samples' : `peak ${formatInteger(summary.maxLatencyMs)} ms`}
        loading={!hasData}
      />
      <KpiCard
        label="Error rate"
        value={summary.errorRate === null ? '—' : formatPercent(summary.errorRate)}
        caption="error + critical"
        footnote={`${formatInteger(errors)} events`}
        tone={errorTone}
        loading={!hasData}
      />
      <SeverityBreakdown
        info={summary.bySeverity.info}
        warning={summary.bySeverity.warning}
        error={summary.bySeverity.error}
        critical={summary.bySeverity.critical}
        loading={!hasData}
      />
    </section>
  )
})

type Tone = 'neutral' | 'good' | 'warning' | 'critical'
const TONE_LABEL: Record<Tone, string | null> = { neutral: null, good: 'Healthy', warning: 'Elevated', critical: 'High' }

interface KpiCardProps {
  readonly label: string
  readonly value: string
  readonly unit?: string
  readonly caption?: string
  readonly footnote?: string
  readonly tone?: Tone
  readonly loading?: boolean
}

const KpiCard = memo(function KpiCard({ label, value, unit, caption, footnote, tone = 'neutral', loading }: KpiCardProps) {
  const toneLabel = TONE_LABEL[tone]
  return (
    <article className="card kpi">
      <header className="kpi__header">
        <h2 className="kpi__label">{label}</h2>
        {caption && <span className="kpi__caption">{caption}</span>}
      </header>
      {loading ? (
        <Skeleton width="60%" height={34} />
      ) : (
        <p className="kpi__value">
          {value}
          {unit && <span className="kpi__unit">{unit}</span>}
        </p>
      )}
      <footer className="kpi__footer">
        {toneLabel && !loading && <span className={`tone tone--${tone}`}>{toneLabel}</span>}
        {footnote && !loading && <span>{footnote}</span>}
      </footer>
    </article>
  )
})

type SeverityCounts = Readonly<Record<Severity, number>>

const SeverityBreakdown = memo(function SeverityBreakdown({ loading, ...counts }: SeverityCounts & { loading: boolean }) {
  const total = SEVERITIES.reduce((sum, s) => sum + counts[s], 0)

  return (
    <article className="card kpi kpi--wide">
      <header className="kpi__header">
        <h2 className="kpi__label">By severity</h2>
        <span className="kpi__caption">share of events</span>
      </header>
      {loading ? (
        <Skeleton height={8} />
      ) : (
        <div className="meter" role="img" aria-label={SEVERITIES.map((s) => `${SEVERITY_LABEL[s]} ${counts[s]}`).join(', ')}>
          {total === 0 ? (
            <span className="meter__empty" />
          ) : (
            SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
              <span key={s} className={`meter__seg meter__seg--${s}`} style={{ flexGrow: counts[s] }} />
            ))
          )}
        </div>
      )}
      <ul className="legend">
        {SEVERITIES.map((s) => (
          <li key={s} className="legend__item">
            <span className={`legend__key legend__key--${s}`} aria-hidden="true">
              <SeverityGlyph severity={s} />
            </span>
            <span className="legend__label">{SEVERITY_LABEL[s]}</span>
            <span className="legend__value">{loading ? '—' : formatCompact(counts[s])}</span>
          </li>
        ))}
      </ul>
    </article>
  )
})
