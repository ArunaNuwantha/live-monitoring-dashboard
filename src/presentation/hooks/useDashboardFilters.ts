import { useCallback, useMemo, useReducer } from 'react'
import { SEVERITIES, TIME_WINDOWS, type Severity, type TimeWindow } from '../../domain/event'

export interface DashboardFilters {
  readonly windowSeconds: TimeWindow
  readonly severities: ReadonlySet<Severity>
  /** Raw search input (trimmed and lower-cased at the point of use). */
  readonly query: string
}

export interface DashboardFilterActions {
  readonly setWindow: (window: TimeWindow) => void
  readonly toggleSeverity: (severity: Severity) => void
  readonly setQuery: (query: string) => void
  readonly reset: () => void
}

export const MAX_QUERY_LENGTH = 100

type Action =
  | { type: 'window'; window: TimeWindow }
  | { type: 'toggle'; severity: Severity }
  | { type: 'query'; query: string }
  | { type: 'reset' }

const INITIAL: DashboardFilters = { windowSeconds: TIME_WINDOWS[1], severities: new Set(SEVERITIES), query: '' }

function reducer(state: DashboardFilters, action: Action): DashboardFilters {
  switch (action.type) {
    case 'window':
      return state.windowSeconds === action.window ? state : { ...state, windowSeconds: action.window }
    case 'toggle': {
      const severities = new Set(state.severities)
      if (severities.has(action.severity)) severities.delete(action.severity)
      else severities.add(action.severity)
      return { ...state, severities }
    }
    case 'query':
      return { ...state, query: action.query.slice(0, MAX_QUERY_LENGTH) }
    case 'reset':
      return INITIAL
  }
}

/**
 * View state for the dashboard filters. This is UI state, so it lives in React,
 * not in the feed. Each filter keeps a stable identity until it changes,
 * so memoised widgets skip work when an unrelated filter moves.
 */
export function useDashboardFilters(): [DashboardFilters, DashboardFilterActions] {
  const [filters, dispatch] = useReducer(reducer, INITIAL)

  const setWindow = useCallback((window: TimeWindow) => dispatch({ type: 'window', window }), [])
  const toggleSeverity = useCallback((severity: Severity) => dispatch({ type: 'toggle', severity }), [])
  const setQuery = useCallback((query: string) => dispatch({ type: 'query', query }), [])
  const reset = useCallback(() => dispatch({ type: 'reset' }), [])

  const actions = useMemo(
    () => ({ setWindow, toggleSeverity, setQuery, reset }),
    [setWindow, toggleSeverity, setQuery, reset],
  )
  return [filters, actions]
}
