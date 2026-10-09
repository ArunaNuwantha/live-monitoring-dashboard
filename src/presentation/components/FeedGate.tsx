import type { ReactNode } from 'react'
import { useFeedData } from '../hooks/useFeedData'
import { useServices } from '../hooks/useServices'
import { useStore } from '../hooks/useStore'
import { EmptyState } from './EmptyState'
import { Loading } from './Loading'

/**
 * Decides between loading, unavailable and content for a data panel before the
 * first event arrives. After that it always renders its children; disconnects
 * are shown by the connection bar, and the last data stays visible.
 */
export function FeedGate({ children }: { children: ReactNode }) {
  const { feed } = useServices()
  const hasData = useFeedData((s) => s.hasData)
  const state = useStore(feed.connection, (c) => c.state)

  if (hasData) return children
  if (state === 'error') {
    return <EmptyState title="Live feed unavailable" description="No data has been received yet. Use Retry in the status bar to try again." />
  }
  if (state === 'live') return <EmptyState title="Waiting for the first event" description="Connected. Data will appear as soon as it arrives." />
  return <Loading label={state === 'reconnecting' ? 'Reconnecting to live feed…' : 'Connecting to live feed…'} />
}
