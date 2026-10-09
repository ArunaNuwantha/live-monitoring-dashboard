import { memo, useId } from 'react'
import { SEVERITIES, TIME_WINDOWS, type Severity, type TimeWindow } from '../../domain/event'
import { formatWindow } from '../format/format'
import { SEVERITY_LABEL } from '../format/labels'
import { MAX_QUERY_LENGTH, type DashboardFilterActions, type DashboardFilters } from '../hooks/useDashboardFilters'
import { SearchIcon, SeverityGlyph } from './Icons'
import { SettingsPanel } from './SettingsPanel'

interface FilterBarProps {
  readonly filters: DashboardFilters
  readonly actions: DashboardFilterActions
}

/** Window, severity and search filters, in one row above the widgets they control. */
export const FilterBar = memo(function FilterBar({ filters, actions }: FilterBarProps) {
  const searchId = useId()

  return (
    <div className="filters" role="toolbar" aria-label="Dashboard filters">
      <div className="segmented" role="radiogroup" aria-label="Time window">
        {TIME_WINDOWS.map((w: TimeWindow) => (
          <button
            key={w}
            type="button"
            role="radio"
            aria-checked={filters.windowSeconds === w}
            className="segmented__item"
            onClick={() => actions.setWindow(w)}
          >
            {formatWindow(w)}
          </button>
        ))}
      </div>

      <div className="chips" role="group" aria-label="Severity">
        {SEVERITIES.map((s: Severity) => (
          <button
            key={s}
            type="button"
            className={`chip chip--${s}`}
            aria-pressed={filters.severities.has(s)}
            onClick={() => actions.toggleSeverity(s)}
          >
            <SeverityGlyph severity={s} />
            {SEVERITY_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="search">
        <label htmlFor={searchId} className="visually-hidden">
          Search events
        </label>
        <SearchIcon />
        <input
          id={searchId}
          type="search"
          placeholder="Search message or service"
          autoComplete="off"
          spellCheck={false}
          maxLength={MAX_QUERY_LENGTH}
          value={filters.query}
          onChange={(e) => actions.setQuery(e.target.value)}
        />
      </div>

      <SettingsPanel />
    </div>
  )
})
