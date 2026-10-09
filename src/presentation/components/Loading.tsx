interface LoadingProps {
  readonly label?: string
}

/** Spinner with a visible label, announced politely to assistive tech. */
export function Loading({ label = 'Loading…' }: LoadingProps) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="loading__spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

/** Placeholder block for content that has not arrived yet. */
export function Skeleton({ width = '100%', height = 16 }: { width?: number | string; height?: number | string }) {
  return <span className="skeleton" style={{ width, height }} aria-hidden="true" />
}
