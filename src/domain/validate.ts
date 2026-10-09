import { SEVERITIES, type EventPayload, type Severity } from './event'

/**
 * Untrusted input → trusted entity.
 *
 * Every message from the stream goes through `parseMessage`. It never throws,
 * never mutates the input, and builds a fresh object from an allow-list of
 * fields, so unknown keys (including `__proto__` / `constructor`) never reach
 * the app.
 */

export const LIMITS = {
  /** Raw frame size cap, checked before JSON.parse (UTF-16 code units). */
  maxRawLength: 8 * 1024,
  maxIdLength: 64,
  maxServiceLength: 48,
  maxMessageLength: 280,
  maxLatencyMs: 120_000,
  /** Source timestamps further than this from the client clock are replaced by the receive time. */
  maxClockSkewMs: 5 * 60_000,
} as const

export type RejectReason = 'not-text' | 'too-large' | 'invalid-json' | 'not-object' | 'invalid-field'

export type ParseResult =
  | { readonly ok: true; readonly value: EventPayload }
  | { readonly ok: false; readonly reason: RejectReason }

const ID_PATTERN = /^[A-Za-z0-9_-]+$/
const SERVICE_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i

/**
 * C0/C1 control characters, zero-width characters and Unicode bidi overrides.
 * Bidi overrides can visually reorder text ("Trojan Source"-style spoofing).
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g

const reject = (reason: RejectReason): ParseResult => ({ ok: false, reason })

/** Reads an own property only; never walks the prototype chain. */
const own = (record: object, key: string): unknown =>
  Object.hasOwn(record, key) ? (record as Record<string, unknown>)[key] : undefined

/**
 * Normalises free text for display: strips control and bidi characters,
 * collapses whitespace, and truncates on code-point boundaries.
 * Returns null when nothing printable is left.
 */
export function sanitizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(UNSAFE_CHARS, ' ').replace(/\s+/g, ' ').trim()
  if (cleaned.length === 0) return null
  if (cleaned.length <= maxLength) return cleaned
  const codePoints = Array.from(cleaned)
  return codePoints.length <= maxLength ? cleaned : `${codePoints.slice(0, maxLength - 1).join('')}…`
}

function parseIdentifier(value: unknown, maxLength: number, pattern: RegExp): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) return null
  return pattern.test(value) ? value : null
}

function parseSeverity(value: unknown): Severity | null {
  return typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value)
    ? (value as Severity)
    : null
}

function parseLatency(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < 0 || value > LIMITS.maxLatencyMs) return null
  return Math.round(value * 10) / 10
}

function parseTimestamp(value: unknown, now: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return now
  return Math.abs(value - now) > LIMITS.maxClockSkewMs ? now : value
}

/** Validates an already-decoded value against the event schema. */
export function validateEvent(value: unknown, now: number): ParseResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return reject('not-object')

  const id = parseIdentifier(own(value, 'id'), LIMITS.maxIdLength, ID_PATTERN)
  const service = parseIdentifier(own(value, 'service'), LIMITS.maxServiceLength, SERVICE_PATTERN)
  const severity = parseSeverity(own(value, 'severity'))
  const latencyMs = parseLatency(own(value, 'latencyMs'))
  const message = sanitizeText(own(value, 'message'), LIMITS.maxMessageLength)

  if (id === null || service === null || severity === null || latencyMs === null || message === null) {
    return reject('invalid-field')
  }

  return {
    ok: true,
    value: {
      id,
      service: service.toLowerCase(),
      severity,
      latencyMs,
      message,
      timestamp: parseTimestamp(own(value, 'ts'), now),
    },
  }
}

/** Decodes and validates one raw frame from the transport. */
export function parseMessage(raw: unknown, now: number): ParseResult {
  if (typeof raw !== 'string') return reject('not-text')
  if (raw.length > LIMITS.maxRawLength) return reject('too-large')

  let decoded: unknown
  try {
    decoded = JSON.parse(raw)
  } catch {
    return reject('invalid-json')
  }
  return validateEvent(decoded, now)
}
