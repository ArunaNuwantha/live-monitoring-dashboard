/**
 * Minimal external store compatible with React's `useSyncExternalStore`.
 * Values are treated as immutable: `set` notifies only when the reference changes.
 */
export interface ReadonlyObservable<T> {
  readonly get: () => T
  readonly subscribe: (listener: () => void) => () => void
}

export class Observable<T> implements ReadonlyObservable<T> {
  #value: T
  readonly #listeners = new Set<() => void>()

  constructor(initial: T) {
    this.#value = initial
  }

  readonly get = (): T => this.#value

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  set(next: T): void {
    if (Object.is(next, this.#value)) return
    this.#value = next
    this.#listeners.forEach((listener) => listener())
  }
}
