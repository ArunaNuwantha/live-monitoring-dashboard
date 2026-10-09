import type { FeedSnapshot, HealthSnapshot } from '../../application/LiveFeed'
import { useServices } from './useServices'
import { useStore } from './useStore'

/** Selects from the batched dashboard snapshot (frozen while paused). */
export function useFeedData<S>(selector: (snapshot: FeedSnapshot) => S): S {
  return useStore(useServices().feed.data, selector)
}

/** Selects from pipeline health (keeps updating while paused). */
export function useFeedHealth<S>(selector: (snapshot: HealthSnapshot) => S): S {
  return useStore(useServices().feed.health, selector)
}
