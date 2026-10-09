import { memo } from 'react'
import type { FeedStatus } from '../../domain/event'
import { formatDuration, formatInteger } from '../format/format'
import { FAILURE_TEXT, STATUS_LABEL } from '../format/labels'
import { useCountdown } from '../hooks/useCountdown'
import { useFeedHealth } from '../hooks/useFeedData'
import { useLiveStream } from '../hooks/useLiveStream'
import { PauseIcon, PlayIcon, RetryIcon } from './Icons'

/**
 * Connection indicator and feed controls.
 * Re-renders only on connection transitions or pause/resume; the ticking
 * parts (message age, retry countdown, backlog) are isolated leaf components.
 */
export const ConnectionBar = memo(function ConnectionBar() {
  const { status, connection, paused, togglePause, retry } = useLiveStream()
  const canRetry = status === 'reconnecting' || status === 'error'
  const failure = connection.lastFailure ? FAILURE_TEXT[connection.lastFailure] : null

  return (
    <div className="connection">
      <div className="connection__status">
        <StatusPill status={status} />
        <p className="connection__detail">
          {status === 'connecting' && 'Opening live feed…'}
          {status === 'live' && <MessageAge />}
          {status === 'paused' && <PausedBacklog />}
          {status === 'reconnecting' && (
            <>
              {failure ?? 'Reconnecting'} · <RetryCountdown target={connection.nextRetryAt} /> · attempt{' '}
              {connection.attempt}/{connection.maxAttempts}
            </>
          )}
          {status === 'error' && `${failure ?? 'Unable to connect'}. Automatic retries stopped.`}
        </p>
      </div>

      <div className="connection__actions">
        {canRetry && (
          <button type="button" className="btn btn--ghost" onClick={retry}>
            <RetryIcon /> {status === 'error' ? 'Retry' : 'Retry now'}
          </button>
        )}
        <button
          type="button"
          className={`btn ${paused ? 'btn--primary' : 'btn--secondary'}`}
          onClick={togglePause}
          aria-pressed={paused}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>
    </div>
  )
})

const StatusPill = memo(function StatusPill({ status }: { status: FeedStatus }) {
  return (
    // Announce transitions only, not the high-frequency text around it.
    <span className={`pill pill--${status}`} role="status" aria-live="polite">
      <span className="pill__dot" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  )
})

function MessageAge() {
  const ageSeconds = useFeedHealth((h) => (h.lastMessageAt === null ? null : Math.floor((h.now - h.lastMessageAt) / 1000)))
  if (ageSeconds === null) return <>Connected · waiting for data</>
  return <>Streaming · last event {ageSeconds < 1 ? 'just now' : `${formatDuration(ageSeconds * 1000)} ago`}</>
}

function PausedBacklog() {
  const backlog = useFeedHealth((h) => h.backlog)
  return <>View frozen · {formatInteger(backlog)} new events buffered</>
}

function RetryCountdown({ target }: { target: number | null }) {
  const seconds = useCountdown(target)
  return <>{seconds > 0 ? `retrying in ${seconds}s` : 'retrying…'}</>
}
