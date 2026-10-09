import { memo } from 'react'
import { formatClock, formatInteger } from '../format/format'
import { useFeedHealth } from '../hooks/useFeedData'
import { useLiveStream } from '../hooks/useLiveStream'
import { useServices } from '../hooks/useServices'
import { useStore } from '../hooks/useStore'

/** Page-level notices for states that need the user's attention. */
export const StatusBanners = memo(function StatusBanners() {
  const { configWarning, feed } = useServices()
  const { status, retry, resume } = useLiveStream()
  const pausedAt = useStore(feed.control, (c) => c.pausedAt)

  return (
    <>
      {configWarning && (
        <div className="banner banner--warning" role="note">
          {configWarning}
        </div>
      )}
      {status === 'error' && (
        <div className="banner banner--critical" role="alert">
          <span>
            <strong>Live feed offline.</strong> The dashboard shows the last data received.
          </span>
          <button type="button" className="btn btn--secondary btn--sm" onClick={retry}>
            Try again
          </button>
        </div>
      )}
      {pausedAt !== null && (
        <div className="banner banner--info">
          <span>
            <strong>Paused at {formatClock(pausedAt)}.</strong> Data is still being collected: <Backlog /> new events.
          </span>
          <button type="button" className="btn btn--secondary btn--sm" onClick={resume}>
            Resume live
          </button>
        </div>
      )}
    </>
  )
})

function Backlog() {
  const backlog = useFeedHealth((h) => h.backlog)
  return <strong>{formatInteger(backlog)}</strong>
}
