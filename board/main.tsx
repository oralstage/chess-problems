import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import '../embed/embed.css'
import { EmbedApp } from '../embed/EmbedApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EmbedApp variant="plain" />
  </StrictMode>,
)
