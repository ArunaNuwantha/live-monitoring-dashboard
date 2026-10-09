import { act, fireEvent, render, screen } from '@testing-library/react'
import { Profiler, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SEVERITIES } from '../../domain/event'
import { LiveFeed } from '../../application/LiveFeed'
import type { Services } from '../../infrastructure/createServices'
import { FakeTransport, frame } from '../../test/fakeTransport'
import { ServicesProvider } from '../context/ServicesProvider'
import { ConnectionBar } from './ConnectionBar'
import { EventsList } from './EventsList'
import { KpiCards } from './KpiCards'

function renderWithFeed(ui: ReactNode) {
  const transport = new FakeTransport()
  const feed = new LiveFeed({ transport, settings: { flushIntervalMs: 250 } })
  const services: Services = { feed, simulator: null, configWarning: null }
  const view = render(<ServicesProvider services={services}>{ui}</ServicesProvider>)
  act(() => transport.last.handlers.onOpen())
  const send = (raw: unknown) => transport.last.handlers.onMessage(raw)
  const flush = (ms = 250) => act(() => vi.advanceTimersByTime(ms))
  return { ...view, feed, transport, send, flush }
}

const allSeverities = new Set(SEVERITIES)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('EventsList security', () => {
  it('renders hostile stream text as inert text, never as markup', () => {
    const payload = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>'
    const { container, send, flush } = renderWithFeed(
      <EventsList windowSeconds={300} severities={allSeverities} query="" onResetFilters={() => {}} />,
    )
    send(frame({ message: payload, severity: 'warning' }))
    flush()

    expect(screen.getByText(payload)).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('shows an empty state when filters exclude everything, with a working reset', () => {
    const onReset = vi.fn()
    const { send, flush } = renderWithFeed(
      <EventsList windowSeconds={300} severities={new Set()} query="" onResetFilters={onReset} />,
    )
    send(frame())
    flush()
    expect(screen.getByText('No matching events')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(onReset).toHaveBeenCalled()
  })

  it('virtualises: renders a bounded number of rows for a large buffer', () => {
    const { container, send, flush } = renderWithFeed(
      <EventsList windowSeconds={300} severities={allSeverities} query="" onResetFilters={() => {}} />,
    )
    for (let i = 0; i < 3_000; i++) send(frame())
    flush()
    const rows = container.querySelectorAll('li.event')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThan(40)
    expect(screen.getByText(/3,000 in last/)).toBeInTheDocument()
  })
})

describe('render budget under load', () => {
  it('KPI row commits once per flush, not once per message', () => {
    let commits = 0
    const { send, flush } = renderWithFeed(
      <Profiler id="kpis" onRender={() => commits++}>
        <KpiCards windowSeconds={60} severities={allSeverities} />
      </Profiler>,
    )
    flush() // settle initial render
    commits = 0

    // 2,000 messages over one second.
    for (let t = 0; t < 1_000; t += 10) {
      for (let i = 0; i < 20; i++) send(frame())
      act(() => vi.advanceTimersByTime(10))
    }

    expect(commits).toBeGreaterThan(0)
    expect(commits).toBeLessThanOrEqual(4)
  })
})

describe('ConnectionBar', () => {
  it('reflects pause and connection loss', () => {
    const { transport } = renderWithFeed(<ConnectionBar />)
    expect(screen.getByRole('status')).toHaveTextContent('Live')

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByRole('status')).toHaveTextContent('Paused')
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))

    act(() => transport.last.handlers.onClose('network'))
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting')
    expect(screen.getByText(/Connection lost/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry now' })).toBeInTheDocument()
  })
})
