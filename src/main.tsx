import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Material Design Lite ships its CSS with the npm package; the project's own
import 'material-design-lite/dist/material.brown-teal.min.css'
import '../css/main.css'
import App from './App'

/**
 * Application bootstrap.
 *
 * Engine wiring lives in `src/legacy/`:
 *   gsapLegacy.ts       GSAP 2 style `TweenLite` facade over npm gsap
 *   twixLegacy.ts       fetch based ajax helper
 *   loadLegacyEngine.ts sequential, once-only loader
 */
const container = document.getElementById('react-root')

if (!container) {
  throw new Error('Missing #react-root mount point in index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
