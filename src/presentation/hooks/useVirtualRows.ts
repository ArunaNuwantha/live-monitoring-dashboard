import { useCallback, useEffect, useRef, useState } from 'react'

export interface VirtualRange {
  /** Callback ref for the scrolling viewport element. */
  readonly ref: (element: HTMLElement | null) => void
  readonly element: HTMLElement | null
  /** First rendered index (inclusive). */
  readonly start: number
  /** Last rendered index (exclusive). */
  readonly end: number
  readonly totalHeight: number
  readonly scrollTop: number
  readonly onScroll: () => void
  /** Sets scroll position and range in the same commit (avoids a blank frame). */
  readonly scrollTo: (top: number) => void
}

/**
 * Fixed-row-height windowing. Only visible rows plus `overscan` are mounted,
 * so DOM size stays constant whether the list holds 50 or 50,000 items.
 * Scroll updates are coalesced to one per animation frame.
 */
export function useVirtualRows(count: number, rowHeight: number, overscan = 6): VirtualRange {
  const [element, setElement] = useState<HTMLElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const frame = useRef(0)
  // State drives effects; the ref is for imperative DOM writes (scrollTop).
  const elementRef = useRef<HTMLElement | null>(null)

  const ref = useCallback((el: HTMLElement | null) => {
    elementRef.current = el
    setElement(el)
    setScrollTop(el?.scrollTop ?? 0)
  }, [])

  useEffect(() => {
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setViewportHeight(entry.contentRect.height))
    observer.observe(element)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame.current)
    }
  }, [element])

  const onScroll = useCallback(() => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      if (elementRef.current) setScrollTop(elementRef.current.scrollTop)
    })
  }, [])

  const scrollTo = useCallback((top: number) => {
    const el = elementRef.current
    if (!el) return
    el.scrollTop = top
    setScrollTop(el.scrollTop)
  }, [])

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const visible = Math.ceil(viewportHeight / rowHeight) + overscan * 2
  const end = Math.min(count, start + visible)

  return { ref, element, start, end, totalHeight: count * rowHeight, scrollTop, onScroll, scrollTo }
}
