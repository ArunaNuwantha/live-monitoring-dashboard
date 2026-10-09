export interface BackoffOptions {
  readonly baseMs: number
  readonly maxMs: number
  readonly factor: number
}

export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 500, maxMs: 30_000, factor: 2 }

/**
 * Exponential backoff with "equal jitter": half the delay is fixed and half is random.
 * Clients that dropped together spread out instead of reconnecting in lockstep,
 * and the delay never collapses to ~0, which would cause a tight reconnect loop.
 *
 * @param attempt 1-based retry number
 */
export function backoffDelay(attempt: number, options: BackoffOptions = DEFAULT_BACKOFF, random = Math.random): number {
  const exp = Math.min(options.maxMs, options.baseMs * options.factor ** Math.max(0, attempt - 1))
  return Math.round(exp / 2 + random() * (exp / 2))
}
