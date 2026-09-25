import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { warnNonCommercialDependencies } from './config/licensing'
import { log } from './debug/log'

log.info('app', 'start', {
  viewport: `${innerWidth}x${innerHeight}@${devicePixelRatio}x`,
  userAgent: navigator.userAgent,
})
warnNonCommercialDependencies()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
