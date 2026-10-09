import { memo, useEffect, useState } from 'react'
import { formatCompact, formatInteger } from '../format/format'
import { useFeedHealth } from '../hooks/useFeedData'

/**
 * Live pipeline diagnostics. This is the proof that the batching works:
 * ingest can run at thousands of frames per second while UI publishes stay
 * at the configured flush rate.
 */
export const PerfFooter = memo(function PerfFooter() {
  const ingest = useFeedHealth((h) => h.ingestPerSecond)
  const publishes = useFeedHealth((h) => h.publishesPerSecond)
  const size = useFeedHealth((h) => h.bufferSize)
  const capacity = useFeedHealth((h) => h.bufferCapacity)
  const rejected = useFeedHealth((h) => h.rejected)
  const shed = useFeedHealth((h) => h.shed)
  const evicted = useFeedHealth((h) => h.evicted)

  return (
    <footer className="perf" aria-label="Pipeline diagnostics">
      <Stat label="Ingest" value={`${formatCompact(ingest)}/s`} />
      <Stat label="UI updates" value={`${publishes}/s`} />
      <Fps />
      <Stat label="Buffer" value={`${formatInteger(size)} / ${formatInteger(capacity)}`} />
      <Stat label="Evicted" value={formatCompact(evicted)} />
      <Stat label="Rejected" value={formatCompact(rejected)} tone={rejected > 0 ? 'warning' : undefined} />
      <Stat label="Shed" value={formatCompact(shed)} tone={shed > 0 ? 'warning' : undefined} />
    </footer>
  )
})

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  return (
    <span className="perf__stat">
      <span className="perf__label">{label}</span>
      <span className={`perf__value${tone ? ` perf__value--${tone}` : ''}`}>{value}</span>
    </span>
  )
}

/** Frame-rate meter: counts animation frames and commits once per second. */
function Fps() {
  const [fps, setFps] = useState<number | null>(null)

  useEffect(() => {
    let frames = 0
    let last = performance.now()
    let id = requestAnimationFrame(function loop(now) {
      frames++
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)))
        frames = 0
        last = now
      }
      id = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(id)
  }, [])

  return <Stat label="FPS" value={fps === null ? '—' : String(fps)} />
}
