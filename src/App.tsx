import { ConnectionBar } from './presentation/components/ConnectionBar'
import { EventsList } from './presentation/components/EventsList'
import { FilterBar } from './presentation/components/FilterBar'
import { PulseIcon } from './presentation/components/Icons'
import { KpiCards } from './presentation/components/KpiCards'
import { LiveCharts } from './presentation/components/LiveCharts'
import { PerfFooter } from './presentation/components/PerfFooter'
import { StatusBanners } from './presentation/components/StatusBanners'
import { useDashboardFilters } from './presentation/hooks/useDashboardFilters'

/**
 * Layout and filter state only. App never subscribes to live data, so it
 * re-renders only when a filter changes. Each widget subscribes to just the
 * slice it needs.
 */
export default function App() {
  const [filters, actions] = useDashboardFilters()
  const { windowSeconds, severities, query } = filters

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <PulseIcon />
          </span>
          <div>
            <h1 className="brand__title">Live Monitor</h1>
            <p className="brand__subtitle">Service events · all regions</p>
          </div>
        </div>
        <ConnectionBar />
      </header>

      <main className="content">
        <StatusBanners />
        <FilterBar filters={filters} actions={actions} />
        <KpiCards windowSeconds={windowSeconds} severities={severities} />
        <div className="grid">
          <LiveCharts windowSeconds={windowSeconds} severities={severities} />
          <EventsList windowSeconds={windowSeconds} severities={severities} query={query} onResetFilters={actions.reset} />
        </div>
      </main>

      <PerfFooter />
    </div>
  )
}
