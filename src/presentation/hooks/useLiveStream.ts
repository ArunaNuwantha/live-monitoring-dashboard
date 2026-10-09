import { useMemo } from 'react'
import type { ConnectionSnapshot } from '../../application/ConnectionManager'
import { deriveFeedStatus, type FeedStatus } from '../../domain/event'
import { useServices } from './useServices'
import { useStore } from './useStore'

export interface LiveStreamControls {
  readonly pause: () => void
  readonly resume: () => void
  readonly togglePause: () => void
  readonly retry: () => void
  readonly simulateDrop: () => void
}

export interface LiveStream extends LiveStreamControls {
  readonly status: FeedStatus
  readonly connection: ConnectionSnapshot
  readonly paused: boolean
}

/**
 * Connection state and feed controls. Changes only on state transitions,
 * so consumers re-render rarely even at thousands of messages per second.
 */
export function useLiveStream(): LiveStream {
  const { feed } = useServices()
  const connection = useStore(feed.connection)
  const paused = useStore(feed.control, (c) => c.paused)

  const controls = useMemo<LiveStreamControls>(
    () => ({
      pause: () => feed.pause(),
      resume: () => feed.resume(),
      togglePause: () => feed.togglePause(),
      retry: () => feed.retryNow(),
      simulateDrop: () => feed.simulateDrop(),
    }),
    [feed],
  )

  return { ...controls, connection, paused, status: deriveFeedStatus(connection.state, paused) }
}
