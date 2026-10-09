import type { FailureReason, FeedStatus, Severity } from '../../domain/event'

export const SEVERITY_LABEL: Readonly<Record<Severity, string>> = {
  info: 'Info',
  warning: 'Warning',
  error: 'Error',
  critical: 'Critical',
}

export const STATUS_LABEL: Readonly<Record<FeedStatus, string>> = {
  idle: 'Idle',
  connecting: 'Connecting',
  live: 'Live',
  paused: 'Paused',
  reconnecting: 'Reconnecting',
  error: 'Offline',
}

/** User-facing failure copy. Deliberately generic: no URLs, codes or server text. */
export const FAILURE_TEXT: Readonly<Record<FailureReason, string>> = {
  network: 'Connection lost',
  timeout: 'Connection timed out',
  stale: 'Feed stalled (no data received)',
  auth: 'Not authorised to access the feed',
  protocol: 'The feed sent an unexpected response',
  manual: 'Connection dropped',
}
