import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import '../solve/sober.css'
import { AnalysisApp } from './AnalysisApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AnalysisApp />
  </StrictMode>,
)
