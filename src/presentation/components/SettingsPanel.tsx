import { memo, useEffect, useId, useRef } from 'react'
import { formatInteger } from '../format/format'
import { useLiveStream } from '../hooks/useLiveStream'
import { useServices } from '../hooks/useServices'
import { useStore } from '../hooks/useStore'
import { SettingsIcon } from './Icons'

const BUFFER_OPTIONS = [1_000, 5_000, 20_000, 50_000] as const
const FLUSH_OPTIONS = [100, 250, 500, 1_000] as const
const RATE_OPTIONS = [10, 200, 1_000, 5_000, 15_000] as const

/** Runtime tuning: buffer size, UI update throttle, and simulator load and fault injection. */
export const SettingsPanel = memo(function SettingsPanel() {
  const { feed, simulator } = useServices()
  const settings = useStore(feed.control, (c) => c.settings)
  const { simulateDrop } = useLiveStream()
  const ids = { buffer: useId(), flush: useId(), rate: useId(), chaos: useId() }
  const detailsRef = useRef<HTMLDetailsElement>(null)

  // Popover behaviour for native <details>: close on outside click or Escape.
  useEffect(() => {
    const close = (event: Event) => {
      const details = detailsRef.current
      if (!details?.open) return
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !details.contains(event.target as Node)) {
        details.open = false
      }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [])

  return (
    <details className="settings" ref={detailsRef}>
      <summary className="btn btn--ghost">
        <SettingsIcon /> Stream settings
      </summary>
      <div className="settings__panel">
        <div className="field">
          <label htmlFor={ids.buffer}>Event buffer</label>
          <select
            id={ids.buffer}
            value={settings.bufferCapacity}
            onChange={(e) => feed.updateSettings({ bufferCapacity: Number(e.target.value) })}
          >
            {BUFFER_OPTIONS.map((n) => (
              <option key={n} value={n}>
                Last {formatInteger(n)} events
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={ids.flush}>UI refresh</label>
          <select
            id={ids.flush}
            value={settings.flushIntervalMs}
            onChange={(e) => feed.updateSettings({ flushIntervalMs: Number(e.target.value) })}
          >
            {FLUSH_OPTIONS.map((ms) => (
              <option key={ms} value={ms}>
                Every {ms} ms ({Math.round(1000 / ms)}×/s)
              </option>
            ))}
          </select>
        </div>

        {simulator && <SimulatorFields ids={ids} />}

        <div className="settings__footer">
          <button type="button" className="btn btn--secondary btn--sm" onClick={simulateDrop}>
            Drop connection
          </button>
          <span className="hint">Test reconnection with backoff</span>
        </div>
      </div>
    </details>
  )
})

function SimulatorFields({ ids }: { ids: { rate: string; chaos: string } }) {
  const simulator = useServices().simulator!
  const sim = useStore(simulator.settings)

  return (
    <>
      <div className="field">
        <label htmlFor={ids.rate}>Simulated load</label>
        <select id={ids.rate} value={sim.rate} onChange={(e) => simulator.update({ rate: Number(e.target.value) })}>
          {!RATE_OPTIONS.includes(sim.rate as (typeof RATE_OPTIONS)[number]) && (
            <option value={sim.rate}>{formatInteger(sim.rate)} events/s</option>
          )}
          {RATE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {formatInteger(r)} events/s
            </option>
          ))}
        </select>
      </div>
      <label className="toggle" htmlFor={ids.chaos}>
        <input
          id={ids.chaos}
          type="checkbox"
          checked={sim.chaos}
          onChange={(e) => simulator.update({ chaos: e.target.checked })}
        />
        <span>
          Fault injection
          <span className="hint">Malformed and XSS frames, drops, stalls, bursts</span>
        </span>
      </label>
    </>
  )
}
