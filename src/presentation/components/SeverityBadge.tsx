import { memo } from 'react'
import type { Severity } from '../../domain/event'
import { SEVERITY_LABEL } from '../format/labels'
import { SeverityGlyph } from './Icons'

/** Severity shown with a colour, an icon and a label, so colour is never the only cue. */
export const SeverityBadge = memo(function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`badge badge--${severity}`}>
      <SeverityGlyph severity={severity} />
      {SEVERITY_LABEL[severity]}
    </span>
  )
})
