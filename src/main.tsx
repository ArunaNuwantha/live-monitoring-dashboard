import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { loadConfig } from './infrastructure/config'
import { createServices } from './infrastructure/createServices'
import { ServicesProvider } from './presentation/context/ServicesProvider'
import './presentation/styles/global.css'

// Composition root: the only place that knows which concrete adapters are in use.
const services = createServices(loadConfig())

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

createRoot(root).render(
  <StrictMode>
    <ServicesProvider services={services}>
      <App />
    </ServicesProvider>
  </StrictMode>,
)
