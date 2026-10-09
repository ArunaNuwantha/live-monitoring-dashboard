import { describe, expect, it } from 'vitest'
import { backoffDelay } from './backoff'
import { RingBuffer } from './RingBuffer'

describe('RingBuffer', () => {
  it('never grows past capacity and reports evictions', () => {
    const buffer = new RingBuffer<number>(3)
    const evictions = [1, 2, 3, 4, 5].map((n) => buffer.push(n))
    expect(evictions).toEqual([false, false, false, true, true])
    expect(buffer.size).toBe(3)
    expect(buffer.toArrayNewestFirst()).toEqual([5, 4, 3])
  })

  it('resizes keeping the newest items', () => {
    const buffer = new RingBuffer<number>(5)
    for (let i = 1; i <= 5; i++) buffer.push(i)
    buffer.resize(2)
    expect(buffer.toArrayNewestFirst()).toEqual([5, 4])
    buffer.resize(4)
    buffer.push(6)
    expect(buffer.toArrayNewestFirst()).toEqual([6, 5, 4])
  })

  it('stays bounded under a large flood', () => {
    const buffer = new RingBuffer<number>(1_000)
    for (let i = 0; i < 1_000_000; i++) buffer.push(i)
    expect(buffer.size).toBe(1_000)
    expect(buffer.toArrayNewestFirst(1)).toEqual([999_999])
  })

  it('rejects invalid capacity', () => {
    expect(() => new RingBuffer(0)).toThrow(RangeError)
  })
})

describe('backoffDelay', () => {
  const opts = { baseMs: 500, maxMs: 30_000, factor: 2 }

  it('grows exponentially within [d/2, d]', () => {
    expect(backoffDelay(1, opts, () => 0)).toBe(250)
    expect(backoffDelay(1, opts, () => 1)).toBe(500)
    expect(backoffDelay(4, opts, () => 0)).toBe(2_000)
    expect(backoffDelay(4, opts, () => 1)).toBe(4_000)
  })

  it('is capped and never collapses to zero', () => {
    expect(backoffDelay(50, opts, () => 1)).toBe(30_000)
    expect(backoffDelay(50, opts, () => 0)).toBe(15_000)
  })
})
