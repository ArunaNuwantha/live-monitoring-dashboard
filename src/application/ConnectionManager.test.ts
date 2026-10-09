import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeTransport } from '../test/fakeTransport'
import { ConnectionManager } from './ConnectionManager'

const backoff = { baseMs: 1_000, maxMs: 8_000, factor: 2 }

function setup(overrides: Partial<ConstructorParameters<typeof ConnectionManager>[0]> = {}) {
  const transport = new FakeTransport()
  const onMessage = vi.fn()
  const manager = new ConnectionManager({
    transport,
    onMessage,
    backoff,
    maxAttempts: 3,
    random: () => 1, // deterministic: delay = full exponential step
    ...overrides,
  })
  return { transport, onMessage, manager, state: () => manager.state.get() }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('ConnectionManager', () => {
  it('goes connecting → live and forwards messages', () => {
    const { transport, onMessage, manager, state } = setup()
    manager.start()
    expect(state().state).toBe('connecting')
    transport.last.handlers.onOpen()
    expect(state().state).toBe('live')
    transport.last.handlers.onMessage('frame')
    expect(onMessage).toHaveBeenCalledWith('frame')
  })

  it('reconnects with exponential backoff, then gives up with an error state', () => {
    const { transport, manager, state } = setup()
    manager.start()
    transport.last.handlers.onOpen()

    transport.last.handlers.onClose('network')
    expect(state()).toMatchObject({ state: 'reconnecting', attempt: 1, lastFailure: 'network' })
    vi.advanceTimersByTime(999)
    expect(transport.connections).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(transport.connections).toHaveLength(2)

    transport.last.handlers.onClose('network')
    vi.advanceTimersByTime(2_000)
    expect(transport.connections).toHaveLength(3)

    transport.last.handlers.onClose('network')
    vi.advanceTimersByTime(4_000)
    expect(transport.connections).toHaveLength(4)

    transport.last.handlers.onClose('network')
    expect(state()).toMatchObject({ state: 'error', nextRetryAt: null })
    vi.advanceTimersByTime(60_000)
    expect(transport.connections).toHaveLength(4) // no runaway retries
  })

  it('does not reset the retry budget for a flapping connection', () => {
    const { transport, manager, state } = setup({ stableAfterMs: 5_000 })
    manager.start()
    for (let i = 1; i <= 2; i++) {
      transport.last.handlers.onOpen()
      vi.advanceTimersByTime(100) // up briefly, not "stable"
      transport.last.handlers.onClose('network')
      expect(state().attempt).toBe(i)
      vi.runOnlyPendingTimers()
    }
  })

  it('resets the retry budget once a connection is stable', () => {
    const { transport, manager, state } = setup({ stableAfterMs: 5_000 })
    manager.start()
    transport.last.handlers.onClose('network')
    vi.runOnlyPendingTimers()
    transport.last.handlers.onOpen()
    expect(state().attempt).toBe(1)
    transport.last.handlers.onMessage('x')
    vi.advanceTimersByTime(5_000)
    expect(state().attempt).toBe(0)
  })

  it('treats auth failures as fatal (no retry loop with a bad token)', () => {
    const { transport, manager, state } = setup()
    manager.start()
    transport.last.handlers.onClose('auth')
    expect(state()).toMatchObject({ state: 'error', lastFailure: 'auth' })
    vi.advanceTimersByTime(60_000)
    expect(transport.connections).toHaveLength(1)
  })

  it('abandons an attempt that never opens', () => {
    const { transport, manager, state } = setup({ connectTimeoutMs: 3_000 })
    manager.start()
    vi.advanceTimersByTime(3_000)
    expect(transport.connections[0].closed).toBe(true)
    expect(state()).toMatchObject({ state: 'reconnecting', lastFailure: 'timeout' })
  })

  it('detects a stalled live connection with the watchdog', () => {
    const { transport, manager, state } = setup({ staleAfterMs: 4_000 })
    manager.start()
    transport.last.handlers.onOpen()
    vi.advanceTimersByTime(5_000)
    expect(transport.connections[0].closed).toBe(true)
    expect(state()).toMatchObject({ state: 'reconnecting', lastFailure: 'stale' })
  })

  it('ignores late callbacks from a superseded connection', () => {
    const { transport, onMessage, manager, state } = setup()
    manager.start()
    const old = transport.last
    old.handlers.onClose('network')
    vi.runOnlyPendingTimers()
    transport.last.handlers.onOpen()

    old.handlers.onMessage('stale frame')
    old.handlers.onClose('network')
    expect(onMessage).not.toHaveBeenCalled()
    expect(state().state).toBe('live')
  })

  it('retryNow skips the backoff and recovers from error', () => {
    const { transport, manager, state } = setup({ maxAttempts: 0 })
    manager.start()
    transport.last.handlers.onClose('network')
    expect(state().state).toBe('error')
    manager.retryNow()
    expect(state().state).toBe('connecting')
    expect(transport.connections).toHaveLength(2)
  })

  it('stop() closes the connection and cancels pending retries', () => {
    const { transport, manager, state } = setup()
    manager.start()
    transport.last.handlers.onClose('network')
    manager.stop()
    vi.advanceTimersByTime(60_000)
    expect(transport.connections).toHaveLength(1)
    expect(state().state).toBe('idle')
  })
})
