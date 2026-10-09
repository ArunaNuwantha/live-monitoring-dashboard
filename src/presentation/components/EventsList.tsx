import { memo, useDeferredValue, useLayoutEffect, useMemo, useRef } from 'react'
import type { MonitorEvent, Severity } from '../../domain/event'
import { filterEvents, indexOfSeq, toSeverityMask } from '../../domain/metrics'
import { formatClockMs, formatInteger, formatWindow } from '../format/format'
import { useFeedData } from '../hooks/useFeedData'
import { useVirtualRows } from '../hooks/useVirtualRows'
import { EmptyState } from './EmptyState'
import { FeedGate } from './FeedGate'
import { ArrowUpIcon } from './Icons'
import { SeverityBadge } from './SeverityBadge'

const ROW_HEIGHT = 56

interface EventsListProps {
  readonly windowSeconds: number
  readonly severities: ReadonlySet<Severity>
  readonly query: string
  readonly onResetFilters: () => void
}

export const EventsList = memo(function EventsList(props: EventsListProps) {
  return (
    <section className="card panel panel--events" aria-labelledby="events-title">
      <FeedGate>
        <EventsBody {...props} />
      </FeedGate>
    </section>
  )
})

function EventsBody({ windowSeconds, severities, query, onResetFilters }: EventsListProps) {
  const events = useFeedData((s) => s.events)
  const publishedAt = useFeedData((s) => s.publishedAt)
  // Typing stays responsive: filtering with the new query runs as a lower-priority render.
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const mask = useMemo(() => toSeverityMask(severities), [severities])

  const visible = useMemo(
    () => filterEvents(events, { since: publishedAt - windowSeconds * 1000, mask, query: deferredQuery }),
    [events, publishedAt, windowSeconds, mask, deferredQuery],
  )

  const { ref, element, start, end, totalHeight, scrollTop, onScroll, scrollTo } = useVirtualRows(visible.length, ROW_HEIGHT)

  // Scroll anchoring: new events are prepended, so a reader scrolled into the
  // list would see rows slide away. Keep the row they were looking at in place.
  const previousRef = useRef<readonly MonitorEvent[]>(visible)
  useLayoutEffect(() => {
    const previous = previousRef.current
    previousRef.current = visible
    if (!element || previous === visible || element.scrollTop <= 0) return
    const topIndex = Math.floor(element.scrollTop / ROW_HEIGHT)
    const anchor = previous[topIndex]
    if (!anchor) return
    const newIndex = indexOfSeq(visible, anchor.seq)
    if (newIndex >= 0 && newIndex !== topIndex) scrollTo(element.scrollTop + (newIndex - topIndex) * ROW_HEIGHT)
  }, [visible, element, scrollTo])

  const newerAbove = Math.floor(scrollTop / ROW_HEIGHT)
  const rows = visible.slice(start, end)

  return (
    <>
      <header className="panel__header">
        <h2 id="events-title" className="panel__title">
          Recent events
        </h2>
        <span className="panel__meta">
          {formatInteger(visible.length)} in last {formatWindow(windowSeconds)}
        </span>
      </header>

      {visible.length === 0 ? (
        <EmptyState
          title="No matching events"
          description={
            severities.size === 0
              ? 'All severities are hidden. Select at least one severity.'
              : 'Nothing in this time window matches the current filters.'
          }
          action={
            <button type="button" className="btn btn--secondary btn--sm" onClick={onResetFilters}>
              Reset filters
            </button>
          }
        />
      ) : (
        <div className="events">
          {newerAbove > 0 && (
            <button type="button" className="events__jump btn btn--primary btn--sm" onClick={() => scrollTo(0)}>
              <ArrowUpIcon /> {formatInteger(newerAbove)} newer
            </button>
          )}
          <div
            ref={ref}
            className="events__viewport"
            onScroll={onScroll}
            tabIndex={0}
            aria-label="Recent events, newest first"
          >
            <ol className="events__list" style={{ height: totalHeight, paddingTop: start * ROW_HEIGHT }}>
              {rows.map((event) => (
                <EventRow key={event.seq} event={event} />
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * One event. All stream-derived strings are rendered as React text children
 * (auto-escaped), never as HTML. The `title` attribute is escaped too.
 */
const EventRow = memo(function EventRow({ event }: { event: MonitorEvent }) {
  return (
    <li className={`event event--${event.severity}`} style={{ height: ROW_HEIGHT }}>
      <div className="event__meta">
        <SeverityBadge severity={event.severity} />
        <span className="event__service">{event.service}</span>
        <span className="event__latency">{formatInteger(event.latencyMs)} ms</span>
        <time className="event__time" dateTime={new Date(event.timestamp).toISOString()}>
          {formatClockMs(event.timestamp)}
        </time>
      </div>
      <p className="event__message" title={event.message}>
        {event.message}
      </p>
    </li>
  )
})
