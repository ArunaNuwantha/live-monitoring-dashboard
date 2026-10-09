import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeTransport, frame } from '../test/fakeTransport'
import { LiveFeed, type LiveFeedOptions } from './LiveFeed'

function setup(options: Partial<LiveFeedOptions> = {}) {
  const transport = new FakeTransport()
  const feed = new LiveFeed({ transport, settings: { flushIntervalMs: 250, bufferCapacity: 1_000 }, ...options })
  feed.start()
  transport.last.handlers.onOpen()
  const send = (n: number, patch?: Record<string, unknown>) => {
    for (let i = 0; i < n; i++) transport.last.handlers.onMessage(frame(patch))
  }
  return { feed, transport, send }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('LiveFeed batching', () => {
  it('publishes at most once per flush interval regardless of message rate', () => {
    const { feed, send } = setup()
    const listener = vi.fn()
    feed.data.subscribe(listener)

    // 5,000 messages spread across one second, i.e. 5,000 msg/s.
    for (let t = 0; t < 1_000; t += 10) {
      send(50)
      vi.advanceTimersByTime(10)
    }

    expect(feed.data.get().totalAccepted).toBe(5_000)
    expect(listener.mock.calls.length).toBeLessThanOrEqual(4) // 1000 ms / 250 ms
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('does not publish when nothing changed, except a 1 s heartbeat that slides the window', () => {
    const { feed } = setup()
    const listener = vi.fn()
    feed.data.subscribe(listener)
    vi.advanceTimersByTime(999)
    expect(listener).toHaveBeenCalledTimes(0)
    vi.advanceTimersByTime(250)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('reuses the events array on heartbeat publishes (cheap for list consumers)', () => {
    const { feed, send } = setup()
    send(3)
    vi.advanceTimersByTime(250)
    const events = feed.data.get().events
    vi.advanceTimersByTime(1_250)
    expect(feed.data.get().events).toBe(events)
  })
})

describe('LiveFeed bounded memory and backpressure', () => {
  it('keeps at most bufferCapacity events and counts evictions', () => {
    const { feed, send } = setup({ settings: { bufferCapacity: 100, flushIntervalMs: 250 } })
    send(10_000)
    vi.advanceTimersByTime(250)
    expect(feed.data.get().events).toHaveLength(100)
    expect(feed.health.get()).toMatchObject({ accepted: 10_000, evicted: 9_900, bufferSize: 100 })
  })

  it('sheds load beyond the per-second ingest ceiling without parsing it', () => {
    const { feed, send } = setup({ maxIngestPerSecond: 500 })
    send(2_000)
    vi.advanceTimersByTime(250)
    expect(feed.health.get()).toMatchObject({ received: 2_000, accepted: 500, shed: 1_500 })
  })

  it('counts malformed frames as rejected and keeps going', () => {
    const { feed, transport, send } = setup()
    transport.last.handlers.onMessage('{"broken": ')
    transport.last.handlers.onMessage(new ArrayBuffer(4))
    send(1, { severity: 'nope' })
    send(2)
    vi.advanceTimersByTime(250)
    expect(feed.health.get()).toMatchObject({ rejected: 3, accepted: 2 })
    expect(feed.data.get().events).toHaveLength(2)
  })

  it('assigns unique sequence keys even when source ids repeat', () => {
    const { feed, send } = setup()
    send(3, { id: 'same' })
    vi.advanceTimersByTime(250)
    const seqs = feed.data.get().events.map((e) => e.seq)
    expect(new Set(seqs).size).toBe(3)
  })

  it('clamps settings to safe bounds', () => {
    const { feed } = setup()
    feed.updateSettings({ bufferCapacity: 10_000_000, flushIntervalMs: 1 })
    expect(feed.control.get().settings).toEqual({ bufferCapacity: 100_000, flushIntervalMs: 50 })
  })
})

describe('LiveFeed pause / resume', () => {
  it('freezes the dashboard snapshot while still collecting data', () => {
    const { feed, send } = setup()
    send(5)
    vi.advanceTimersByTime(250)
    const frozen = feed.data.get()

    feed.pause()
    send(20)
    vi.advanceTimersByTime(2_000)
    expect(feed.data.get()).toBe(frozen)
    expect(feed.health.get().backlog).toBe(20)

    feed.resume()
    expect(feed.data.get().totalAccepted).toBe(25)
    expect(feed.data.get().events).toHaveLength(25)
    expect(feed.health.get().backlog).toBe(0)
  })
})
