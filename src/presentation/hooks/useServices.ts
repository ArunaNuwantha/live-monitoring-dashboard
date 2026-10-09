import { useContext } from 'react'
import type { Services } from '../../infrastructure/createServices'
import { ServicesContext } from '../context/ServicesContext'

export function useServices(): Services {
  const services = useContext(ServicesContext)
  if (!services) throw new Error('useServices must be used inside <ServicesProvider>')
  return services
}
