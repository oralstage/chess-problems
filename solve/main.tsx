import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import { SolveApp } from './SolveApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SolveApp />
  </StrictMode>,
)
