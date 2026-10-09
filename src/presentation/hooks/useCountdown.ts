import { useEffect, useState } from 'react'

/**
 * Seconds remaining until `target` (epoch ms), ticking locally.
 * Use it in a small leaf component so the tick re-renders only that leaf.
 */
export function useCountdown(target: number | null): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (target === null) return
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0) // sync immediately when a new target arrives
    const id = setInterval(tick, 250)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [target])

  return target === null ? 0 : Math.max(0, Math.ceil((target - now) / 1000))
}
