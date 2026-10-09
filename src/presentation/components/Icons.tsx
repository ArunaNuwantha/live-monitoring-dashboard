/** Static inline icons (authored here, never from the stream). Decorative: hidden from AT. */
import type { SVGProps } from 'react'

const base: SVGProps<SVGSVGElement> = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
}

export const PauseIcon = () => (
  <svg {...base}>
    <path d="M5.5 3.5v9M10.5 3.5v9" />
  </svg>
)

export const PlayIcon = () => (
  <svg {...base}>
    <path d="M5 3.5v9l7-4.5z" fill="currentColor" />
  </svg>
)

export const RetryIcon = () => (
  <svg {...base}>
    <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3" />
  </svg>
)

export const SettingsIcon = () => (
  <svg {...base}>
    <path d="M2.5 4.5h7M12.5 4.5h1M2.5 11.5h1M6.5 11.5h7" />
    <circle cx="11" cy="4.5" r="1.5" />
    <circle cx="5" cy="11.5" r="1.5" />
  </svg>
)

export const SearchIcon = () => (
  <svg {...base}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </svg>
)

export const ArrowUpIcon = () => (
  <svg {...base}>
    <path d="M8 13V3M4 7l4-4 4 4" />
  </svg>
)

export const PulseIcon = () => (
  <svg {...base} width={20} height={20}>
    <path d="M1.5 8.5h3l2-5 3 9 2-4h3" />
  </svg>
)

/** Severity glyphs so severity is never conveyed by colour alone. */
export const SeverityGlyph = ({ severity }: { severity: string }) => {
  switch (severity) {
    case 'critical':
      return (
        <svg {...base} width={12} height={12}>
          <path d="M8 1.5 14.5 13h-13zM8 6v3M8 11.2v.1" />
        </svg>
      )
    case 'error':
      return (
        <svg {...base} width={12} height={12}>
          <circle cx="8" cy="8" r="6" />
          <path d="m5.8 5.8 4.4 4.4M10.2 5.8l-4.4 4.4" />
        </svg>
      )
    case 'warning':
      return (
        <svg {...base} width={12} height={12}>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.8v3.6M8 10.9v.1" />
        </svg>
      )
    default:
      return (
        <svg {...base} width={12} height={12}>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 7.2v3.6M8 5v.1" />
        </svg>
      )
  }
}
