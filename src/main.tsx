import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { CLIENT_BRAND } from '@/config/client'

/**
 * index.html is shared by every client build, so its <link rel="icon"> cannot name
 * one client's file — the Hermanos tab would carry the Sterling mark. Point it at
 * the selected client's mark once, before first paint.
 */
const icon = document.querySelector<HTMLLinkElement>("link[rel='icon']")
if (icon) icon.href = CLIENT_BRAND.mark

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
