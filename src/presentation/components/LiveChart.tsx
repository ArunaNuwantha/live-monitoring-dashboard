import { memo, useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { ChartSeries } from '../../domain/metrics'
import { formatClock, formatCompact } from '../format/format'
import { useColorScheme } from '../hooks/useColorScheme'

interface LiveChartProps {
  readonly title: string
  readonly unit: string
  readonly data: ChartSeries
  /** CSS custom property holding the series colour, e.g. "--series-1". */
  readonly colorToken: string
  /** Charts with the same key share a crosshair. */
  readonly syncKey: string
  readonly height?: number
  readonly description: string
}

const css = (el: Element, token: string) => getComputedStyle(el).getPropertyValue(token).trim()

/** "#rrggbb" + alpha → rgba(); canvas fillStyle cannot resolve CSS variables or color-mix. */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/**
 * Canvas time-series chart (uPlot) driven imperatively.
 *
 * React owns the container only. New data goes straight to `plot.setData()`,
 * with no virtual-DOM diff and no SVG node per point, so a 900-point series
 * redraws in well under a millisecond. The hover readout is also written
 * imperatively, so moving the cursor never triggers a React render.
 */
export const LiveChart = memo(function LiveChart({
  title,
  unit,
  data,
  colorToken,
  syncKey,
  height = 190,
  description,
}: LiveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const readoutRef = useRef<HTMLSpanElement>(null)
  const plotRef = useRef<uPlot | null>(null)
  const dataRef = useRef(data)
  const scheme = useColorScheme()

  // Keep the latest data available for (re)creation without making it a creation dependency.
  useEffect(() => {
    dataRef.current = data
  }, [data])

  // Create the plot once per colour scheme / height; colours are read from design tokens.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const color = css(el, colorToken)
    const axis = { stroke: css(el, '--text-muted'), grid: { stroke: css(el, '--chart-grid'), width: 1 }, ticks: { show: false } }

    const updateReadout = (u: uPlot) => {
      const readout = readoutRef.current
      if (!readout) return
      const xs = u.data[0]
      const idx = u.cursor.idx ?? xs.length - 1
      const y = u.data[1][idx]
      readout.textContent =
        idx < 0 || xs[idx] === undefined ? '' : `${y == null ? '—' : `${formatCompact(y)} ${unit}`} · ${formatClock(xs[idx] * 1000)}`
    }

    const plot = new uPlot(
      {
        width: el.clientWidth || 300,
        height,
        legend: { show: false },
        padding: [8, 8, 0, 0],
        cursor: { sync: { key: syncKey }, drag: { x: false, y: false }, points: { size: 8, fill: color } },
        scales: {
          x: { time: true },
          y: { range: (_u, _min, max) => [0, max > 0 ? max * 1.15 : 1] },
        },
        axes: [
          { ...axis, space: 90, values: (_u, splits) => splits.map((v) => formatClock(v * 1000)) },
          { ...axis, size: 52, values: (_u, splits) => splits.map((v) => formatCompact(v)) },
        ],
        series: [{}, { stroke: color, width: 2, fill: withAlpha(color, 0.1), points: { show: false }, spanGaps: false }],
        hooks: { setCursor: [updateReadout], setData: [updateReadout] },
      },
      dataRef.current,
      el,
    )
    plotRef.current = plot

    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width)
      if (width > 0 && width !== plot.width) plot.setSize({ width, height })
    })
    observer.observe(el)

    return () => {
      observer.disconnect()
      plot.destroy()
      plotRef.current = null
    }
  }, [scheme, height, colorToken, syncKey, unit])

  // Hot path: push new data into the existing canvas.
  useEffect(() => {
    plotRef.current?.setData(data)
  }, [data])

  return (
    <figure className="chart">
      <figcaption className="chart__header">
        <span className="chart__title">
          <span className="chart__key" style={{ background: `var(${colorToken})` }} aria-hidden="true" />
          {title}
        </span>
        <span className="chart__readout" ref={readoutRef} aria-hidden="true" />
      </figcaption>
      <div className="chart__canvas" ref={containerRef} role="img" aria-label={description} style={{ height }} />
    </figure>
  )
})
