import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import { MakeApp } from './MakeApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MakeApp />
  </StrictMode>,
)
