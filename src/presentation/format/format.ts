/** Display formatting. Formatters are created once; Intl constructors are expensive. */

const integer = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
const oneDecimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 })
const clock = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})
const clockMs = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
  hour12: false,
})

export const formatInteger = (n: number): string => integer.format(n)
export const formatCompact = (n: number): string => (Math.abs(n) < 10_000 ? integer.format(n) : compact.format(n))
export const formatRate = (n: number): string => (n < 100 ? oneDecimal.format(n) : formatCompact(Math.round(n)))
export const formatPercent = (ratio: number): string => percent.format(ratio)
export const formatClock = (epochMs: number): string => clock.format(epochMs)
export const formatClockMs = (epochMs: number): string => clockMs.format(epochMs)

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

export function formatWindow(seconds: number): string {
  return seconds < 60 ? `${seconds} s` : `${seconds / 60} min`
}
