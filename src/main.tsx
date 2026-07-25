import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { auditPlaces, logDataAudit } from './lib/places/audit'
import { PLACES } from './data/places'
import './index.css'
import App from './App.tsx'

if (import.meta.env.DEV) {
  logDataAudit(auditPlaces(undefined, PLACES))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
