/**
 * Fixed-capacity circular buffer. `push` is O(1) and never allocates once full;
 * the oldest item is overwritten. This is what bounds memory under any input rate.
 */
export class RingBuffer<T> {
  #items: (T | undefined)[]
  #head = 0 // next write position
  #size = 0

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be a positive integer')
    this.#items = new Array<T | undefined>(capacity)
  }

  get capacity(): number {
    return this.#items.length
  }

  get size(): number {
    return this.#size
  }

  /** Appends an item; returns true when an old item was evicted to make room. */
  push(item: T): boolean {
    const evicted = this.#size === this.capacity
    this.#items[this.#head] = item
    this.#head = (this.#head + 1) % this.capacity
    if (!evicted) this.#size++
    return evicted
  }

  /** Copies items out newest first, optionally capped at `limit`. */
  toArrayNewestFirst(limit = this.#size): T[] {
    const count = Math.min(limit, this.#size)
    const out = new Array<T>(count)
    for (let i = 0; i < count; i++) {
      out[i] = this.#items[(this.#head - 1 - i + this.capacity) % this.capacity] as T
    }
    return out
  }

  /** Changes capacity, keeping the newest items that still fit. */
  resize(capacity: number): void {
    if (capacity === this.capacity) return
    const kept = this.toArrayNewestFirst(capacity).reverse()
    this.#items = new Array<T | undefined>(capacity)
    this.#head = 0
    this.#size = 0
    for (const item of kept) this.push(item)
  }

  clear(): void {
    this.#items = new Array<T | undefined>(this.capacity)
    this.#head = 0
    this.#size = 0
  }
}
