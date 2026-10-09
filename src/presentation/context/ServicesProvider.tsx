import { useEffect, type ReactNode } from 'react'
import type { Services } from '../../infrastructure/createServices'
import { ServicesContext } from './ServicesContext'

interface ServicesProviderProps {
  readonly services: Services
  readonly children: ReactNode
}

/** Provides services and owns the feed lifecycle (start on mount, stop on unmount). */
export function ServicesProvider({ services, children }: ServicesProviderProps) {
  const { feed } = services

  useEffect(() => {
    feed.start()
    // The browser knows when the network returns, so retry then instead of waiting out the backoff.
    const onOnline = () => feed.retryNow()
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
      feed.stop()
    }
  }, [feed])

  return <ServicesContext value={services}>{children}</ServicesContext>
}
