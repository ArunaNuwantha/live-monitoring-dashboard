/**
 * Domain entities and value types.
 *
 * This layer is pure TypeScript: no React, no browser APIs, no I/O.
 * Everything else depends on it; it depends on nothing.
 */

export const SEVERITIES = ['info', 'warning', 'error', 'critical'] as const
export type Severity = (typeof SEVERITIES)[number]
export const SEVERITY_COUNT = SEVERITIES.length

export const severityIndex = (severity: Severity): number => SEVERITIES.indexOf(severity)

/** Fields that survived validation of an untrusted wire message. */
export interface EventPayload {
  readonly id: string
  /** Source timestamp (epoch ms), clamped to a sane skew from the client clock. */
  readonly timestamp: number
  readonly service: string
  readonly severity: Severity
  readonly latencyMs: number
  readonly message: string
}

/** A validated event as held by the client. */
export interface MonitorEvent extends EventPayload {
  /**
   * Client-assigned, strictly increasing sequence number. Used as the React key:
   * source ids are untrusted and may collide or repeat.
   */
  readonly seq: number
  /** Client receive time (epoch ms). Windows and buckets use this, not the source clock. */
  readonly receivedAt: number
}

/** Transport-level connection lifecycle. */
export type ConnectionState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'error'

/** What the user sees: connection state, with "paused" layered on top of a live feed. */
export type FeedStatus = ConnectionState | 'paused'

export type FailureReason = 'network' | 'timeout' | 'stale' | 'auth' | 'protocol' | 'manual'

export const deriveFeedStatus = (state: ConnectionState, paused: boolean): FeedStatus =>
  paused && state === 'live' ? 'paused' : state

/** Selectable time windows, in seconds. The largest one sizes the time-bucket ring. */
export const TIME_WINDOWS = [60, 300, 900] as const
export type TimeWindow = (typeof TIME_WINDOWS)[number]
export const MAX_WINDOW_SECONDS = TIME_WINDOWS[TIME_WINDOWS.length - 1]
