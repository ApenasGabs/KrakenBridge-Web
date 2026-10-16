import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './utils/pwaManager.ts'

// Inicializa o Service Worker para suporte a PWA e Web Push em segundo plano
if (typeof window !== 'undefined') {
  registerServiceWorker();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
