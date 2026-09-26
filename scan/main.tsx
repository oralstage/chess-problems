import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import '../solve/sober.css'
import { ScanApp } from './ScanApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ScanApp />
  </StrictMode>,
)
