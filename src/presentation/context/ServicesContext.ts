import { createContext } from 'react'
import type { Services } from '../../infrastructure/createServices'

/**
 * Dependency-injection seam. Components receive services from the composition root
 * through context instead of importing singletons, which keeps them testable with fakes.
 */
export const ServicesContext = createContext<Services | null>(null)
