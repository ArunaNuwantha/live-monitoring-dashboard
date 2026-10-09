import { useSyncExternalStore } from 'react'
import type { ReadonlyObservable } from '../../application/Observable'

/**
 * Subscribes to a slice of an external store. The component re-renders only when
 * the selected value changes (Object.is), not on every publish.
 *
 * The selector must return a primitive or a reference that already exists in the
 * store value. A selector that builds a new object would re-render forever.
 */
export function useStore<T, S = T>(store: ReadonlyObservable<T>, selector: (value: T) => S = identity as (value: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()))
}

const identity = <T,>(value: T): T => value
