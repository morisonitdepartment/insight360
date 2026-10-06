import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { CLIENT, CLIENT_BRAND } from '@/config/client'

/**
 * Paint the client's accent onto the document before React renders.
 *
 * Tailwind's `teal-*` scale reads these variables, so this is what re-colours the
 * whole interface for a given client. index.css carries the same ramp as a
 * fallback, so a failure here degrades to the default accent rather than to an
 * unstyled page.
 */
for (const [step, hex] of Object.entries(CLIENT.accent.ramp)) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) continue
  const rgb = [m[1], m[2], m[3]].map((h) => parseInt(h, 16)).join(' ')
  document.documentElement.style.setProperty(`--accent-${step}`, rgb)
}

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
