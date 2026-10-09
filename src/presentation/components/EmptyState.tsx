import type { ReactNode } from 'react'

interface EmptyStateProps {
  readonly title: string
  readonly description?: string
  readonly action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {description && <p className="empty__description">{description}</p>}
      {action}
    </div>
  )
}
